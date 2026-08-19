import modal
 
# Cloud setup
app = modal.App("cinnamon-harvest-ensemble-eval")
 
# Define environment and dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch", "torchvision", "pillow", "numpy", "scikit-learn")
)
 
# Mount dataset volume
volume = modal.Volume.from_name("cinnamon-harvest-data", create_if_missing=False)
VOLUME_PATH = "/data"
 
# Ordinal mapping: maturity is continuous, not discrete buckets.
ORDINAL_MAP = {"immature": 0.0, "mature": 1.0, "overmature": 2.0}
CLASS_NAMES_BY_ORDINAL = ["Immature", "Optimal", "Over-mature"]
 
IMG_SIZE = 224
BATCH_SIZE = 16
DROPOUT_P = 0.3
SPLIT_SEED = 42
TEST_FRAC = 0.15
N_ENSEMBLE_MODELS = 5
 
# Standard ImageNet norm values
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]
 
DATA_ROOT = f"{VOLUME_PATH}/data"
ENSEMBLE_DIR = f"{VOLUME_PATH}/ensemble"
 
 
def build_kfold_splits(root, k=N_ENSEMBLE_MODELS, seed=SPLIT_SEED, test_frac=TEST_FRAC):

    import torch
    from torch.utils.data import Subset
    from torchvision import datasets, transforms
    from collections import defaultdict
    import random
 
    # Wrapper to yield float targets for regression
    class OrdinalImageFolder(datasets.ImageFolder):
        def __init__(self, root, transform):
            super().__init__(root, transform=transform)
            missing = set(self.classes) - set(ORDINAL_MAP.keys())
            if missing:
                raise ValueError(f"Folder name(s) {missing} not in ORDINAL_MAP")
            
            self.idx_to_ordinal = {
                self.class_to_idx[name]: ORDINAL_MAP[name] for name in self.classes
            }
 
        def __getitem__(self, index):
            img, class_idx = super().__getitem__(index)
            return img, torch.tensor(self.idx_to_ordinal[class_idx], dtype=torch.float32)
 
    # Train augmentations
    train_transform = transforms.Compose([
        transforms.RandomResizedCrop(IMG_SIZE, scale=(0.85, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(10),
        transforms.ColorJitter(brightness=0.15, contrast=0.15),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    
    # Eval transforms
    eval_transform = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
 
    full_train_view = OrdinalImageFolder(root, transform=train_transform)
    full_eval_view = OrdinalImageFolder(root, transform=eval_transform)
 
    # Group indices for stratified splitting
    class_to_indices = defaultdict(list)
    for idx, class_idx in enumerate(full_train_view.targets):
        class_to_indices[class_idx].append(idx)
 
    rng = random.Random(seed)
    test_indices = []
    fold_indices = [[] for _ in range(k)]
 
    for class_idx, indices in class_to_indices.items():
        indices = indices.copy()
        rng.shuffle(indices)
        
        n = len(indices)
        n_test = int(test_frac * n)
        
        test_indices += indices[:n_test]
        
        pool = indices[n_test:]
        for i, idx in enumerate(pool):
            fold_indices[i % k].append(idx)
 
    test_ds = Subset(full_eval_view, test_indices)
 
    # Generate K-fold train/val pairs
    folds = []
    for f in range(k):
        val_idx = fold_indices[f]
        train_idx = [idx for other in range(k) if other != f for idx in fold_indices[other]]
        
        train_ds = Subset(full_train_view, train_idx)
        val_ds = Subset(full_eval_view, val_idx)
        folds.append((train_ds, val_ds))
 
    return test_ds, folds
 
 
def build_model(dropout_p: float = DROPOUT_P):
    import torch.nn as nn
    from torchvision import models
 
    # Edge-friendly backbone
    backbone = models.mobilenet_v3_small(weights=None)
    in_features = backbone.classifier[0].in_features
 
    class HarvestReadinessNet(nn.Module):
        def __init__(self):
            super().__init__()
            self.features = backbone.features
            self.avgpool = backbone.avgpool
            
            # Custom regression head
            self.head = nn.Sequential(
                nn.Flatten(),
                nn.Linear(in_features, 128),
                nn.Hardswish(),
                nn.Dropout(p=dropout_p),
                nn.Linear(128, 64),
                nn.Hardswish(),
                nn.Dropout(p=dropout_p),
                nn.Linear(64, 1), # Output: single continuous value
            )
 
        def forward(self, x):
            x = self.features(x)
            x = self.avgpool(x)
            return self.head(x).squeeze(1)
 
    return HarvestReadinessNet()
 
 
@app.function(image=image, gpu="A10G", volumes={VOLUME_PATH: volume}, timeout=1800)
def evaluate(n_models: int = N_ENSEMBLE_MODELS):
    import torch
    import numpy as np
    from torch.utils.data import DataLoader
    from sklearn.metrics import confusion_matrix, mean_absolute_error
 
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Evaluating {n_models}-model ensemble (5-fold CV) on {device}")
 
    # Load pristine test set
    test_ds, _ = build_kfold_splits(DATA_ROOT, k=n_models, seed=SPLIT_SEED, test_frac=TEST_FRAC)
    test_loader = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)
    print(f"Test set size: {len(test_ds)}")
 
    # Load ensemble members in eval mode 
    models_list = []
    for i in range(n_models):
        m = build_model()
        checkpoint_path = f"{ENSEMBLE_DIR}/ensemble_model_{i}.pt"
        m.load_state_dict(torch.load(checkpoint_path, map_location=device))
        m.to(device)
        m.eval()
        models_list.append(m)
 
    # Inference loop
    with torch.no_grad():
        per_model_batches = [[] for _ in range(n_models)]
        true_batches = []
        
        for imgs, targets in test_loader:
            imgs = imgs.to(device)
            true_batches.append(targets.numpy())
            
            for i, m in enumerate(models_list):
                preds = m(imgs).cpu().numpy()
                per_model_batches[i].append(preds)
 
        all_true = np.concatenate(true_batches)
        all_model_preds = np.stack(
            [np.concatenate(batches) for batches in per_model_batches], axis=0
        )  
 
    #  Ensemble metrics: mean (prediction) and std (uncertainty)
    ensemble_mean = all_model_preds.mean(axis=0)
    ensemble_std = all_model_preds.std(axis=0)
 
    # Map back to discrete labels
    rounded_preds = np.clip(np.round(ensemble_mean), 0, 2).astype(int)
    true_int = all_true.astype(int)
 
    overall_mae = mean_absolute_error(all_true, ensemble_mean)
    cm = confusion_matrix(true_int, rounded_preds, labels=[0, 1, 2])
 
    # Per-class MAE
    per_class_mae = {}
    for c, name in enumerate(CLASS_NAMES_BY_ORDINAL):
        mask = true_int == c
        if mask.sum() > 0:
            per_class_mae[name] = float(np.mean(np.abs(ensemble_mean[mask] - all_true[mask])))
 
    print(f"\n Point-estimate metrics (ensemble mean, test n={len(all_true)}) ")
    print(f"Overall MAE: {overall_mae:.4f}")
    print(f"Per-class MAE: {per_class_mae}")
    print("Confusion matrix (rows=true, cols=predicted) [Immature, Optimal, Over-mature]:")
    print(cm)
 
    # Uncertainty calibration
    abs_errors = np.abs(ensemble_mean - all_true)
    corr = float(np.corrcoef(ensemble_std, abs_errors)[0, 1]) if len(ensemble_std) > 1 else float("nan")
 
    # Group results by uncertainty levels
    order = np.argsort(ensemble_std)
    n = len(ensemble_std)
    third = max(n // 3, 1)
    
    bins = {
        "low_uncertainty": order[:third],
        "medium_uncertainty": order[third:2 * third],
        "high_uncertainty": order[2 * third:],
    }
    
    calibration_summary = {}
    for bin_name, idxs in bins.items():
        if len(idxs) > 0:
            calibration_summary[bin_name] = {
                "mean_abs_error": float(abs_errors[idxs].mean()),
                "mean_std": float(ensemble_std[idxs].mean()),
                "n": int(len(idxs)),
            }
 
    print(f"\n Uncertainty calibration (ensemble spread, {n_models} models, 5-fold CV) ")
    print(f"Correlation(ensemble_std, abs_error): {corr:.3f}  (positive = uncertainty is meaningful)")
    for bin_name, stats in calibration_summary.items():
        print(f"{bin_name}: mean_abs_error={stats['mean_abs_error']:.3f}, "
              f"mean_std={stats['mean_std']:.3f}, n={stats['n']}")
 
    # Check std on misclassifications vs correct predictions
    misclassified_mask = rounded_preds != true_int
    if misclassified_mask.sum() > 0:
        print(f"\nMean std on MISCLASSIFIED images: {ensemble_std[misclassified_mask].mean():.4f} "
              f"(n={misclassified_mask.sum()})")
        print(f"Mean std on correctly classified images: {ensemble_std[~misclassified_mask].mean():.4f} "
              f"(n={(~misclassified_mask).sum()})")
    else:
        print("\nNo misclassifications — can't compare std by correctness.")
 
    results = {
        "n_test": int(len(all_true)),
        "n_ensemble_models": n_models,
        "overall_mae": float(overall_mae),
        "confusion_matrix": cm.tolist(),
        "per_class_mae": per_class_mae,
        "uncertainty_error_correlation": corr,
        "calibration_by_uncertainty_bin": calibration_summary,
    }
    return results
 
 
@app.local_entrypoint()
def run_eval():
    import json
    
    results = evaluate.remote()
    
    print("\n Full results (JSON) ")
    print(json.dumps(results, indent=2))
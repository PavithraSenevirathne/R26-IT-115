import modal
 
# Cloud environment and dependency configuration
app = modal.App("cinnamon-harvest-ensemble")
 
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch", "torchvision", "pillow", "numpy")
)
 
# Persistent storage mount for datasets and model weights
volume = modal.Volume.from_name("cinnamon-harvest-data", create_if_missing=False)
VOLUME_PATH = "/data"
 
# Ordinal mapping: converts discrete classes into a continuous target variable
ORDINAL_MAP = {"immature": 0.0, "mature": 1.0, "overmature": 2.0}
CLASS_NAMES_BY_ORDINAL = ["Immature", "Optimal", "Over-mature"]
 
# Architecture and training hyperparameters
IMG_SIZE = 224
BATCH_SIZE = 16
EPOCHS = 25
LR = 1e-4
DROPOUT_P = 0.3
N_UNFROZEN_BLOCKS = 3
SPLIT_SEED = 42
TEST_FRAC = 0.15
N_ENSEMBLE_MODELS = 5
 
# Standard image normalization values
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]
 
DATA_ROOT = f"{VOLUME_PATH}/data"
BACKBONE_PATH = f"{VOLUME_PATH}/backbone.pt"
ENSEMBLE_DIR = f"{VOLUME_PATH}/ensemble"
EXPORT_DIR = f"{VOLUME_PATH}/exported"
 
 
def build_kfold_splits(root, k=N_ENSEMBLE_MODELS, seed=SPLIT_SEED, test_frac=TEST_FRAC):

    import torch
    from torch.utils.data import Subset
    from torchvision import datasets, transforms
    from collections import defaultdict
    import random
 
    # Wrapper to yield float targets instead of integer class indices
    class OrdinalImageFolder(datasets.ImageFolder):
        def __init__(self, root, transform):
            super().__init__(root, transform=transform)
            # Validation check for dataset directory integrity
            missing = set(self.classes) - set(ORDINAL_MAP.keys())
            if missing:
                raise ValueError(f"Folder name(s) {missing} not in ORDINAL_MAP")
            
            # Map standard class indices to defined ordinal floats
            self.idx_to_ordinal = {
                self.class_to_idx[name]: ORDINAL_MAP[name] for name in self.classes
            }
 
        def __getitem__(self, index):
            img, class_idx = super().__getitem__(index)
            return img, torch.tensor(self.idx_to_ordinal[class_idx], dtype=torch.float32)
 
    # Training augmentations to simulate environmental variance
    train_transform = transforms.Compose([
        transforms.RandomResizedCrop(IMG_SIZE, scale=(0.85, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(10),
        transforms.ColorJitter(brightness=0.15, contrast=0.15),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    
    # Deterministic pipeline for evaluation subsets
    eval_transform = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
 
    # Instantiate separate views over the same base data structure
    full_train_view = OrdinalImageFolder(root, transform=train_transform)
    full_eval_view = OrdinalImageFolder(root, transform=eval_transform)
 
    # Group indices by class to enable stratified distribution
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
        
        # Extract global test indices
        test_indices += indices[:n_test]
        pool = indices[n_test:]
        
        # Distribute remaining pool into K folds round-robin style
        for i, idx in enumerate(pool):
            fold_indices[i % k].append(idx)
 
    test_ds = Subset(full_eval_view, test_indices)
 
    # Construct PyTorch Subset objects for train/val pairs
    folds = []
    for f in range(k):
        val_idx = fold_indices[f]
        train_idx = [idx for other in range(k) if other != f for idx in fold_indices[other]]
        
        train_ds = Subset(full_train_view, train_idx)
        val_ds = Subset(full_eval_view, val_idx)
        folds.append((train_ds, val_ds))
 
    class_names = full_train_view.classes
    print(f"[kfold] test set: {len(test_ds)} images")
    for f in range(k):
        print(f"[kfold] fold {f}: train={len(folds[f][0])}, val={len(folds[f][1])}")
 
    return test_ds, folds
 
 
def build_model(pretrained_backbone_path: str = None, dropout_p: float = DROPOUT_P):
    import os
    import torch
    import torch.nn as nn
    from torchvision import models
 
    # Define edge-optimized backbone architecture
    backbone = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1)
 
    # Attempt to load domain-specific pre-trained weights if available
    if pretrained_backbone_path is not None and os.path.exists(pretrained_backbone_path):
        checkpoint = torch.load(pretrained_backbone_path, map_location="cpu")
        missing, unexpected = backbone.load_state_dict(checkpoint, strict=False)
        print(f"Loaded PlantVillage backbone — missing: {len(missing)}, unexpected: {len(unexpected)}")
    elif pretrained_backbone_path is not None:
        print(f"WARNING: {pretrained_backbone_path} not found — using ImageNet weights only.")
 
    in_features = backbone.classifier[0].in_features
 
    # Custom regression head replacing the standard classification layer
    class HarvestReadinessNet(nn.Module):
        def __init__(self):
            super().__init__()
            self.features = backbone.features
            self.avgpool = backbone.avgpool
            self.head = nn.Sequential(
                nn.Flatten(),
                nn.Linear(in_features, 128),
                nn.Hardswish(),
                nn.Dropout(p=dropout_p),
                nn.Linear(128, 64),
                nn.Hardswish(),
                nn.Dropout(p=dropout_p),
                nn.Linear(64, 1), # Output a single continuous value
            )
 
        def forward(self, x):
            x = self.features(x)
            x = self.avgpool(x)
            return self.head(x).squeeze(1)
 
    return HarvestReadinessNet()
 
 
@app.function(image=image, gpu="A10G", volumes={VOLUME_PATH: volume}, timeout=1800)
def train_single_model(model_idx: int, seed: int):
    import copy
    import os
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import DataLoader
 
    # Lock random seed to synchronize dataset shuffling across parallel containers
    torch.manual_seed(seed)
 
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[model {model_idx}] training on {device}, seed={seed}, fold={model_idx}")
 
    # Retrieve the specific train/val subsets for the assigned fold
    _, folds = build_kfold_splits(DATA_ROOT, k=N_ENSEMBLE_MODELS, seed=SPLIT_SEED)
    train_ds, val_ds = folds[model_idx]
 
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=2)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)
 
    model = build_model(pretrained_backbone_path=BACKBONE_PATH).to(device)
 
    # Freeze early backbone layers to retain generalized feature extraction
    for param in model.features.parameters():
        param.requires_grad = False
        
    # Unfreeze the final blocks to fine-tune to the specific domain
    for param in model.features[-N_UNFROZEN_BLOCKS:].parameters():
        param.requires_grad = True
 
    # MSE loss is standard for continuous regression targets
    criterion = nn.MSELoss()
    optimizer = optim.Adam([p for p in model.parameters() if p.requires_grad], lr=LR)
 
    best_val_loss = float("inf")
    best_state = None
 
    for epoch in range(EPOCHS):
        model.train()
        running_loss = 0.0
        for imgs, targets in train_loader:
            imgs, targets = imgs.to(device), targets.to(device)
            optimizer.zero_grad()
            preds = model(imgs)
            loss = criterion(preds, targets)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * imgs.size(0)
        train_loss = running_loss / len(train_ds)
 
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for imgs, targets in val_loader:
                imgs, targets = imgs.to(device), targets.to(device)
                val_loss += criterion(model(imgs), targets).item() * imgs.size(0)
        val_loss /= len(val_ds)
 
        if epoch % 5 == 0 or epoch == EPOCHS - 1:
            print(f"[model {model_idx}] epoch {epoch+1}/{EPOCHS} | train {train_loss:.4f} | val {val_loss:.4f}")
 
        # Track best validation state for checkpointing
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_state = copy.deepcopy(model.state_dict())
 
    # Serialize best model weights to persistent cloud volume
    os.makedirs(ENSEMBLE_DIR, exist_ok=True)
    checkpoint_path = f"{ENSEMBLE_DIR}/ensemble_model_{model_idx}.pt"
    torch.save(best_state, checkpoint_path)
    volume.commit()
    print(f"[model {model_idx}] saved (val MSE {best_val_loss:.4f}) -> {checkpoint_path}")
    return {"model_idx": model_idx, "best_val_loss": best_val_loss}
 
 
@app.local_entrypoint()
def train_ensemble(n_models: int = N_ENSEMBLE_MODELS, base_seed: int = 100):
    args = [(i, base_seed + i) for i in range(n_models)]
    results = list(train_single_model.starmap(args))
    results.sort(key=lambda r: r["model_idx"])
    print("\n Ensemble training complete (5-fold CV) ")
    for r in results:
        print(f"Model {r['model_idx']} (fold {r['model_idx']}): best val MSE = {r['best_val_loss']:.4f}")
    avg_val = sum(r["best_val_loss"] for r in results) / len(results)
    print(f"Average val MSE across folds: {avg_val:.4f}")
 
 
@app.function(image=image, gpu="A10G", volumes={VOLUME_PATH: volume}, timeout=600)
def export_single_model(model_idx: int):
    import os
    import torch
 
    # Force CPU evaluation mode to ensure hardware-agnostic mobile tracing
    device = torch.device("cpu")
    model = build_model(pretrained_backbone_path=None)
    checkpoint_path = f"{ENSEMBLE_DIR}/ensemble_model_{model_idx}.pt"
    model.load_state_dict(torch.load(checkpoint_path, map_location=device))
    model.eval()
 
    example_input = torch.randn(1, 3, IMG_SIZE, IMG_SIZE)
    
    # Compile model into a static TorchScript graph for edge deployment
    traced = torch.jit.trace(model, example_input)
 
    os.makedirs(EXPORT_DIR, exist_ok=True)
    export_path = f"{EXPORT_DIR}/ensemble_model_{model_idx}_traced.pt"
    traced.save(export_path)
    volume.commit()
    print(f"[model {model_idx}] exported TorchScript -> {export_path}")
    return export_path
 
 
@app.local_entrypoint()
def export_ensemble(n_models: int = N_ENSEMBLE_MODELS):
    paths = list(export_single_model.map(range(n_models)))
    print("\n Exported files ")
    for p in paths:
        print(p)
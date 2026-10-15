import os
import io
import json
import random
from pathlib import Path
import modal

# 1. Configure Modal App, persistent Volume, and container dependencies
app = modal.App("bark-gate-training")
volume = modal.Volume.from_name("cinnamon-bark-vol", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.2.2",
        "torchvision==0.17.2",
        "onnx==1.16.0",
        "onnxruntime==1.17.3",
        "scikit-learn==1.4.2",
        "pyarrow==15.0.2",
        "datasets==2.19.1",
        "huggingface_hub==0.23.0",
        "Pillow==10.3.0",
        "numpy==1.26.4",
    )
)

REMOTE_DATA_DIR = Path("/vol/bark_gate_data")
REMOTE_OUT_DIR = Path("/vol/exports")

NEGATIVE_CATEGORIES = [
    "01_other_barks",     # Tropical tree barks (BarkVN-50)
    "02_textures",        # Natural/fibrous textures (DTD)
    "03_leaves_plants",   # Center-cropped foliage (PlantVillage)
    "04_general_scenes",  # Everyday objects/scenes (Food-101)
]


@app.function(image=image, volumes={"/vol": volume}, timeout=3600)
def fetch_online_negatives(
    n_barks: int = 500,
    n_textures: int = 250,
    n_leaves: int = 200,
    n_scenes: int = 150,
    seed: int = 42,
):
    from datasets import load_dataset, get_dataset_split_names
    from torchvision import datasets as tv_datasets
    from huggingface_hub import list_repo_files, hf_hub_download
    from PIL import Image as PILImage

    random.seed(seed)
    neg_root = REMOTE_DATA_DIR / "negative"
    for cat in NEGATIVE_CATEGORIES:
        (neg_root / cat).mkdir(parents=True, exist_ok=True)

    def stream_first_available_split(repo_id: str):
        try:
            splits = get_dataset_split_names(repo_id)
            chosen_split = "train" if "train" in splits else splits[0]
        except Exception:
            chosen_split = "test"
        return load_dataset(repo_id, split=chosen_split, streaming=True)

    # Category 1: Download real tropical bark images directly from Voxel51/BarkVN-50 repo files
    bark_dir = neg_root / "01_other_barks"
    if len(list(bark_dir.glob("barkvn_*.jpg"))) < n_barks:
        print("Sourcing 01_other_barks from Voxel51/BarkVN-50...")
        for old_f in bark_dir.glob("bark_*.jpg"):
            old_f.unlink()

        all_repo_files = list_repo_files("Voxel51/BarkVN-50", repo_type="dataset")
        excluded_keywords = ("cinnamomum", "cinnamon")
        image_files = [
            f for f in all_repo_files
            if f.lower().endswith((".jpg", ".jpeg", ".png"))
            and not any(k in f.lower() for k in excluded_keywords)
        ]

        sampled_files = random.sample(image_files, min(n_barks, len(image_files)))
        for i, rel_path in enumerate(sampled_files):
            local_file = hf_hub_download(
                repo_id="Voxel51/BarkVN-50", filename=rel_path, repo_type="dataset"
            )
            img = PILImage.open(local_file).convert("RGB").resize((256, 256))
            img.save(bark_dir / f"barkvn_{i:04d}.jpg", quality=92)
        print(f"  -> Saved {len(sampled_files)} BarkVN-50 images.")
    else:
        print(f"01_other_barks already populated ({len(list(bark_dir.glob('barkvn_*.jpg')))} images).")

    # Category 2: Download organic/fibrous surface textures from Torchvision DTD
    tex_dir = neg_root / "02_textures"
    if len(list(tex_dir.glob("*.jpg"))) < n_textures:
        print("Sourcing 02_textures from DTD...")
        dtd_ds = tv_datasets.DTD(root="/tmp/dtd", split="train", download=True)
        priority_textures = {
            "cracked", "fibrous", "veined", "scaly", "bumpy",
            "grooved", "wrinkled", "pitted", "porous", "woven"
        }
        class_names = dtd_ds.classes
        priority_idx = [i for i in range(len(dtd_ds)) if class_names[dtd_ds._labels[i]] in priority_textures]
        other_idx = [i for i in range(len(dtd_ds)) if class_names[dtd_ds._labels[i]] not in priority_textures]

        chosen = (
            random.sample(priority_idx, min(int(n_textures * 0.7), len(priority_idx)))
            + random.sample(other_idx, min(int(n_textures * 0.3), len(other_idx)))
        )
        for i, idx in enumerate(chosen):
            img, _ = dtd_ds[idx]
            img.convert("RGB").resize((256, 256)).save(tex_dir / f"dtd_{i:04d}.jpg", quality=92)
        print(f"  -> Saved {len(chosen)} DTD texture images.")
    else:
        print(f"02_textures already populated ({len(list(tex_dir.glob('*.jpg')))} images).")

    # Category 3: Stream plant leaves and apply a 70% center crop to remove studio backdrops
    leaf_dir = neg_root / "03_leaves_plants"
    if len(list(leaf_dir.glob("*.jpg"))) < n_leaves:
        print("Sourcing 03_leaves_plants from PlantVillage...")
        leaf_candidates = []
        for pv_repo in ["BrandonFors/Plant-Diseases-PlantVillage-Dataset", "gvlasov/plant_village", "beans"]:
            try:
                pv_ds = stream_first_available_split(pv_repo)
                for item in pv_ds:
                    if item.get("image") is not None:
                        leaf_candidates.append(item["image"])
                    if len(leaf_candidates) >= n_leaves * 3:
                        break
                if len(leaf_candidates) >= n_leaves:
                    break
            except Exception:
                continue

        sampled_leaves = random.sample(leaf_candidates, min(n_leaves, len(leaf_candidates)))
        for i, img in enumerate(sampled_leaves):
            img = img.convert("RGB")
            w, h = img.size
            crop_box = (int(w * 0.15), int(h * 0.15), int(w * 0.85), int(h * 0.85))
            img.crop(crop_box).resize((256, 256)).save(leaf_dir / f"pv_leaf_{i:04d}.jpg", quality=92)
        print(f"  -> Saved {len(sampled_leaves)} leaf images.")
    else:
        print(f"03_leaves_plants already populated ({len(list(leaf_dir.glob('*.jpg')))} images).")

    # Category 4: Stream general scenes/objects to reject non-plant clutter
    scene_dir = neg_root / "04_general_scenes"
    if len(list(scene_dir.glob("*.jpg"))) < n_scenes:
        print("Sourcing 04_general_scenes from everyday scenes...")
        scene_ds = stream_first_available_split("ethz/food101")
        scene_candidates = []
        for item in scene_ds:
            if item.get("image") is not None:
                scene_candidates.append(item["image"])
            if len(scene_candidates) >= n_scenes * 3:
                break

        sampled_scenes = random.sample(scene_candidates, min(n_scenes, len(scene_candidates)))
        for i, img in enumerate(sampled_scenes):
            img.convert("RGB").resize((256, 256)).save(scene_dir / f"scene_{i:04d}.jpg", quality=92)
        print(f"  -> Saved {len(sampled_scenes)} general scene images.")
    else:
        print(f"04_general_scenes already populated ({len(list(scene_dir.glob('*.jpg')))} images).")

    volume.commit()


@app.function(image=image, gpu="A10G", volumes={"/vol": volume}, timeout=3600)
def train_bark_gate(epochs: int = 20, batch_size: int = 32, lr: float = 1e-4, seed: int = 42):
    """Splits dataset, equalizes resolution/JPEG pipeline, trains with anti-shortcut augmentations, and evaluates."""
    import numpy as np
    import torch
    import torch.nn as nn
    from torch.utils.data import Dataset, DataLoader
    from torchvision import models, transforms
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import (
        roc_auc_score, precision_recall_fscore_support, confusion_matrix, roc_curve
    )
    from PIL import Image

    # Ensure online negatives are cached on the volume before splitting
    fetch_online_negatives.local(seed=seed)

    torch.manual_seed(seed)
    np.random.seed(seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    # 1. Load positive cinnamon images recursively
    pos_root = REMOTE_DATA_DIR / "positive"
    neg_root = REMOTE_DATA_DIR / "negative"

    all_pos_files = sorted([
        p for p in pos_root.rglob("*")
        if p.is_file() and p.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]
    ])
    if not all_pos_files:
        raise FileNotFoundError(f"No positive images found in {pos_root}.")

    pos_items, pos_strata = [], []
    for p in all_pos_files:
        cls_key = p.parent.name.lower().replace("_", "-")
        pos_items.append((str(p), 1.0, f"pos_{cls_key}"))
        pos_strata.append(f"pos_{cls_key}")

    # Stratified 68% train / 17% val / 15% test split on positives (seed=42)
    pos_trainval, pos_test, pos_strata_tv, _ = train_test_split(
        pos_items, pos_strata, test_size=0.15, stratify=pos_strata, random_state=seed
    )
    pos_train, pos_val = train_test_split(
        pos_trainval, test_size=0.20, stratify=pos_strata_tv, random_state=seed
    )

    # 2. Load negative images stratified across the 4 negative subfolders
    neg_items, neg_strata = [], []
    for cat_name in NEGATIVE_CATEGORIES:
        cat_dir = neg_root / cat_name
        files = sorted([
            str(p) for p in cat_dir.glob("*")
            if p.suffix.lower() in [".jpg", ".jpeg", ".png"]
        ])
        for f in files:
            neg_items.append((f, 0.0, cat_name))
            neg_strata.append(cat_name)

    neg_trainval, neg_test, neg_strata_tv, _ = train_test_split(
        neg_items, neg_strata, test_size=0.15, stratify=neg_strata, random_state=seed
    )
    neg_train, neg_val = train_test_split(
        neg_trainval, test_size=0.20, stratify=neg_strata_tv, random_state=seed
    )

    print(f"\n--- Stratified Split Summary ---")
    print(f"Train: {len(pos_train)} pos | {len(neg_train)} neg")
    print(f"Val:   {len(pos_val)} pos | {len(neg_val)} neg")
    print(f"Test:  {len(pos_test)} pos | {len(neg_test)} neg")

    # 3. Domain-Randomization Augmentations: prevents cheating on camera sharpness or color cast
    train_tf = transforms.Compose([
        transforms.RandomResizedCrop(224, scale=(0.55, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(p=0.2),
        transforms.RandomRotation(30),
        transforms.ColorJitter(brightness=0.35, contrast=0.35, saturation=0.35, hue=0.08),
        transforms.RandomGrayscale(p=0.15),
        transforms.RandomApply([transforms.GaussianBlur(kernel_size=3, sigma=(0.1, 2.0))], p=0.35),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    eval_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    class BarkGateDataset(Dataset):
        def __init__(self, items, transform):
            self.items = items
            self.transform = transform

        def __len__(self):
            return len(self.items)

        def __getitem__(self, idx):
            path, label, category = self.items[idx]
            img = Image.open(path).convert("RGB")

            # Equalize resolution and JPEG compression across both positive and negative classes
            img = img.resize((256, 256), Image.BILINEAR)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=92)
            buf.seek(0)
            img = Image.open(buf).convert("RGB")

            return self.transform(img), torch.tensor(label, dtype=torch.float32), category

    train_loader = DataLoader(BarkGateDataset(pos_train + neg_train, train_tf), batch_size=batch_size, shuffle=True, num_workers=2)
    val_loader = DataLoader(BarkGateDataset(pos_val + neg_val, eval_tf), batch_size=batch_size, shuffle=False, num_workers=2)
    test_loader = DataLoader(BarkGateDataset(pos_test + neg_test, eval_tf), batch_size=batch_size, shuffle=False, num_workers=2)

    # 4. Define bark-gate architecture (MobileNetV3Small with last 3 feature blocks unfrozen)
    class BarkGateNet(nn.Module):
        def __init__(self):
            super().__init__()
            base = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1)
            self.features = base.features
            self.avgpool = base.avgpool

            for i, block in enumerate(self.features):
                if i < 10:
                    for param in block.parameters():
                        param.requires_grad = False

            self.classifier = nn.Sequential(
                nn.Flatten(),
                nn.Linear(576, 128),
                nn.Hardswish(),
                nn.Dropout(0.3),
                nn.Linear(128, 64),
                nn.Hardswish(),
                nn.Dropout(0.3),
                nn.Linear(64, 1),
            )

        def forward(self, x):
            return self.classifier(self.avgpool(self.features(x)))

    model = BarkGateNet().to(device)

    pos_weight = torch.tensor([len(neg_train) / max(len(pos_train), 1)], device=device)
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = torch.optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=lr)

    # 5. Train and save best validation checkpoint
    best_val_loss = float("inf")
    REMOTE_OUT_DIR.mkdir(parents=True, exist_ok=True)
    best_ckpt_path = REMOTE_OUT_DIR / "bark_gate_best.pt"

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0
        for x, y, _ in train_loader:
            x, y = x.to(device), y.to(device).unsqueeze(1)
            optimizer.zero_grad()
            loss = criterion(model(x), y)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * x.size(0)

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for x, y, _ in val_loader:
                x, y = x.to(device), y.to(device).unsqueeze(1)
                val_loss += criterion(model(x), y).item() * x.size(0)

        train_loss /= len(train_loader.dataset)
        val_loss /= len(val_loader.dataset)
        print(f"Epoch {epoch:02d}/{epochs:02d} | Train BCE: {train_loss:.4f} | Val BCE: {val_loss:.4f}")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), best_ckpt_path)

    # 6. Calibrate decision threshold on validation set & evaluate on held-out test set
    model.load_state_dict(torch.load(best_ckpt_path))
    model.eval()

    def evaluate_loader(loader):
        probs, labels, cats = [], [], []
        with torch.no_grad():
            for x, y, c in loader:
                p = torch.sigmoid(model(x.to(device))).squeeze(1).cpu().numpy()
                probs.extend(p.tolist())
                labels.extend(y.numpy().tolist())
                cats.extend(list(c))
        return np.array(probs), np.array(labels), np.array(cats)

    val_probs, val_labels, _ = evaluate_loader(val_loader)
    test_probs, test_labels, test_cats = evaluate_loader(test_loader)

    fpr, tpr, thresholds = roc_curve(val_labels, val_probs)
    valid_idxs = np.where(tpr >= 0.98)[0]
    best_idx = valid_idxs[np.argmax(tpr[valid_idxs] - fpr[valid_idxs])]
    optimal_threshold = float(np.clip(thresholds[best_idx], 0.30, 0.85))

    test_preds = (test_probs >= optimal_threshold).astype(int)
    auroc = roc_auc_score(test_labels, test_probs)
    _, _, f1, _ = precision_recall_fscore_support(test_labels, test_preds, average="binary")
    tn, fp, fn, tp = confusion_matrix(test_labels, test_preds).ravel()

    print("\n--- BARK-GATE PER-CATEGORY EVALUATION (TEST SET) ---")
    print(f"{'Category':<22} | {'Samples':<7} | {'Rejection (TNR) / Recall':<25} | {'Mean P(Cinnamon)'}")
    print("-" * 78)

    category_breakdown = {}
    for cat in NEGATIVE_CATEGORIES:
        mask = test_cats == cat
        n_samples = int(np.sum(mask))
        rejection_rate = float(np.mean(test_preds[mask] == 0))
        mean_prob = float(np.mean(test_probs[mask]))
        category_breakdown[cat] = {
            "n": n_samples,
            "rejection_rate_tnr": round(rejection_rate, 4),
            "mean_cinnamon_prob": round(mean_prob, 4),
        }
        print(f"{cat:<22} | {n_samples:<7} | {rejection_rate*100:>6.2f}% Rejected (TNR)   | {mean_prob:.4f}")

    pos_mask = test_labels == 1.0
    pos_recall = float(np.mean(test_preds[pos_mask] == 1))
    pos_mean_prob = float(np.mean(test_probs[pos_mask]))
    print(f"{'cinnamon_positive':<22} | {int(np.sum(pos_mask)):<7} | {pos_recall*100:>6.2f}% Accepted (TPR)   | {pos_mean_prob:.4f}")

    metrics = {
        "model_name": "bark-gate",
        "optimal_threshold": round(optimal_threshold, 4),
        "recommended_mobile_threshold": 0.50,
        "test_auroc": round(float(auroc), 4),
        "test_f1": round(float(f1), 4),
        "cinnamon_recall_tpr": round(pos_recall, 4),
        "overall_rejection_tnr": round(float(tn / (tn + fp)), 4),
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "per_category_breakdown": category_breakdown,
    }

    with open(REMOTE_OUT_DIR / "bark_gate_metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)

    volume.commit()
    return metrics


@app.local_entrypoint()
def main():
    metrics = train_bark_gate.remote()
    print("\nCompleted bark-gate training! Summary metrics:")
    print(json.dumps(metrics, indent=2))
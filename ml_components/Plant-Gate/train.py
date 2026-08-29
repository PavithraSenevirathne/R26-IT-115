import modal
from pathlib import Path

# Modal app and storage volume configuration
app = modal.App("plant-gate-classifier")
volume = modal.Volume.from_name("plant-gate", create_if_missing=True)

# Container image with Python dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install(
        "torch",
        "torchvision",
        "Pillow",
        "numpy",
        "scikit-learn",
        "matplotlib",
        "onnx",
        "onnxscript",
        "onnxruntime",
        "tqdm",
    )
)

VOL = "/data"

# Directory paths on the storage volume
PLANT_DIR        = f"{VOL}/data/plant"
NOT_PLANT_DIR    = f"{VOL}/data/not_plant"
MODEL_SAVE_DIR   = f"{VOL}/model"
RESULTS_DIR      = f"{VOL}/results"

@app.function(
    image=image,
    timeout=60 * 120,
    volumes={VOL: volume},
)
def prepare_dataset():
    import random
    import urllib.request
    import zipfile
    import shutil
    from PIL import Image
    import numpy as np

    random.seed(42)

    plant_dir     = Path(PLANT_DIR)
    not_plant_dir = Path(NOT_PLANT_DIR)

    # Clean existing directories for a fresh run
    if plant_dir.exists(): shutil.rmtree(plant_dir)
    if not_plant_dir.exists(): shutil.rmtree(not_plant_dir)

    plant_dir.mkdir(parents=True, exist_ok=True)
    not_plant_dir.mkdir(parents=True, exist_ok=True)

    plant_count = 0
    TARGET_PLANT_COUNT = 3000

    # Load custom cinnamon plant images
    cinnamon_raw = Path(f"{VOL}/cinnamon_raw")
    if cinnamon_raw.exists():
        print("Processing custom cinnamon stems/angles...")
        cin_images = list(cinnamon_raw.rglob("*.jpg")) + \
                     list(cinnamon_raw.rglob("*.jpeg")) + \
                     list(cinnamon_raw.rglob("*.png"))
                     
        for i, img_path in enumerate(cin_images):
            dst = plant_dir / f"cinnamon_{i:04d}.jpg"
            try:
                img = Image.open(img_path).convert("RGB")
                img.save(str(dst), "JPEG")
                plant_count += 1
            except Exception:
                continue
        print(f"  Added {plant_count} custom cinnamon images.")
    else:
        print("\n[!] WARNING: Custom cinnamon dataset not found on volume.")

    # Fill remaining target count with PlantVillage images
    plantvillage_raw = Path(f"{VOL}/plantvillage_raw")
    pv_needed = TARGET_PLANT_COUNT - plant_count
    
    if plantvillage_raw.exists() and pv_needed > 0:
        print(f"Processing PlantVillage images to fill remaining {pv_needed} slots...")
        pv_images = list(plantvillage_raw.rglob("*.jpg")) + \
                    list(plantvillage_raw.rglob("*.JPG")) + \
                    list(plantvillage_raw.rglob("*.png"))
                    
        pv_selected = random.sample(pv_images, min(pv_needed, len(pv_images)))
        pv_added = 0
        
        for i, img_path in enumerate(pv_selected):
            dst = plant_dir / f"plantvillage_{i:04d}.jpg"
            try:
                img = Image.open(img_path).convert("RGB")
                img.save(str(dst), "JPEG")
                pv_added += 1
                plant_count += 1
            except Exception:
                continue
        print(f"  Added {pv_added} PlantVillage images.")

    # Download and unpack COCO validation set for negative samples
    print("\nPreparing COCO 2017 Validation dataset for not-plant class...")
    coco_zip_path = Path(f"{VOL}/val2017.zip")
    coco_extract_dir = Path(f"{VOL}/coco_cache")
    coco_images_dir = coco_extract_dir / "val2017"

    if not coco_images_dir.exists():
        print("  Downloading COCO images (1GB) - this will take a few seconds on Modal...")
        coco_url = "http://images.cocodataset.org/zips/val2017.zip"
        urllib.request.urlretrieve(coco_url, coco_zip_path)
        
        print("  Extracting COCO images...")
        with zipfile.ZipFile(coco_zip_path, 'r') as zip_ref:
            zip_ref.extractall(coco_extract_dir)
            
        coco_zip_path.unlink()

    # Sample and resize negative class images to standard input dimensions
    coco_images = list(coco_images_dir.glob("*.jpg"))
    indices = random.sample(range(len(coco_images)), min(TARGET_PLANT_COUNT, len(coco_images)))
    np_count = 0

    print("Processing high-res COCO images...")
    for i, idx in enumerate(indices):
        img_path = coco_images[idx]
        try:
            img = Image.open(img_path).convert("RGB")
            img = img.resize((224, 224), Image.BICUBIC)
            dst = not_plant_dir / f"coco_{img_path.name}"
            img.save(str(dst), "JPEG")
            np_count += 1
        except Exception:
            continue

    print(f"  Added {np_count} high-res not-plant images from COCO")

    final_plant     = len(list(plant_dir.glob("*.jpg")))
    final_not_plant = len(list(not_plant_dir.glob("*.jpg")))

    print(f"\nDataset ready:")
    print(f"  plant     : {final_plant} images")
    print(f"  not_plant : {final_not_plant} images")
    
    volume.commit()
    print("\nDataset saved to volume.")

@app.function(
    image=image,
    gpu="A100",
    timeout=60 * 60 * 2,
    volumes={VOL: volume},
)
def train():
    import torch
    import torch.nn as nn
    from torchvision import models, transforms
    from torchvision.datasets import ImageFolder
    from torch.utils.data import DataLoader, random_split

    Path(MODEL_SAVE_DIR).mkdir(parents=True, exist_ok=True)
    Path(RESULTS_DIR).mkdir(parents=True, exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    data_root = Path(VOL) / "data"

    # Training augmentations to improve angle and lighting invariance
    train_tf = transforms.Compose([
        transforms.Resize((256, 256)),
        transforms.RandomCrop(224),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(p=0.2),
        transforms.RandomRotation(degrees=20),
        transforms.RandomPerspective(distortion_scale=0.2, p=0.3),
        transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])

    # Validation transform without stochastic augmentations
    val_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])

    full_dataset = ImageFolder(str(data_root), transform=train_tf)
    
    # Split dataset into 80% train and 20% validation
    n_val   = int(len(full_dataset) * 0.20)
    n_train = len(full_dataset) - n_val
    train_set, val_set = random_split(
        full_dataset, [n_train, n_val],
        generator=torch.Generator().manual_seed(42)
    )

    val_set.dataset = ImageFolder(str(data_root), transform=val_tf)

    train_loader = DataLoader(train_set, batch_size=64, shuffle=True, num_workers=4)
    val_loader   = DataLoader(val_set, batch_size=64, shuffle=False, num_workers=4)

    print(f"\nTrain: {n_train} images  Val: {n_val} images")

    # Load pretrained MobileNetV3 and adapt the final layer for binary classification
    model = models.mobilenet_v3_small(
        weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1
    )
    in_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_features, 2)
    model = model.to(device)

    criterion = nn.CrossEntropyLoss()

    # Helper function to run forward/backward passes
    def run_epoch(loader, optimizer=None, phase="train"):
        if phase == "train": model.train()
        else: model.eval()

        total_loss, correct, total = 0.0, 0, 0
        with torch.set_grad_enabled(phase == "train"):
            for images, labels in loader:
                images, labels = images.to(device), labels.to(device)
                outputs = model(images)
                loss    = criterion(outputs, labels)

                if phase == "train":
                    optimizer.zero_grad()
                    loss.backward()
                    optimizer.step()

                total_loss += loss.item() * images.size(0)
                correct    += (outputs.argmax(dim=1) == labels).sum().item()
                total      += images.size(0)

        return total_loss / total, correct / total

    best_val_acc = 0.0

    # Phase 1: Train only the classification head with a frozen backbone
    print("\nPHASE 1 — Training head only (5 epochs)")
    for param in model.features.parameters(): param.requires_grad = False
    optimizer_phase1 = torch.optim.Adam(model.classifier.parameters(), lr=0.001)

    for epoch in range(5):
        _, _ = run_epoch(train_loader, optimizer_phase1, "train")
        vl_loss, vl_acc = run_epoch(val_loader, phase="val")
        print(f"  Epoch {epoch+1}/5 | Val Acc: {vl_acc:.4f}")
        
        if vl_acc > best_val_acc:
            best_val_acc = vl_acc
            torch.save(model.state_dict(), f"{MODEL_SAVE_DIR}/best_plant_gate.pt")

    # Phase 2: Fine-tune the entire network with a smaller learning rate
    print("\nPHASE 2 — Full fine-tune (15 epochs)")
    for param in model.parameters(): param.requires_grad = True
    optimizer_phase2 = torch.optim.Adam([
        {"params": model.features.parameters(),    "lr": 0.00005},
        {"params": model.classifier.parameters(),  "lr": 0.0005},
    ])
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer_phase2, T_max=15)

    for epoch in range(15):
        _, _ = run_epoch(train_loader, optimizer_phase2, "train")
        vl_loss, vl_acc = run_epoch(val_loader, phase="val")
        scheduler.step()
        
        if vl_acc > best_val_acc:
            best_val_acc = vl_acc
            torch.save(model.state_dict(), f"{MODEL_SAVE_DIR}/best_plant_gate.pt")
        print(f"  Epoch {epoch+6}/20 | Val Acc: {vl_acc:.4f}")

    print(f"\nBest val accuracy: {best_val_acc:.4f}")
    volume.commit()

@app.function(
    image=image,
    volumes={VOL: volume},
)
def export_onnx():
    import torch
    import torch.nn as nn
    from torchvision import models

    # Load the best saved weights into the architecture
    model = models.mobilenet_v3_small()
    model.classifier[-1] = nn.Linear(model.classifier[-1].in_features, 2)
    model.load_state_dict(torch.load(f"{MODEL_SAVE_DIR}/best_plant_gate.pt", map_location="cpu"))
    model.eval()

    # Export to ONNX format
    dummy_input = torch.zeros(1, 3, 224, 224)
    export_path = f"{MODEL_SAVE_DIR}/plant_gate.onnx"

    torch.onnx.export(
        model, dummy_input, export_path,
        input_names=["image"], output_names=["scores"],
        opset_version=12,
    )
    
    print(f"Exported to {export_path}")
    volume.commit()

@app.local_entrypoint()
def download_model():
    import os
    LOCAL_OUT = "CinnamonGatekeeper"
    Path(LOCAL_OUT).mkdir(parents=True, exist_ok=True)

    remote_file = "/model/plant_gate.onnx"
    local_file  = os.path.join(LOCAL_OUT, "plant_gate.onnx")

    print(f"Downloading model to: {local_file}")
    with volume.batch_download() as batch:
        batch.get(remote_file, local_file)
    print("Download complete!")

# Main execution pipeline
@app.local_entrypoint()
def main():
    print("1. Preparing dataset")
    prepare_dataset.remote()

    print("\n2. Training Model")
    train.remote()

    print("\n3. Exporting to ONNX")
    export_onnx.remote()
import torch
import torch.nn as nn

from modal_app import app, image, volume, VOL_PATH

@app.function(image=image, gpu="A10G", volumes={VOL_PATH: volume}, timeout=7200)
def prep_plantvillage():
    import os, zipfile, urllib.request, glob

    target_dir = f"{VOL_PATH}/plantvillage_raw"
    if os.path.exists(f"{target_dir}/raw/color"):
        print("Already downloaded, skipping.")
        return

    os.makedirs(target_dir, exist_ok=True)
    zip_path = f"{VOL_PATH}/plantvillage.zip"

    print("Downloading PlantVillage dataset from GitHub...")
    urllib.request.urlretrieve(
        "https://github.com/spMohanty/PlantVillage-Dataset/archive/refs/heads/master.zip",
        zip_path,
    )

    print("Extracting...")
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(target_dir)

    extracted_dirs = glob.glob(f"{target_dir}/PlantVillage-Dataset-*")
    if not extracted_dirs:
        raise RuntimeError("Could not find extracted PlantVillage-Dataset folder")
    extracted_root = extracted_dirs[0]

    os.rename(f"{extracted_root}/raw", f"{target_dir}/raw")
    os.remove(zip_path)

    print(f"Done. Color images at {target_dir}/raw/color")
    volume.commit()


@app.function(image=image, gpu="A10G", volumes={VOL_PATH: volume}, timeout=10800)
def train_stage1(epochs: int = 15, lr: float = 3e-4, batch_size: int = 64):
    from train_lib import build_model, get_plantvillage_loaders, run_epoch
    import os

    os.makedirs(f"{VOL_PATH}/checkpoints", exist_ok=True)

    train_loader, val_loader, classes = get_plantvillage_loaders(batch_size=batch_size)
    print(f"[stage1] {len(classes)} classes, {len(train_loader.dataset)} train / {len(val_loader.dataset)} val")

    device = "cuda"
    model = build_model(num_classes=len(classes)).to(device)

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)

    best_f1 = 0.0
    for epoch in range(epochs):
        train_loss, train_f1 = run_epoch(model, train_loader, criterion, optimizer, device, train=True)
        val_loss, val_f1 = run_epoch(model, val_loader, criterion, optimizer, device, train=False)
        scheduler.step()

        print(f"[stage1] epoch {epoch:02d} "
              f"train_loss={train_loss:.4f} train_f1={train_f1:.4f} "
              f"val_loss={val_loss:.4f} val_f1={val_f1:.4f}")

        if val_f1 > best_f1:
            best_f1 = val_f1
            backbone_state = {k: v for k, v in model.state_dict().items() if "classifier.3" not in k}
            torch.save(backbone_state, f"{VOL_PATH}/checkpoints/plantvillage_backbone.pt")
            print(f"[stage1] new best backbone saved (val_f1={best_f1:.4f})")

    volume.commit()
    return best_f1
import torch
import torch.nn as nn

from modal_app import app, image, volume, VOL_PATH


# Fine-tunes the shared backbone into either a leaf or stem classifier
@app.function(image=image, gpu="A10G", volumes={VOL_PATH: volume}, timeout=7200)
def train_stage2(
    part: str, 
    epochs_head: int = 8,
    epochs_finetune: int = 20,
    lr_head: float = 1e-3,
    lr_finetune: float = 1e-5,
    batch_size: int = 16,
):
    from train_lib import (
        build_model, unfreeze_last_blocks, get_cinnamon_loaders,
        run_epoch, evaluate_per_class,
    )
    import os

    data_path = f"{VOL_PATH}/cinnamon_dataset/{part}"
    backbone_path = f"{VOL_PATH}/checkpoints/plantvillage_backbone.pt"
    output_path = f"{VOL_PATH}/checkpoints/cinnamon_{part}_final.pt"
    os.makedirs(f"{VOL_PATH}/checkpoints", exist_ok=True)

    train_loader, val_loader, classes = get_cinnamon_loaders(data_path, batch_size=batch_size)
    print(f"[stage2-{part}] {len(classes)} classes: {classes}")
    print(f"[stage2-{part}] {len(train_loader.dataset)} train / {len(val_loader.dataset)} val")

    device = "cuda"
    model = build_model(
        num_classes=len(classes),
        pretrained_backbone_path=backbone_path,  # same backbone used for both leaf and stem
        freeze_backbone=True,
    ).to(device)

    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
    best_acc = 0.0

    # phase 1 — train just the new head, keep backbone frozen
    optimizer = torch.optim.AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=lr_head)
    for epoch in range(epochs_head):
        train_loss, train_acc = run_epoch(model, train_loader, criterion, optimizer, device, train=True)
        val_loss, val_acc = run_epoch(model, val_loader, criterion, optimizer, device, train=False)
        print(f"[stage2-{part}-head] epoch {epoch:02d} train_acc={train_acc:.4f} val_acc={val_acc:.4f}")
        if val_acc > best_acc:
            best_acc = val_acc
            torch.save(model.state_dict(), output_path)

    # phase 2 — unlock last few blocks, fine-tune everything at a low learning rate
    unfreeze_last_blocks(model, block_indices=(10, 11, 12))
    optimizer = torch.optim.AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=lr_finetune)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs_finetune)

    for epoch in range(epochs_finetune):
        train_loss, train_acc = run_epoch(model, train_loader, criterion, optimizer, device, train=True)
        val_loss, val_acc = run_epoch(model, val_loader, criterion, optimizer, device, train=False)
        scheduler.step()
        print(f"[stage2-{part}-finetune] epoch {epoch:02d} train_acc={train_acc:.4f} val_acc={val_acc:.4f}")
        if val_acc > best_acc:
            best_acc = val_acc
            torch.save(model.state_dict(), output_path)
            print(f"[stage2-{part}] new best saved (val_acc={best_acc:.4f})")

    # reload best checkpoint and print a readable per-class report
    model.load_state_dict(torch.load(output_path, map_location=device, weights_only=True))
    print(f"\n[stage2-{part}] Per-class report (best checkpoint):")
    evaluate_per_class(model, val_loader, classes, device)

    volume.commit()
    return {"part": part, "best_acc": best_acc, "classes": classes}
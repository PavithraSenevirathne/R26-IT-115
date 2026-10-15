import torch
import torch.nn as nn

from modal_app import app, image, volume, VOL_PATH

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
        run_epoch, evaluate_per_class, export_for_mobile
    )
    import os

    data_path = f"{VOL_PATH}/cinnamon_dataset/{part}"
    backbone_path = f"{VOL_PATH}/checkpoints/plantvillage_backbone.pt"
    output_path = f"{VOL_PATH}/checkpoints/cinnamon_{part}_final.pt"
    mobile_output_path = f"{VOL_PATH}/checkpoints/cinnamon_{part}_mobile.ptl"
    os.makedirs(f"{VOL_PATH}/checkpoints", exist_ok=True)

    train_loader, val_loader, classes, class_weights = get_cinnamon_loaders(data_path, batch_size=batch_size)
    print(f"[stage2-{part}] {len(classes)} classes: {classes}")
    
    device = "cuda"
    class_weights = class_weights.to(device)
    
    model = build_model(
        num_classes=len(classes),
        pretrained_backbone_path=backbone_path,
        freeze_backbone=True,
    ).to(device)

    criterion = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=0.1)
    best_f1 = 0.0

    optimizer = torch.optim.AdamW(
        filter(lambda p: p.requires_grad, model.parameters()), 
        lr=lr_head, 
        weight_decay=0.05
    )
    
    for epoch in range(epochs_head):
        train_loss, train_f1 = run_epoch(model, train_loader, criterion, optimizer, device, train=True)
        val_loss, val_f1 = run_epoch(model, val_loader, criterion, optimizer, device, train=False)
        print(f"[stage2-{part}-head] epoch {epoch:02d} train_f1={train_f1:.4f} val_f1={val_f1:.4f}")
        
        # Save based on F1
        if val_f1 > best_f1:
            best_f1 = val_f1
            torch.save(model.state_dict(), output_path)

    unfreeze_last_blocks(model, block_indices=(10, 11, 12))
    optimizer = torch.optim.AdamW(
        filter(lambda p: p.requires_grad, model.parameters()), 
        lr=lr_finetune, 
        weight_decay=0.05
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs_finetune)

    for epoch in range(epochs_finetune):
        train_loss, train_f1 = run_epoch(model, train_loader, criterion, optimizer, device, train=True)
        val_loss, val_f1 = run_epoch(model, val_loader, criterion, optimizer, device, train=False)
        scheduler.step()
        
        print(f"[stage2-{part}-finetune] epoch {epoch:02d} train_f1={train_f1:.4f} val_f1={val_f1:.4f}")
        if val_f1 > best_f1:
            best_f1 = val_f1
            torch.save(model.state_dict(), output_path)
            print(f"[stage2-{part}] new best saved (val_f1={best_f1:.4f})")

    model.load_state_dict(torch.load(output_path, map_location=device, weights_only=True))
    print(f"\n[stage2-{part}] Per-class report (best checkpoint):")
    evaluate_per_class(model, val_loader, classes, device)
    
    export_for_mobile(output_path, len(classes), mobile_output_path)

    volume.commit()
    return {"part": part, "best_f1": best_f1, "classes": classes}
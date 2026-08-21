import os
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
from torchvision import transforms
from torchvision.datasets import ImageFolder
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights

from modal_app import VOL_PATH


# Builds MobileNetV3Small
def build_model(num_classes: int, pretrained_backbone_path: str = None, freeze_backbone: bool = False):
    if pretrained_backbone_path:
        model = mobilenet_v3_small(weights=None)
        state = torch.load(pretrained_backbone_path, map_location="cpu", weights_only=True)
        model.load_state_dict(state, strict=False)  # backbone-only checkpoint, no classifier layer
    else:
        model = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1)

    # swap the final layer to match the number of target classes
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Linear(in_features, num_classes)

    if freeze_backbone:
        # lock everything except the new classifier head
        for name, p in model.named_parameters():
            if "classifier" not in name:
                p.requires_grad = False

    return model


# Unlocks the last few backbone blocks for fine-tuning
def unfreeze_last_blocks(model, block_indices=(10, 11, 12)):
    for name, p in model.named_parameters():
        if any(f"features.{i}." in name for i in block_indices):
            p.requires_grad = True


IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

# Image preprocessing — augmented for training, plain resize/crop for validation
def get_transforms(train: bool):
    if train:
        return transforms.Compose([
            transforms.RandomResizedCrop(224, scale=(0.7, 1.0)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomRotation(15),
            transforms.ColorJitter(0.2, 0.2, 0.2),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ])
    return transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
    ])


# Loads PlantVillage dataset for Stage 1 backbone pretraining
def get_plantvillage_loaders(batch_size=64, num_workers=4, val_split=0.2, seed=42):
    root = f"{VOL_PATH}/plantvillage_raw/raw/color"

    train_view = ImageFolder(root, transform=get_transforms(train=True))
    val_view = ImageFolder(root, transform=get_transforms(train=False))

    n_val = int(len(train_view) * val_split)
    n_train = len(train_view) - n_val
    generator = torch.Generator().manual_seed(seed)
    train_idx, val_idx = torch.utils.data.random_split(range(len(train_view)), [n_train, n_val], generator=generator)
    train_idx, val_idx = list(train_idx), list(val_idx)

    train_ds = torch.utils.data.Subset(train_view, train_idx)
    val_ds = torch.utils.data.Subset(val_view, val_idx)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=num_workers)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers)

    return train_loader, val_loader, train_view.classes


# Loads the cinnamon dataset for Stage 2 fine-tuning
# Uses weighted sampling so small classes get seen as often as large ones
def get_cinnamon_loaders(root, batch_size=16, val_split=0.15, num_workers=4, seed=42, use_weighted_sampler=True):
    train_view = ImageFolder(root, transform=get_transforms(train=True))
    val_view = ImageFolder(root, transform=get_transforms(train=False))

    n_val = int(len(train_view) * val_split)
    n_train = len(train_view) - n_val
    generator = torch.Generator().manual_seed(seed)
    train_idx, val_idx = torch.utils.data.random_split(
        range(len(train_view)), [n_train, n_val], generator=generator
    )
    train_idx, val_idx = list(train_idx), list(val_idx)

    train_ds = torch.utils.data.Subset(train_view, train_idx)
    val_ds = torch.utils.data.Subset(val_view, val_idx)

    sampler = None
    shuffle = True
    if use_weighted_sampler:
        # give rare classes higher pick probability so training sees them equally often
        targets = [train_view.samples[i][1] for i in train_idx]
        class_counts = torch.bincount(torch.tensor(targets))
        class_weights = 1.0 / class_counts.float()
        sample_weights = [class_weights[t] for t in targets]
        sampler = WeightedRandomSampler(sample_weights, num_samples=len(sample_weights), replacement=True)
        shuffle = False  # sampler and shuffle can't both be set

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=shuffle, sampler=sampler, num_workers=num_workers
    )
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers)

    return train_loader, val_loader, train_view.classes


# One pass over the data — training or validation, same loop either way
def run_epoch(model, loader, criterion, optimizer, device, train=True):
    model.train() if train else model.eval()
    total_loss, correct, total = 0.0, 0, 0

    context = torch.enable_grad() if train else torch.no_grad()
    with context:
        for x, y in loader:
            x, y = x.to(device), y.to(device)
            if train:
                optimizer.zero_grad()
            logits = model(x)
            loss = criterion(logits, y)
            if train:
                loss.backward()
                optimizer.step()

            total_loss += loss.item() * x.size(0)
            correct += (logits.argmax(1) == y).sum().item()
            total += x.size(0)

    return total_loss / total, correct / total


# Prints precision/recall/f1 per class 
def evaluate_per_class(model, loader, classes, device):
    from sklearn.metrics import classification_report

    model.eval()
    all_preds, all_labels = [], []
    with torch.no_grad():
        for x, y in loader:
            x = x.to(device)
            preds = model(x).argmax(1).cpu()
            all_preds.extend(preds.tolist())
            all_labels.extend(y.tolist())

    report = classification_report(all_labels, all_preds, target_names=classes, zero_division=0)
    print(report)
    return report


# Prints a confusion matrix
def evaluate_confusion_matrix(model, loader, classes, device):
    from sklearn.metrics import confusion_matrix

    model.eval()
    all_preds, all_labels = [], []
    with torch.no_grad():
        for x, y in loader:
            x = x.to(device)
            preds = model(x).argmax(1).cpu()
            all_preds.extend(preds.tolist())
            all_labels.extend(y.tolist())

    cm = confusion_matrix(all_labels, all_preds)
    print("\nConfusion matrix (rows=true, cols=predicted):")
    header = "".join(f"{c[:10]:>12}" for c in classes)
    print(" " * 16 + header)
    for i, row in enumerate(cm):
        row_str = "".join(f"{v:>12}" for v in row)
        print(f"{classes[i][:14]:>14}{row_str}")

    return cm
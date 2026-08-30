import os
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from torchvision.datasets import ImageFolder
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights
from sklearn.metrics import f1_score
from torch.utils.mobile_optimizer import optimize_for_mobile
from tqdm import tqdm
from PIL import ImageFile
from modal_app import VOL_PATH

ImageFile.LOAD_TRUNCATED_IMAGES = True

# Builds MobileNetV3Small with increased dropout
def build_model(num_classes: int, pretrained_backbone_path: str = None, freeze_backbone: bool = False):
    if pretrained_backbone_path:
        model = mobilenet_v3_small(weights=None)
        state = torch.load(pretrained_backbone_path, map_location="cpu", weights_only=True)
        model.load_state_dict(state, strict=False)  # backbone-only checkpoint
    else:
        model = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1)

    # swap the final layer and increase dropout to combat overfitting
    in_features = model.classifier[3].in_features
    model.classifier[2] = nn.Dropout(p=0.5, inplace=True)
    model.classifier[3] = nn.Linear(in_features, num_classes)

    if freeze_backbone:
        for name, p in model.named_parameters():
            if "classifier" not in name:
                p.requires_grad = False

    return model


def unfreeze_last_blocks(model, block_indices=(10, 11, 12)):
    for name, p in model.named_parameters():
        if any(f"features.{i}." in name for i in block_indices):
            p.requires_grad = True


IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

# Added RandAugment and RandomErasing for heavy augmentation
def get_transforms(train: bool):
    if train:
        return transforms.Compose([
            transforms.RandomResizedCrop(224, scale=(0.6, 1.0)),
            transforms.RandomHorizontalFlip(),
            transforms.RandAugment(num_ops=2, magnitude=9), 
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
            transforms.RandomErasing(p=0.2), 
        ])
    return transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
    ])


def get_plantvillage_loaders(batch_size=64, num_workers=4, val_split=0.2, seed=42):
    root = f"{VOL_PATH}/plantvillage_raw/raw/color"
    train_view = ImageFolder(root, transform=get_transforms(train=True))
    val_view = ImageFolder(root, transform=get_transforms(train=False))

    n_val = int(len(train_view) * val_split)
    n_train = len(train_view) - n_val
    generator = torch.Generator().manual_seed(seed)
    train_idx, val_idx = torch.utils.data.random_split(range(len(train_view)), [n_train, n_val], generator=generator)

    train_ds = torch.utils.data.Subset(train_view, list(train_idx))
    val_ds = torch.utils.data.Subset(val_view, list(val_idx))

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=num_workers)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers)

    return train_loader, val_loader, train_view.classes


# Replaced WeightedRandomSampler with Class Weights calculation
def get_cinnamon_loaders(root, batch_size=16, val_split=0.15, num_workers=4, seed=42):
    train_view = ImageFolder(root, transform=get_transforms(train=True))
    val_view = ImageFolder(root, transform=get_transforms(train=False))

    n_val = int(len(train_view) * val_split)
    n_train = len(train_view) - n_val
    generator = torch.Generator().manual_seed(seed)
    train_idx, val_idx = torch.utils.data.random_split(range(len(train_view)), [n_train, n_val], generator=generator)
    train_idx, val_idx = list(train_idx), list(val_idx)

    train_ds = torch.utils.data.Subset(train_view, train_idx)
    val_ds = torch.utils.data.Subset(val_view, val_idx)

    # Calculate class weights for the CrossEntropyLoss
    targets = [train_view.samples[i][1] for i in train_idx]
    class_counts = torch.bincount(torch.tensor(targets))
    total_samples = len(targets)
    class_weights = total_samples / (len(class_counts) * class_counts.float())

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=num_workers)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers)

    return train_loader, val_loader, train_view.classes, class_weights


# Keep Batch Norm frozen during training
def set_bn_eval(m):
    if isinstance(m, nn.modules.batchnorm._BatchNorm):
        m.eval()

# Tracking F1-Score instead of plain accuracy
def run_epoch(model, loader, criterion, optimizer, device, train=True):
    if train:
        model.train()
        model.apply(set_bn_eval)
    else:
        model.eval()
        
    total_loss, total = 0.0, 0
    all_preds, all_labels = [], []

    context = torch.enable_grad() if train else torch.no_grad()
    with context:
        for x, y in tqdm(loader, desc="Training" if train else "Validating", leave=False):
            x, y = x.to(device), y.to(device)
            if train:
                optimizer.zero_grad()
            logits = model(x)
            loss = criterion(logits, y)
            if train:
                loss.backward()
                optimizer.step()

            total_loss += loss.item() * x.size(0)
            total += x.size(0)
            
            all_preds.extend(logits.argmax(1).cpu().tolist())
            all_labels.extend(y.cpu().tolist())

    epoch_f1 = f1_score(all_labels, all_preds, average="macro")
    return total_loss / total, epoch_f1


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

def export_for_mobile(model_path, num_classes, output_path):
    device = "cpu"
    model = build_model(num_classes=num_classes).to(device)
    model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))
    model.eval()

    example_input = torch.rand(1, 3, 224, 224)
    traced_script_module = torch.jit.trace(model, example_input)
    optimized_module = optimize_for_mobile(traced_script_module)
    
    optimized_module._save_for_lite_interpreter(output_path)
    print(f"Exported to TorchScript Lite for React Native: {output_path}")
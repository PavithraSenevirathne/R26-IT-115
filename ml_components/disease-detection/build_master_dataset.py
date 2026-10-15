import csv
import shutil
from pathlib import Path
from collections import defaultdict

SOURCE_ROOT = Path("RF")
TARGET_ROOT = Path("cinnamon_dataset") 
IMG_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# maps each source dataset's folder/column names to the final leaf/stem class names
# MANIFEST = [
#     {"source_dir": "FOL_1", "format": "folder", "class_map": {"LeafBlight": ("leaf", "leaf_blight"), "LeafGall": ("leaf", "leaf_gall")}},
#     {"source_dir": "FOL_2", "format": "folder", "class_map": {"Healthy_Cinnamon": ("leaf","healthy_leaves"), "Leaf_Gall_Forming_Disease": ("leaf", "leaf_gall"), "Leaf_Spot_Disease": ("leaf", "leaf_spot")}},
#     {"source_dir": "FOL_3", "format": "folder", "class_map": {"Healthy": ("leaf","healthy_leaves"), "Leaf_Gall_Forming": ("leaf", "leaf_gall"), "leaf_spot_disease": ("leaf", "leaf_spot")}},
#     {"source_dir": "FOL_4", "format": "flat_folder", "class_map": {"RoughBark": ("stem", "rough_bark"), "StripeCanker": ("stem", "stripe_canker")}},
#     {"source_dir": "FOL_5", "format": "flat_folder", "class_map": {"HealthyStem": ("stem", "healthy_stem")}},
#     {"source_dir": "MCL_1", "format": "multilabel_csv", "class_map": {"leaf_spot_disease": ("leaf", "leaf_spot")}},
#     {"source_dir": "MCL_2", "format": "multilabel_csv", "class_map": {"healthy_leaves": ("leaf","healthy_leaves")}},
#     {"source_dir": "MCL_3", "format": "multilabel_csv", "class_map": {"rough_bark": ("stem","rough_bark"), "healthy_cinnamon": ("leaf","healthy_leaves"), "leaf_spot_disease": ("leaf", "leaf_spot"), "stripe_canker": ("stem", "stripe_canker")}},
#     {"source_dir": "MCL_4", "format": "multilabel_csv", "class_map": {"healthy_leaves": ("leaf","healthy_leaves"), "leaf_spot_disease": ("leaf", "leaf_spot")}},
# ]

MANIFEST = [
    # {"source_dir": "1", "format": "multilabel_csv", "class_map": {"rough_bark": ("stem", "rough_bark"), "StripeCanker": ("stem", "stripe_canker")}},
    # {"source_dir": "2", "format": "multilabel_csv", "class_map": {"Stripe-Canker-high-stage": ("stem", "stripe_canker"), "Stripe-Canker-low-stage": ("stem", "stripe_canker"), "Stripe-Canker-medium-stage": ("stem", "stripe_canker"), "leaf-spot-high-stage": ("leaf", "leaf_spot"), "leaf-spot-low-stage": ("leaf", "leaf_spot"), "leaf-spot-medium-stage": ("leaf", "leaf_spot")}},
    {"source_dir": "3", "format": "multilabel_csv", "class_map": {"roughbark": ("stem", "rough_bark")}},
]

review_log = [] 


# copies a file into the target folder, adding a prefix so same-named files don't overwrite each other
def copy_with_unique_name(src_file: Path, dest_dir: Path, prefix: str):
    dest_dir.mkdir(parents=True, exist_ok=True)
    new_name = f"{prefix}__{src_file.name}"
    dest_path = dest_dir / new_name
    counter = 1
    while dest_path.exists():
        dest_path = dest_dir / f"{prefix}__{src_file.stem}_{counter}{src_file.suffix}"
        counter += 1
    shutil.copy2(src_file, dest_path)
    return dest_path

def process_folder_source(entry):
    source_dir = SOURCE_ROOT / entry["source_dir"]
    class_map = entry["class_map"]

    for split in ["train", "valid", "test"]:
        split_dir = source_dir / split
        if not split_dir.exists():
            continue
        for src_class, (target_part, target_class) in class_map.items():
            class_dir = split_dir / src_class
            if not class_dir.exists():
                print(f"  [warn] {class_dir} not found, skipping")
                continue
            dest_dir = TARGET_ROOT / target_part / target_class
            files = [f for f in class_dir.iterdir() if f.suffix.lower() in IMG_EXTENSIONS]
            for f in files:
                copy_with_unique_name(f, dest_dir, prefix=f"{entry['source_dir']}_{split}")
            print(f"  {entry['source_dir']}/{split}/{src_class} -> {target_part}/{target_class} ({len(files)} images)")


# handles datasets with no train/valid/test split, just class folders directly
def process_flat_folder_source(entry):
    source_dir = SOURCE_ROOT / entry["source_dir"]
    class_map = entry["class_map"]

    for src_class, (target_part, target_class) in class_map.items():
        class_dir = source_dir / src_class
        if not class_dir.exists():
            print(f"  [warn] {class_dir} not found, skipping")
            continue
        dest_dir = TARGET_ROOT / target_part / target_class
        files = [f for f in class_dir.iterdir() if f.suffix.lower() in IMG_EXTENSIONS]
        for f in files:
            copy_with_unique_name(f, dest_dir, prefix=entry["source_dir"])
        print(f"  {entry['source_dir']}/{src_class} -> {target_part}/{target_class} ({len(files)} images)")


# handles Roboflow multi-label CSV exports
def process_multilabel_csv_source(entry):
    source_dir = SOURCE_ROOT / entry["source_dir"]
    class_map = entry["class_map"]

    for split in ["train", "valid", "test"]:
        split_dir = source_dir / split
        csv_path = split_dir / "_classes.csv"
        if not csv_path.exists():
            continue

        with open(csv_path, newline="") as f:
            reader = csv.DictReader(f)
            reader.fieldnames = [name.strip() for name in reader.fieldnames]
            relevant_cols = [c for c in class_map if c in reader.fieldnames]

            counts = defaultdict(int)
            for row in reader:
                row = {k.strip(): v.strip() for k, v in row.items()}
                filename = row.get("filename") or row.get("filepaths")
                active_classes = [c for c in relevant_cols if row.get(c) == "1"]

                if len(active_classes) == 0:
                    continue  
                if len(active_classes) > 1:
                    review_log.append((entry["source_dir"], split, filename, active_classes))
                    continue  

                target_part, target_class = class_map[active_classes[0]]
                src_file = split_dir / filename
                if not src_file.exists():
                    print(f"  [warn] {src_file} listed in csv but not found on disk")
                    continue

                dest_dir = TARGET_ROOT / target_part / target_class
                copy_with_unique_name(src_file, dest_dir, prefix=f"{entry['source_dir']}_{split}")
                counts[(target_part, target_class)] += 1

            for (part, cls), n in counts.items():
                print(f"  {entry['source_dir']}/{split} -> {part}/{cls} ({n} images)")


def main():
    for entry in MANIFEST:
        print(f"Processing {entry['source_dir']} ({entry['format']})...")
        if entry["format"] == "folder":
            process_folder_source(entry)
        elif entry["format"] == "flat_folder":
            process_flat_folder_source(entry)
        elif entry["format"] == "multilabel_csv":
            process_multilabel_csv_source(entry)
        else:
            raise ValueError(f"Unknown format: {entry['format']}")

    if review_log:
        print(f"\n{len(review_log)} multi-label rows were skipped (need manual check):")
        for source, split, filename, classes in review_log[:20]:
            print(f"{source}/{split}/{filename}: {classes}")

    print("\nFinal counts:")
    for part in ["leaf", "stem"]:
        part_dir = TARGET_ROOT / part
        if not part_dir.exists():
            continue
        for class_dir in sorted(part_dir.iterdir()):
            if class_dir.is_dir():
                n = len(list(class_dir.iterdir()))
                print(f"  {part}/{class_dir.name}: {n}")


if __name__ == "__main__":
    main()
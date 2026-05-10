import os
import shutil
import yaml
import glob
from PIL import Image

# MASTER CLASS DEFINITIONS
MASTER_CLASSES = {
    "beetles": 0,
    "caterpillars": 1,
    "weevil": 2,
    "stem borer": 3,
    "leaf webber": 4,
    "thrips": 5,
    "root grubs": 6
}

# Reverse mapping for reporting
ID_TO_NAME = {v: k.title() for k, v in MASTER_CLASSES.items()}

# Track image counts per class
class_image_counts = {v: 0 for v in MASTER_CLASSES.values()}

RAW_DATA_DIR = "./raw_datasets"
MASTER_DIR = "./master_dataset"
SPLITS = ['train', 'test', 'valid']


# HELPER FUNCTIONS

def normalize_class_name(name):
    # Normalize class names for better matching.
    return name.lower().replace("-", " ").replace("_", " ").strip()


def match_class_to_master(local_class_name):
    # Fuzzy match local dataset class names to master classes.
    # Uses keyword containment instead of exact matching.
    name = normalize_class_name(local_class_name)
    for master_name in MASTER_CLASSES:
        if master_name in name:
            return MASTER_CLASSES[master_name]

    return None


def find_image_file(image_dir, base_name):
    # Safely find corresponding image file with preferred extensions.
    for ext in [".jpg", ".jpeg", ".png"]:
        candidate = os.path.join(image_dir, base_name + ext)
        if os.path.exists(candidate):
            return candidate
    return None


def validate_image(img_path):
    # Ensure image is not corrupted.
    try:
        with Image.open(img_path) as img:
            img.verify()
        return True
    except:
        return False


# CREATE MASTER DIRECTORY STRUCTURE
for split in SPLITS:
    os.makedirs(os.path.join(MASTER_DIR, split, "images"), exist_ok=True)
    os.makedirs(os.path.join(MASTER_DIR, split, "labels"), exist_ok=True)


# MAIN PROCESSING FUNCTION
def process_dataset(dataset_path, dataset_name):
    yaml_path = os.path.join(dataset_path, "data.yaml")

    if not os.path.exists(yaml_path):
        print(f"Skipping {dataset_name}: No data.yaml found.")
        return

    # Load dataset class names
    with open(yaml_path, 'r') as file:
        data = yaml.safe_load(file)
        local_classes = data.get('names', [])

    # Create mapping: local ID -> master ID
    local_to_master = {}

    for local_id, class_name in enumerate(local_classes):
        master_id = match_class_to_master(class_name)

        if master_id is not None:
            local_to_master[local_id] = master_id

    if not local_to_master:
        print(f"Skipping {dataset_name}: No matching pests found.")
        return

    print(f"\nProcessing {dataset_name}")
    print(f"Class mappings: {local_to_master}")

    # Process each split
    for split in SPLITS:
        split_path = os.path.join(dataset_path, split)

        if not os.path.exists(split_path):
            continue

        print(f" > Processing {split} split")

        label_dir = os.path.join(split_path, "labels")
        image_dir = os.path.join(split_path, "images")

        if not os.path.exists(label_dir) or not os.path.exists(image_dir):
            continue

        label_files = glob.glob(os.path.join(label_dir, "*.txt"))

        for label_file in label_files:
            with open(label_file, 'r') as f:
                lines = f.readlines()

            new_labels = []
            classes_in_this_image = set()

            # Process Labels
            for line in lines:
                parts = line.strip().split()

                if not parts:
                    continue

                try:
                    local_class_id = int(parts[0])
                except:
                    continue

                # Map to master class
                if local_class_id in local_to_master:
                    master_id = local_to_master[local_class_id]

                    new_line = f"{master_id} " + " ".join(parts[1:])
                    new_labels.append(new_line)

                    classes_in_this_image.add(master_id)

            # Skip if no valid objects
            if not new_labels:
                continue

            base_name = os.path.basename(label_file).replace('.txt', '')

            # Find Image
            img_path = find_image_file(image_dir, base_name)

            if not img_path:
                continue

            # Validate image
            if not validate_image(img_path):
                print(f"Skipping corrupted image: {img_path}")
                continue

            img_ext = os.path.splitext(img_path)[1]

            # Unique naming to avoid collisions
            new_base_name = f"{dataset_name}_{base_name}"

            dest_label_path = os.path.join(
                MASTER_DIR, split, "labels", f"{new_base_name}.txt"
            )

            dest_image_path = os.path.join(
                MASTER_DIR, split, "images", f"{new_base_name}{img_ext}"
            )

            # Save new label file
            with open(dest_label_path, 'w') as f:
                f.write("\n".join(new_labels))

            # Copy image
            shutil.copy(img_path, dest_image_path)

            # Update class counts
            for c_id in classes_in_this_image:
                class_image_counts[c_id] += 1


# RUN PIPELINE
for dataset_folder in os.listdir(RAW_DATA_DIR):
    folder_path = os.path.join(RAW_DATA_DIR, dataset_folder)

    if os.path.isdir(folder_path):
        process_dataset(folder_path, dataset_folder)


#  GENERATE FINAL YAML
print("\nGenerating data.yaml")

yaml_content = f"""train: ./train/images
val: ./valid/images
test: ./test/images

nc: {len(MASTER_CLASSES)}
names: {list(ID_TO_NAME.values())}
"""

with open(os.path.join(MASTER_DIR, "data.yaml"), 'w') as yaml_file:
    yaml_file.write(yaml_content)


# FINAL REPORT
print("Dataset Aggregation Complete !")
print(f"Master dataset saved to: {MASTER_DIR}")
print("data.yaml successfully created.\n")

print("Image counts per class:")

for master_id, count in class_image_counts.items():
    print(f"[{master_id}] {ID_TO_NAME[master_id]:<15}: {count} images")
import os
import shutil
import random
import cv2
import albumentations as A

# CONFIGURATION
INPUT_DIR = "./master_dataset/train"
OUTPUT_DIR = "./balanced_dataset/train"

TARGET_COUNT = 1500
NUM_CLASSES = 7
WEEVIL_CLASS_ID = 2

os.makedirs(os.path.join(OUTPUT_DIR, "images"), exist_ok=True)
os.makedirs(os.path.join(OUTPUT_DIR, "labels"), exist_ok=True)

# AUGMENTATION PIPELINE
transform = A.Compose([
    A.HorizontalFlip(p=0.5),
    A.VerticalFlip(p=0.3),
    A.RandomRotate90(p=0.3),

    A.ShiftScaleRotate(
        shift_limit=0.05,
        scale_limit=0.1,
        rotate_limit=20,
        p=0.4
    ),

    A.RandomBrightnessContrast(p=0.4),
    A.ColorJitter(p=0.3),
    A.GaussianBlur(p=0.2),
    A.GaussNoise(p=0.2),
    A.CLAHE(p=0.2)

],
bbox_params=A.BboxParams(
    format='yolo',
    label_fields=['class_labels'],
    min_visibility=0.3
))

def clamp_bbox(bbox):
    # Clamp YOLO bbox values to valid range 
    x, y, w, h = bbox

    x = max(0.0, min(1.0, x))
    y = max(0.0, min(1.0, y))
    w = max(0.0, min(1.0, w))
    h = max(0.0, min(1.0, h))

    return [x, y, w, h]


def is_valid_bbox(bbox):
    # Remove broken boxes
    _, _, w, h = bbox
    return w > 0.001 and h > 0.001


def clean_yolo_labels(label_path):
    # Remove malformed labels Before processing
    cleaned = []

    if not os.path.exists(label_path):
        return

    with open(label_path, "r") as f:
        for line in f:
            parts = line.strip().split()

            # Only allow YOLO bbox format
            if len(parts) != 5:
                continue

            try:
                cls = int(parts[0])
                bbox = list(map(float, parts[1:]))

                bbox = clamp_bbox(bbox)

                if not is_valid_bbox(bbox):
                    continue

                cleaned.append(
                    f"{cls} {bbox[0]:.6f} {bbox[1]:.6f} {bbox[2]:.6f} {bbox[3]:.6f}"
                )
            except:
                continue

    with open(label_path, "w") as f:
        f.write("\n".join(cleaned))


def read_yolo_label(label_path):
    bboxes, class_labels = [], []

    with open(label_path, 'r') as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) == 5:
                class_labels.append(int(parts[0]))
                bboxes.append(list(map(float, parts[1:])))

    return bboxes, class_labels


def get_label_path(img_file):
    base = os.path.splitext(img_file)[0]
    return os.path.join(INPUT_DIR, "labels", base + ".txt")


def get_classes_in_file(label_path):
    if not os.path.exists(label_path):
        return []

    classes = []
    with open(label_path, 'r') as f:
        for line in f:
            if line.strip():
                classes.append(int(line.split()[0]))
    return classes


def is_dominant_class(label_path, target_class):
    classes = get_classes_in_file(label_path)
    if not classes:
        return False

    return classes.count(target_class) >= len(classes) / 2


# CLEAN ORIGINAL LABELS
print("Cleaning original labels")

for file in os.listdir(os.path.join(INPUT_DIR, "labels")):
    clean_yolo_labels(os.path.join(INPUT_DIR, "labels", file))


# SCAN DATASET
print("Scanning dataset")

image_files = [
    f for f in os.listdir(os.path.join(INPUT_DIR, "images"))
    if f.lower().endswith((".jpg", ".png", ".jpeg"))
]

class_to_images = {i: [] for i in range(NUM_CLASSES)}
weevil_only_images = []

for img_file in image_files:
    label_path = get_label_path(img_file)
    classes_present = set(get_classes_in_file(label_path))

    for c in classes_present:
        class_to_images[c].append(img_file)

    if len(classes_present) == 1 and WEEVIL_CLASS_ID in classes_present:
        weevil_only_images.append(img_file)


# UNDERSAMPLING
weevils_to_remove = len(class_to_images[WEEVIL_CLASS_ID]) - TARGET_COUNT
images_to_skip = set()

if weevils_to_remove > 0:
    images_to_skip = set(random.sample(
        weevil_only_images,
        min(weevils_to_remove, len(weevil_only_images))
    ))


# COPY BASE DATA
print("Copying base dataset")

for img_file in image_files:
    if img_file in images_to_skip:
        continue

    base = os.path.splitext(img_file)[0]

    shutil.copy(
        os.path.join(INPUT_DIR, "images", img_file),
        os.path.join(OUTPUT_DIR, "images", img_file)
    )

    shutil.copy(
        os.path.join(INPUT_DIR, "labels", base + ".txt"),
        os.path.join(OUTPUT_DIR, "labels", base + ".txt")
    )


# AUGMENTATION
print("Applying augmentation")

for class_id in range(NUM_CLASSES):

    current_images = [
        f for f in class_to_images[class_id]
        if f not in images_to_skip
    ]

    needed = TARGET_COUNT - len(current_images)

    if needed <= 0:
        continue

    source_images = [
        f for f in current_images
        if is_dominant_class(get_label_path(f), class_id)
    ]

    if not source_images:
        continue

    for i in range(needed):

        img_file = random.choice(source_images)
        base = os.path.splitext(img_file)[0]
        ext = os.path.splitext(img_file)[1]

        img_path = os.path.join(INPUT_DIR, "images", img_file)
        label_path = get_label_path(img_file)

        image = cv2.imread(img_path)
        if image is None:
            continue

        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        bboxes, labels = read_yolo_label(label_path)
        if not bboxes:
            continue

        try:
            transformed = transform(
                image=image,
                bboxes=bboxes,
                class_labels=labels
            )

            aug_img = transformed["image"]
            aug_bboxes = transformed["bboxes"]
            aug_labels = transformed["class_labels"]

            valid = []

            for bbox, lbl in zip(aug_bboxes, aug_labels):
                bbox = clamp_bbox(bbox)

                if not is_valid_bbox(bbox):
                    continue

                valid.append((bbox, lbl))

            # Skip if no valid boxes
            if not valid:
                continue

            # Ensure target class still exists
            if class_id not in [v[1] for v in valid]:
                continue

            # Save
            new_name = f"aug_{class_id}_{i}_{base}"

            cv2.imwrite(
                os.path.join(OUTPUT_DIR, "images", new_name + ext),
                cv2.cvtColor(aug_img, cv2.COLOR_RGB2BGR)
            )

            with open(os.path.join(OUTPUT_DIR, "labels", new_name + ".txt"), "w") as f:
                for bbox, lbl in valid:
                    f.write(
                        f"{lbl} "
                        f"{bbox[0]:.6f} "
                        f"{bbox[1]:.6f} "
                        f"{bbox[2]:.6f} "
                        f"{bbox[3]:.6f}\n"
                    )

        except Exception:
            continue

print("\nBalancing complete!")
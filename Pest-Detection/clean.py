import os

LABEL_DIR = "./balanced_dataset/train/labels"

def fix_bbox(bbox):
    x, y, w, h = bbox

    # Clamp values to [0, 1]
    x = max(0.0, min(1.0, x))
    y = max(0.0, min(1.0, y))
    w = max(0.0, min(1.0, w))
    h = max(0.0, min(1.0, h))

    return [x, y, w, h]


def clean_label_file(path):
    cleaned_lines = []

    with open(path, "r") as f:
        for line in f:
            parts = line.strip().split()

            # Remove segmentation / invalid formats
            if len(parts) != 5:
                continue

            try:
                cls = int(parts[0])
                bbox = list(map(float, parts[1:]))

                bbox = fix_bbox(bbox)

                # Remove zero-size boxes
                if bbox[2] <= 0 or bbox[3] <= 0:
                    continue

                cleaned_lines.append(
                    f"{cls} {bbox[0]:.6f} {bbox[1]:.6f} {bbox[2]:.6f} {bbox[3]:.6f}"
                )

            except:
                continue

    # Overwrite file
    with open(path, "w") as f:
        f.write("\n".join(cleaned_lines))


print("Cleaning dataset")

for file in os.listdir(LABEL_DIR):
    clean_label_file(os.path.join(LABEL_DIR, file))

print("Dataset cleaned")

def validate_dataset(label_dir):
    bad_files = 0

    for file in os.listdir(label_dir):
        path = os.path.join(label_dir, file)

        with open(path) as f:
            for line in f:
                parts = list(map(float, line.split()[1:]))

                if any(p < 0 or p > 1 for p in parts):
                    bad_files += 1
                    break

    print(f"Invalid files remaining: {bad_files}")

validate_dataset("./balanced_dataset/train/labels")
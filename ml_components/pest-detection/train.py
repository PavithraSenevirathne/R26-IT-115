import modal

# Initialize the Modal application
app = modal.App("cinnamon-pest-yolov11n")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0") 
    .pip_install(
        "ultralytics==8.3.0",
        "torch",
        "torchvision",
        "Pillow",
        "pyyaml",
        "opencv-python-headless",
    )
)

# Connect to the persistent cloud volume for data storage
volume = modal.Volume.from_name("cinnamon-pest-vol", create_if_missing=True)
VOL_PATH = "/data"

# Define the target 8-class schema for pest identification
CLASS_NAMES = [
    "stem_borer", "thrips", "moth", "mite",
    "leaf_miner", "root_grub", "caterpillar", "weevil",
]

# Define a remote function to verify the dataset structure and file counts
@app.function(volumes={VOL_PATH: volume})
def confirm_dataset():
    import os
    # Loop through each data split to count images and labels
    for split in ["train", "val", "test"]:
        img_dir = f"{VOL_PATH}/cinnamon_pests_yolo/{split}/images"
        lbl_dir = f"{VOL_PATH}/cinnamon_pests_yolo/{split}/labels"
        n_img = len(os.listdir(img_dir)) if os.path.exists(img_dir) else 0
        n_lbl = len(os.listdir(lbl_dir)) if os.path.exists(lbl_dir) else 0
        print(f"{split}: {n_img} images, {n_lbl} labels")


# Define the remote training function with GPU 
@app.function(
    image=image,
    gpu="H100",
    timeout=60 * 60 * 8,
    volumes={VOL_PATH: volume},
)
def train():
    from ultralytics import YOLO
    import yaml

    dataset_root = f"{VOL_PATH}/cinnamon_pests_yolo"

    # Construct the dataset configuration dictionary
    data_yaml = {
        "path": dataset_root,
        "train": "train/images",
        "val": "val/images",
        "test": "test/images",
        "nc": len(CLASS_NAMES),
        "names": {i: name for i, name in enumerate(CLASS_NAMES)},
    }
    yaml_path = f"{dataset_root}/cinnamon_pests.yaml"
    
    # Save the YAML configuration file to the volume
    with open(yaml_path, "w") as f:
        yaml.dump(data_yaml, f, sort_keys=False)

    # Initialize the YOLOv11 Nano model with COCO pre-trained weights
    model = YOLO("yolo11s.pt")

    # Start the training process with specified hyperparameters and augmentations
    model.train(
        data=yaml_path,
        epochs=100,
        patience=25,
        imgsz=640,
        batch=16,
        lr0=0.01,
        lrf=0.01,
        optimizer="auto",
        cos_lr=True,
        warmup_epochs=3,

        # Augmentation
        mosaic=1.0,
        mixup=0.15,
        copy_paste=0.3,
        erasing=0.3,
        degrees=15.0,
        translate=0.1,
        scale=0.5,
        shear=2.0,
        flipud=0.5,
        fliplr=0.5,
        hsv_h=0.03,
        hsv_s=0.9,
        hsv_v=0.5,

        # Loss weighting 
        cls=1.0,
        box=5.0,
        dfl=1.5,

        device=0,
        workers=8,
        project=f"{VOL_PATH}/runs",
        name="ip102_pretrain_v1_small",
        exist_ok=True,
        save=True,
        save_period=10,
        plots=True,
        val=True,
        verbose=True,
    )

    # Save all training artifacts to the persistent storage
    volume.commit()
    print("Training complete.")

# Define a remote function to evaluate the trained model on the test split
@app.function(
    image=image,
    gpu="A10G",
    volumes={VOL_PATH: volume},
)
def evaluate():
    from ultralytics import YOLO

    # Define paths for the trained weights and dataset configuration
    weights_path = f"{VOL_PATH}/runs/ip102_pretrain_v1_small/weights/best.pt"
    data_yaml = f"{VOL_PATH}/cinnamon_pests_yolo/cinnamon_pests.yaml"

    # Load the trained model and run validation
    model = YOLO(weights_path)
    metrics = model.val(data=data_yaml, split="test")

    # Print overall performance metrics
    print("\n OVERALL METRICS (test split) ")
    print(f"mAP@50:     {metrics.box.map50:.4f}")
    print(f"mAP@50-95:  {metrics.box.map:.4f}")
    print(f"Precision:  {metrics.box.mp:.4f}")
    print(f"Recall:     {metrics.box.mr:.4f}")

    # Print detailed Average Precision metrics per class
    print("\n PER-CLASS AP@50 ")
    for i, name in enumerate(CLASS_NAMES):
        ap50 = metrics.box.ap50[i] if i < len(metrics.box.ap50) else float("nan")
        print(f"  {name:15s}: {ap50:.4f}")

    # Flag any class significantly underperforming the mean
    mean_ap = metrics.box.map50
    print("\n CLASSES BELOW MEAN AP@50 ")
    for i, name in enumerate(CLASS_NAMES):
        ap50 = metrics.box.ap50[i] if i < len(metrics.box.ap50) else 0
        if ap50 < mean_ap * 0.7:
            print(f"  WARNING: {name} at {ap50:.4f} is well below mean {mean_ap:.4f}")


# Define a remote function to export the trained model to deployment formats
@app.function(image=image, volumes={VOL_PATH: volume})
def export():
    from ultralytics import YOLO

    # Load the best trained weights
    weights_path = f"{VOL_PATH}/runs/ip102_pretrain_v1_small/weights/best.pt"
    model = YOLO(weights_path)

    # Export model to ONNX format
    model.export(format="onnx", imgsz=640, simplify=True)

    # Export model to quantized TFLite format
    model.export(
        format="tflite",
        int8=True,
        imgsz=320,
        data=f"{VOL_PATH}/cinnamon_pests_yolo/cinnamon_pests.yaml",
    )

    # Save exported files to the persistent volume
    volume.commit()
    print("Export complete. Check /data/runs/ip102_pretrain_v1/weights/")


# Define the local execution sequence
@app.local_entrypoint()
def main():
    confirm_dataset.remote()
    train.remote()
    evaluate.remote()
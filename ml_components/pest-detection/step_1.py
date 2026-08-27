import modal
import subprocess
from pathlib import Path

# Initialize Modal application 
app    = modal.App("cinnamon-pest-finetune")
volume = modal.Volume.from_name("cinnamon-pest-vol", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install("ultralytics==8.3.0", "torch", "torchvision",
                 "opencv-python-headless", "pyyaml")
)

# Define the remote function to execute on the Modal A10G GPU
@app.function(
    image=image,
    gpu="A100",
    timeout=86400,
    volumes={"/data": volume}
)
def finetune_and_export():
    # Import YOLO and YAML libraries inside the container
    from ultralytics import YOLO
    import yaml

    yaml_candidates = [
        "/data/cinnamon_pests_yolo/cinnamon_pests.yaml",
        "/data/cinnamon_pests_yolo/data.yaml",
    ]
    data_yaml_path = None
    
    # Search for an existing YAML configuration file
    for candidate in yaml_candidates:
        if Path(candidate).exists():
            data_yaml_path = candidate
            break

    # Create a new configuration file if none was found
    if not data_yaml_path:
        data_yaml_path = "/data/cinnamon_pests_yolo/data.yaml"
        data = {
            "path":  "/data/cinnamon_pests_yolo",
            "train": "train/images",
            "val":   "val/images",
            "test":  "test/images",
            "nc":    8,
            "names": {
                0: "stem_borer", 1: "thrips",      2: "moth",        3: "mite",
                4: "leaf_miner", 5: "root_grub",   6: "caterpillar", 7: "weevil",
            },
        }
        with open(data_yaml_path, "w") as f:
            yaml.dump(data, f, sort_keys=False)
        print(f"Written fresh data.yaml to {data_yaml_path}")
    else:
        print(f"Using existing yaml: {data_yaml_path}")

    # Define the path to the baseline model weights
    pretrained_weights = "/data/best.pt"

    # Ensure the baseline weights exist before starting
    if not Path(pretrained_weights).exists():
        raise FileNotFoundError(
            f"IP102 weights not found at {pretrained_weights}\n"
        )

    # Initialize the YOLO model with the baseline weights
    model = YOLO(pretrained_weights)

    print("\n" + "=" * 50)
    print("STARTING FINE-TUNING")
    print("=" * 50)

    # Start the fine-tuning process with specified hyperparameters
    model.train(
        data=data_yaml_path,
        epochs=50,
        patience=15,
        imgsz=640,
        batch=16,
        freeze=10, 
        lr0=0.001,
        lrf=0.01,
        cos_lr=True,
        warmup_epochs=2,
        mosaic=1.0,
        mixup=0.1,
        flipud=0.5,
        fliplr=0.5,
        cls=0.6,
        box=7.5,
        dfl=1.5,
        device=0,
        workers=4,
        project="/data/runs",
        name="finetune_v1",
        exist_ok=True,
        save=True,
        plots=True,
        verbose=True,
    )

    # Save the training outputs to the persistent cloud volume
    volume.commit()

    print("\n" + "=" * 50)
    print("EVALUATING")
    print("=" * 50)

    # Define the path to the newly trained model weights
    best_model_path = "/data/runs/finetune_v1/weights/best.pt"

    # Verify the trained model weights were successfully saved
    if not Path(best_model_path).exists():
        raise FileNotFoundError(
            f"best.pt not found at {best_model_path}\n"
            "Training may have failed. Check the logs above."
        )

    # Load the trained model and run validation on the test split
    tuned_model = YOLO(best_model_path)
    val_metrics = tuned_model.val(data=data_yaml_path, split="test", verbose=False)

    # Define baseline metrics for performance comparison
    BASELINE = {
        0: 0.703, 1: 0.667, 2: 0.683, 3: 0.878,
        4: 0.843, 5: 0.967, 6: 0.752, 7: 0.956,
    }
    CLASS_NAMES = [
        "stem_borer", "thrips", "moth",  "mite",
        "leaf_miner", "root_grub", "caterpillar", "weevil",
    ]

    # Extract the new Average Precision metrics per class
    new_ap50 = {
        int(cls_id): float(ap)
        for cls_id, ap in zip(
            val_metrics.box.ap_class_index,
            val_metrics.box.ap50
        )
    }

    # Print a formatted table comparing new metrics against the baseline
    print(f"\n  {'Class':<14}  {'Baseline':>9}  {'New AP50':>9}  {'Delta':>8}")
    print("  " + "─" * 48)
    for c_id, name in enumerate(CLASS_NAMES):
        base   = BASELINE.get(c_id, 0.0)
        new_ap = new_ap50.get(c_id, 0.0)
        delta  = new_ap - base
        arrow  = "▲" if delta >= 0 else "▼"
        weak   = "  ← still weak" if new_ap < 0.70 else ""
        print(f"  {name:<14}  {base:>9.3f}  {new_ap:>9.3f}  {arrow}{abs(delta):.3f}{weak}")

    # Calculate and print the overall model improvement
    overall_base  = 0.806
    overall_delta = val_metrics.box.map50 - overall_base
    arrow = "▲" if overall_delta >= 0 else "▼"
    print("  " + "─" * 48)
    print(f"  {'OVERALL':<14}  {overall_base:>9.3f}  {val_metrics.box.map50:>9.3f}  {arrow}{abs(overall_delta):.3f}")

    print("\n" + "=" * 50)
    print("EXPORTING")
    print("=" * 50)

    # Export the model to ONNX format
    tuned_model.export(format="onnx", imgsz=640, simplify=True)
    print("ONNX exported")

    # Export the model to TFLite int8 format for edge deployment
    tuned_model.export(
        format="tflite",
        int8=True,
        data=data_yaml_path,
        imgsz=320,
    )
    print("TFLite int8 exported")

    # Save the exported models to the cloud volume
    volume.commit()
    print("\nAll done. Results saved to volume.")


# Define the local execution flow
@app.local_entrypoint()
def main():
    # Upload the local dataset to the Modal cloud volume
    # print("Uploading dataset to Modal volume")
    # subprocess.run([
    #     "modal", "volume", "put", "cinnamon-pest-vol",
    #     r"D:/CINNAMON/Pest/Pest-Detection/cinnamon_pests_yolo",
    #     "/cinnamon_pests_yolo"
    # ], check=True)

    # # Upload the baseline weights to the Modal cloud volume
    # print("Uploading IP102 weights")
    # subprocess.run([
    #     "modal", "volume", "put", "cinnamon-pest-vol",
    #     r"D:/CINNAMON/Pest/Pest-Detection/runs/ip102_pretrain_v1/weights/best.pt",
    #     "/best.pt"
    # ], check=True)

    # Trigger the remote fine-tuning function
    print("Starting fine-tune on Modal")
    finetune_and_export.remote()

    # Download the completed run files back to the local machine
    print("Downloading results")
    subprocess.run([
        "modal", "volume", "get", "cinnamon-pest-vol",
        "/runs",
        r"C:/kavinav/R26-IT-115/ml_components/pest-detection/runs_finetuned"
    ], check=True)

    print("Complete.")
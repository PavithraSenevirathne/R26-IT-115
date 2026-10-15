import sys
import modal
import subprocess
from pathlib import Path

# Initialize the Modal application
app = modal.App("cinnamon-pest-finetune")
volume = modal.Volume.from_name("cinnamon-pest-vol", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install(
        "ultralytics==8.3.0",
        "torch",
        "torchvision",
        "opencv-python-headless",
        "pyyaml",
    )
    .pip_install(
        "onnx",
        "onnxscript",
        "onnxslim",
        "onnxruntime",
        "tensorflow-cpu",
        "protobuf",
    )
    .pip_install("ml-dtypes>=0.4.0")
)

# Define the remote training function with GPU
@app.function(
    image=image,
    gpu="A100",
    timeout=86400,
    volumes={"/data": volume}
)
def finetune_and_export():
    from ultralytics import YOLO
    import yaml

    # Define the configuration data for the dataset
    data_yaml_path = "/data/cinnamon_pests_yolo/fixed_data.yaml"
    data = {
        "path":  "/data/cinnamon_pests_yolo",
        "train": "train/images",
        "val":   "val/images",
        "test":  "test/images",
        "nc":    8,
        "names": {
            0: "caterpillar", 1: "stem_borer", 2: "thrips", 3: "beetle",
            4: "grasshopper",
        },
    }
    
    # Save the generated YAML file to the volume
    with open(data_yaml_path, "w") as f:
        yaml.dump(data, f, sort_keys=False)
    print(f"YAML generation at {data_yaml_path}")

    # Define the path to the baseline model weights
    pretrained_weights = "/data/runs/ip102_pretrain_v1_small/weights/best.pt"

    # Ensure the baseline weights exist before starting the training process
    if not Path(pretrained_weights).exists():
        raise FileNotFoundError(
            f"IP102 weights not found at {pretrained_weights}\n"
            "Make sure the upload step completed successfully."
        )

    # Initialize the YOLO model using the baseline weights
    model = YOLO(pretrained_weights)

    print("\n" + "=" * 50)
    print("STARTING FINE-TUNING")
    print("=" * 50)

    # Start the fine-tuning process with the specified hyperparameters
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
        name="finetune_v2_small",
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
    best_model_path = "/data/runs/finetune_v2_small/weights/best.pt"

    # Verify the trained model weights were successfully saved
    if not Path(best_model_path).exists():
        raise FileNotFoundError(
            f"best.pt not found at {best_model_path}\n"
            "Training may have failed. Check the logs above."
        )

    # Load the newly trained model and run validation on the test split
    tuned_model = YOLO(best_model_path)
    val_metrics = tuned_model.val(data=data_yaml_path, split="test", verbose=False)

    print("\n" + "=" * 50)
    print("EXPORTING")
    print("=" * 50)

    # Export the model to ONNX format
    tuned_model.export(format="onnx", imgsz=640, simplify=True)
    print("ONNX exported")

    # Export the model to TFLite int8 format
    tuned_model.export(
        format="tflite",
        int8=True,
        data=data_yaml_path,
        imgsz=320,
    )
    print("TFLite int8 exported")

    # Save the exported models to the persistent cloud volume
    volume.commit()
    print("\nAll done. Results saved to volume.")

# Define a separate remote function for running only the export process
@app.function(
    image=image,
    volumes={"/data": volume}
)
def export_only():
    # Import YOLO inside the container
    from ultralytics import YOLO

    # Define paths for the model weights and configuration
    best_model_path = "/data/runs/finetune_v2_small/weights/best.pt"
    data_yaml_path  = "/data/cinnamon_pests_yolo/cinnamon_pests.yaml"

    # Load the fine-tuned model
    print("Loading fine-tuned weights")
    model = YOLO(best_model_path)

    # Execute ONNX export
    print("Exporting ONNX")
    model.export(format="onnx", imgsz=640, simplify=True)
    print("ONNX done.")

    # Execute TFLite int8 export
    print("Exporting TFLite int8")
    model.export(format="tflite", int8=True, imgsz=320, data=data_yaml_path)
    print("TFLite done.")

    # Save the exported files to the persistent volume
    volume.commit()
    print("Export complete. Files saved to volume.")

# Define the local execution flow
# @app.local_entrypoint()
# def main():
#     # Code to upload dataset to the volume
#     # print("Uploading dataset to Modal volume")
#     # subprocess.run([
#     #     sys.executable, "-m", "modal", "volume", "put", "--force", "cinnamon-pest-vol",
#     #     r"D:/CINNAMON/Pest/Pest-Detection/cinnamon_pests_yolo",
#     #     "/cinnamon_pests_yolo"
#     # ], check=True)

#     # Trigger the remote fine-tuning and export function
#     # print("Starting fine-tune")
#     # finetune_and_export.remote()

#     # Download the completed run files back to the local machine
#     print("Downloading results")
#     subprocess.run([
#         sys.executable, "-m", "modal", "volume", "get", "cinnamon-pest-vol",
#         "/runs",
#         r"C:/kavinav/R26-IT-115/ml_components/pest-detection/runs_finetuned"
#     ], check=True)

@app.local_entrypoint()
def main():
    import sys
    import os

    print("Starting remote export to generate ONNX...")
    export_only.remote()

    local_dest = r"C:/kavinav/R26-IT-115/ml_components/pest-detection/runs_finetuned"
    os.makedirs(local_dest, exist_ok=True)

    print("Downloading ONNX model only...")
    subprocess.run([
        sys.executable, "-m", "modal", "volume", "get", "cinnamon-pest-vol",
        "/runs/finetune_v2_small/weights/best.onnx", 
        local_dest
    ], check=True)
    
    print(f"Successfully downloaded best.onnx to {local_dest}")
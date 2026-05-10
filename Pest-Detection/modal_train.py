import modal
import os

# CLOUD ENVIRONMENT & STORAGE
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "ultralytics",
        "tensorflow-cpu",
        "onnx",
        "onnxslim",
        "onnxruntime"
    )
    .apt_install("libgl1", "libglib2.0-0")
)

app = modal.App("cinnamon-pest-mobile-trainer")

# Persistent dataset volume
dataset_volume = modal.Volume.from_name(
    "cinnamon-pest-data",
    create_if_missing=True
)

# TRAINING FUNCTION
@app.function(
    image=image,
    gpu="A100",
    timeout=86400,
    volumes={"/dataset": dataset_volume}
)
def train_and_export():
    from ultralytics import YOLO

    print("GPU ready. Volume attached. Starting training")

    os.chdir("/dataset")

    model = YOLO("yolo11n.pt")

    # TRAINING
    results = model.train(
        data="data.yaml",
        epochs=150,
        patience=25,
        imgsz=416,
        batch=16,
        device=0,

        project="/results",
        name="yolo_cinnamon_mobile",
        exist_ok=True,

        cache="disk",
        workers=4,
        amp=True,
        seed=42,

        mosaic=0.5,
        mixup=0.1,
        close_mosaic=10,

        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4,
        degrees=10.0,

        save_period=10
    )

    # EXPORT
    print("\nExporting INT8 TFLite model")

    model.export(
        format="tflite",
        int8=True,
        data="data.yaml",
        imgsz=416
    )

    # Correct path
    tflite_path = "/results/yolo_cinnamon_mobile/weights/best.tflite"

    if not os.path.exists(tflite_path):
        raise FileNotFoundError(f"TFLite model not found at {tflite_path}")

    print(f"Reading model from {tflite_path}")

    with open(tflite_path, "rb") as f:
        tflite_data = f.read()

    return tflite_data


# LOCAL ENTRYPOINT
@app.local_entrypoint()
def main():

    tflite_bytes = train_and_export.remote()

    print("Downloading trained model")

    local_save_path = "cinnamon_pest_offline_model.tflite"

    with open(local_save_path, "wb") as f:
        f.write(tflite_bytes)

    print(f"Model saved as: {local_save_path}")
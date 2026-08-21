import torch
from modal_app import app, base_image, volume, VOL_PATH

# separate image just for export 
export_image = (
    base_image
    .pip_install("onnx")
    .add_local_python_source("modal_app", "train_lib")
)

# Converts a trained checkpoint into ONNX format, ready for mobile inference
@app.function(image=export_image, gpu="A10G", volumes={VOL_PATH: volume}, timeout=900)
def export_model_to_onnx(part: str):
    from train_lib import build_model
    from torchvision.datasets import ImageFolder
    import os

    classes = ImageFolder(f"{VOL_PATH}/cinnamon_dataset/{part}").classes
    checkpoint_path = f"{VOL_PATH}/checkpoints/cinnamon_{part}_final.pt"
    export_dir = f"{VOL_PATH}/export/{part}"
    os.makedirs(export_dir, exist_ok=True)

    model = build_model(num_classes=len(classes))
    model.load_state_dict(torch.load(checkpoint_path, map_location="cpu", weights_only=True))
    model.eval()

    # dummy input just defines the expected shape for export
    dummy_input = torch.randn(1, 3, 224, 224)
    onnx_path = f"{export_dir}/model.onnx"
    torch.onnx.export(
        model, dummy_input, onnx_path,
        input_names=["input"], output_names=["output"],
        opset_version=13,
    )

    # save class order so the app knows which output index maps to which label
    with open(f"{export_dir}/classes.txt", "w") as f:
        f.write("\n".join(classes))

    print(f"Exported {part} -> {onnx_path}")
    volume.commit()


@app.local_entrypoint()
def main():
    export_model_to_onnx.remote(part="leaf")
    export_model_to_onnx.remote(part="stem")
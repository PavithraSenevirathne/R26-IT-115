import os
from pathlib import Path
import modal

# 1. Configure Modal App and mount the existing Volume containing the trained checkpoint
app = modal.App("bark-gate-onnx-exporter")
volume = modal.Volume.from_name("cinnamon-bark-vol", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.2.2",
        "torchvision==0.17.2",
        "onnx==1.16.0",
        "onnxruntime==1.17.3",
        "numpy==1.26.4",
    )
)

REMOTE_CKPT_PATH = "/vol/exports/bark_gate_best.pt"
REMOTE_ONNX_PATH = "/vol/exports/bark_gate_fp32.onnx"
REMOTE_METRICS_PATH = "/vol/exports/bark_gate_metrics.json"


@app.function(image=image, volumes={"/vol": volume}, timeout=600)
def export_bark_gate_onnx():
    import numpy as np
    import torch
    import torch.nn as nn
    from torchvision import models
    import onnx
    import onnxruntime as ort

    if not os.path.exists(REMOTE_CKPT_PATH):
        raise FileNotFoundError(f"Checkpoint not found at {REMOTE_CKPT_PATH}.")

    # 1. Rebuild the exact BarkGateNet architecture used during training
    class BarkGateNet(nn.Module):
        def __init__(self):
            super().__init__()
            base = models.mobilenet_v3_small(weights=None)
            self.features = base.features
            self.avgpool = base.avgpool
            self.classifier = nn.Sequential(
                nn.Flatten(),
                nn.Linear(576, 128),
                nn.Hardswish(),
                nn.Dropout(0.3),
                nn.Linear(128, 64),
                nn.Hardswish(),
                nn.Dropout(0.3),
                nn.Linear(64, 1),
            )

        def forward(self, x):
            return self.classifier(self.avgpool(self.features(x)))

    # 2. Wrap with Sigmoid so the mobile app receives a [0.0, 1.0] probability directly
    class BarkGateONNXWrapper(nn.Module):
        def __init__(self, base_model):
            super().__init__()
            self.base = base_model

        def forward(self, x):
            return torch.sigmoid(self.base(x))

    # 3. Load trained weights onto CPU and set to deterministic evaluation mode
    base_model = BarkGateNet()
    base_model.load_state_dict(torch.load(REMOTE_CKPT_PATH, map_location="cpu"))
    base_model.eval()

    export_model = BarkGateONNXWrapper(base_model).cpu().eval()
    dummy_input = torch.randn(1, 3, 224, 224, dtype=torch.float32)

    os.makedirs(os.path.dirname(REMOTE_ONNX_PATH), exist_ok=True)

    # 4. Export to ONNX (Opset 13, fp32) for onnxruntime-react-native compatibility
    torch.onnx.export(
        export_model,
        dummy_input,
        REMOTE_ONNX_PATH,
        export_params=True,
        opset_version=13,
        do_constant_folding=True,
        input_names=["input"],
        output_names=["cinnamon_prob"],
        dynamic_axes={
            "input": {0: "batch_size"},
            "cinnamon_prob": {0: "batch_size"},
        },
    )

    # 5. Validate ONNX graph structure and verify numerical parity against PyTorch
    onnx_model = onnx.load(REMOTE_ONNX_PATH)
    onnx.checker.check_model(onnx_model)

    ort_session = ort.InferenceSession(REMOTE_ONNX_PATH, providers=["CPUExecutionProvider"])
    with torch.no_grad():
        torch_out = export_model(dummy_input).numpy()
    ort_out = ort_session.run(None, {"input": dummy_input.numpy()})[0]

    max_diff = float(np.max(np.abs(torch_out - ort_out)))
    size_mb = os.path.getsize(REMOTE_ONNX_PATH) / (1024 * 1024)
    print(f"Exported bark_gate_fp32.onnx ({size_mb:.2f} MB) | Max Abs Diff: {max_diff:.2e}")

    volume.commit()

    # 6. Return file bytes so the local entrypoint saves them directly to disk
    with open(REMOTE_ONNX_PATH, "rb") as f:
        onnx_bytes = f.read()

    metrics_bytes = b""
    if os.path.exists(REMOTE_METRICS_PATH):
        with open(REMOTE_METRICS_PATH, "rb") as f:
            metrics_bytes = f.read()

    return onnx_bytes, metrics_bytes


@app.local_entrypoint()
def main():
    onnx_bytes, metrics_bytes = export_bark_gate_onnx.remote()

    local_dir = Path("./exports")
    local_dir.mkdir(parents=True, exist_ok=True)

    onnx_file = local_dir / "bark_gate_fp32.onnx"
    onnx_file.write_bytes(onnx_bytes)
    print(f"Saved ONNX model to: {onnx_file.resolve()} ({len(onnx_bytes) / (1024*1024):.2f} MB)")

    if metrics_bytes:
        metrics_file = local_dir / "bark_gate_metrics.json"
        metrics_file.write_bytes(metrics_bytes)
        print(f"Saved metrics JSON to: {metrics_file.resolve()}")
import torch
import os
from modal_app import app, image, volume, VOL_PATH

@app.function(image=image, volumes={VOL_PATH: volume})
def run_export():
    from train_lib import build_model
    
    configs = [
        {"part": "leaf", "num_classes": 4},
        {"part": "stem", "num_classes": 3}
    ]
    
    for config in configs:
        part = config["part"]
        num_classes = config["num_classes"]
        
        model_path = f"{VOL_PATH}/checkpoints/cinnamon_{part}_final.pt"
        onnx_path = f"{VOL_PATH}/checkpoints/cinnamon_{part}.onnx"
        
        if not os.path.exists(model_path):
            print(f"Skipping {part}: Could not find {model_path}")
            continue
            
        print(f"Exporting {part} model to ONNX...")
        
        model = build_model(num_classes=num_classes).to("cpu")
        
        model.load_state_dict(torch.load(model_path, map_location="cpu", weights_only=True))
        model.eval()

        dummy_input = torch.randn(1, 3, 224, 224, device="cpu")
        
        torch.onnx.export(
            model, 
            dummy_input, 
            onnx_path, 
            export_params=True,
            opset_version=14,
            input_names=['input'],
            output_names=['output']
        )
        print(f"Successfully saved {onnx_path}")
        
    volume.commit()
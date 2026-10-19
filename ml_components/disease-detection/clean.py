import modal
import os

app = modal.App("cinnamon-disease-classifier")
volume = modal.Volume.from_name("cinnamon-data")
VOL_PATH = "/vol"

@app.function(volumes={VOL_PATH: volume})
def clean_hidden_files():
    deleted = 0
    for root, _, files in os.walk(f"{VOL_PATH}/cinnamon_dataset"):
        for f in files:
            # Target Apple double files and hidden system files
            if f.startswith('._') or f.startswith('.'):
                file_path = os.path.join(root, f)
                os.remove(file_path)
                deleted += 1
                
    volume.commit()
    print(f"Successfully deleted {deleted} hidden Mac metadata files!")
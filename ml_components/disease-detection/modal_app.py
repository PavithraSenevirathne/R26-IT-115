import modal

# Core Modal app 
app = modal.App("cinnamon-disease-classifier")

# Base image: just the Python deps, no local files yet
base_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.4.0",
        "torchvision==0.19.0",
        "datasets",
        "huggingface_hub",
        "pillow",
        "scikit-learn",
        "numpy",
        "tqdm",
        "wandb",
    )
)

# Training image: base + local project files attached last (Modal requirement)
image = base_image.add_local_python_source("modal_app", "train_lib", "stage_1", "stage_2")

# Persistent cloud disk
volume = modal.Volume.from_name("cinnamon-data", create_if_missing=True)
VOL_PATH = "/vol"
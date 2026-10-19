import modal
import os
import shutil
import zipfile
import math

app = modal.App("cinnamon-disease-classifier")
volume = modal.Volume.from_name("cinnamon-data")
VOL_PATH = "/vol"

# Automatically handle Apple HEIC formats
image_def = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torchvision", "pillow", "pillow-heif")
)

@app.function(
    image=image_def, 
    volumes={VOL_PATH: volume},
    timeout=3600
)
def process_all_field_data():
    from PIL import Image
    from torchvision import transforms
    import pillow_heif

    pillow_heif.register_heif_opener()
    
    base_dir = f"{VOL_PATH}/cinnamon_dataset/leaf"
    zip_path = f"{VOL_PATH}/field_data.zip"
    extract_path = f"{VOL_PATH}/extracted_temp"
    
    classes_to_replace = ["leaf_blight", "leaf_gall", "leaf_spot", "healthy_leaf"]
    target_images_per_class = 1000

    augmenter = transforms.Compose([
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomVerticalFlip(p=0.5),
        transforms.RandomRotation(45),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.05),
        transforms.RandomAffine(degrees=0, translate=(0.1, 0.1), scale=(0.8, 1.2))
    ])

    if not os.path.exists(zip_path):
        raise FileNotFoundError(f"Cannot find {zip_path}. Did you upload it?")

    print("Deleting all old lab-condition folders...")
    for cls in classes_to_replace:
        target_dir = os.path.join(base_dir, cls)
        if os.path.exists(target_dir):
            shutil.rmtree(target_dir)

    print("Extracting new field data...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_path)

    extracted_root = extract_path
    for root, dirs, files in os.walk(extract_path):
        if any(c in dirs for c in classes_to_replace):
            extracted_root = root
            break

    for cls in classes_to_replace:
        src_dir = os.path.join(extracted_root, cls)
        dest_dir = os.path.join(base_dir, cls)
        if os.path.exists(src_dir):
            shutil.move(src_dir, dest_dir)
            print(f"Moved {cls} field data to dataset.")

    print("Scanning and converting any HEIC images to JPEG...")
    for cls in classes_to_replace:
        cls_dir = os.path.join(base_dir, cls)
        all_files = [f for f in os.listdir(cls_dir) if not f.startswith('._') and not f.startswith('.')]
        
        converted_count = 0
        for f in all_files:
            if f.lower().endswith(('.heic', '.heif')):
                heic_path = os.path.join(cls_dir, f)
                jpg_filename = f"{os.path.splitext(f)[0]}.jpg"
                jpg_path = os.path.join(cls_dir, jpg_filename)
                try:
                    with Image.open(heic_path) as img:
                        img.convert("RGB").save(jpg_path, "JPEG", quality=95)
                    os.remove(heic_path)
                    converted_count += 1
                except Exception as e:
                    pass
        if converted_count > 0:
            print(f"Converted {converted_count} HEIC images in {cls}.")

    print("Generating offline augmentations to perfectly balance the dataset...")
    for cls in classes_to_replace:
        cls_dir = os.path.join(base_dir, cls)
        images = [
            f for f in os.listdir(cls_dir) 
            if f.lower().endswith(('.png', '.jpg', '.jpeg')) 
            and not f.startswith('aug_') 
            and not f.startswith('._') 
            and not f.startswith('.')
        ]
        
        base_count = len(images)
        if base_count == 0:
            print(f"Skipping {cls}: No images found.")
            continue
            
        copies_per_image = math.ceil(target_images_per_class / base_count) - 1
        copies_per_image = max(0, copies_per_image)
        
        print(f"Found {base_count} base images for {cls}. Generating {copies_per_image} augmentations each to hit target...")
        
        count = 0
        for img_name in images:
            img_path = os.path.join(cls_dir, img_name)
            try:
                with Image.open(img_path) as img:
                    img = img.convert("RGB")
                    for i in range(copies_per_image):
                        aug_img = augmenter(img)
                        base_name, ext = os.path.splitext(img_name)
                        new_name = f"aug_{i}_{base_name}.jpg"
                        aug_img.save(os.path.join(cls_dir, new_name), "JPEG")
                        count += 1
            except Exception as e:
                print(f"Failed to process {img_name}: {e}")
                
        print(f"Total {cls} size: {base_count + count} images")

    shutil.rmtree(extract_path)
    os.remove(zip_path)
    
    volume.commit()
    print("Dataset successful!")
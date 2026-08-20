import cv2
import numpy as np
import onnxruntime as ort
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from .schemas import HarvestResponse, PestResponse, PestDetection, BoundingBox
import os

router = APIRouter()

pest_session = None
pest_input_name = None

try:
    model_path = os.path.join("models", "best.onnx")
    print(f"Attempting to load model from: {os.path.abspath(model_path)}")
    
    if os.path.exists(model_path):
        pest_session = ort.InferenceSession(model_path)
        pest_input_name = pest_session.get_inputs()[0].name
        print("Successfully loaded best.onnx!")
    else:
        print(f"CRITICAL: Model file not found at {model_path}")
except Exception as e:
    print(f"CRITICAL: Failed to initialize ONNX session: {e}")

PEST_CLASSES = [
    'stem_borer', 'thrips', 'moth', 'mite', 
    'leaf_miner', 'root_grub', 'caterpillar', 'weevil'
]

async def read_image(file: UploadFile) -> np.ndarray:
    contents = await file.read() 
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image file")
    return img

@router.post("/predict/pest", response_model=PestResponse)
async def predict_pest(file: UploadFile = File(...)):
    if pest_session is None:
        raise HTTPException(status_code=500, detail="Pest model is not loaded.")
    
    img = await read_image(file)
    
    input_size = 640
    img_resized = cv2.resize(img, (input_size, input_size))
    img_rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB)
    
    input_tensor = img_rgb.astype(np.float32) / 255.0
    input_tensor = np.transpose(input_tensor, (2, 0, 1))
    input_tensor = np.expand_dims(input_tensor, axis=0)

    outputs = pest_session.run(None, {pest_input_name: input_tensor})
    
    predictions = outputs[0][0].transpose()

    boxes = []
    scores = []
    class_ids = []

    for row in predictions:
        xc, yc, w, h = row[0:4]
        class_probs = row[4:12]
        
        # Safely compute class and confidence
        class_id = int(np.argmax(class_probs))
        confidence = float(class_probs[class_id])

        # Diagnostic print to see what the model is evaluating
        if confidence >= 0.15:
            print(f"Candidate found -> Class: {PEST_CLASSES[class_id]} ({class_id}), Confidence: {confidence:.2f}")

        # Threshold check
        if confidence >= 0.35:
            x_min = xc - (w / 2)
            y_min = yc - (h / 2)

            boxes.append([int(x_min), int(y_min), int(w), int(h)])
            scores.append(confidence)
            class_ids.append(class_id)

    detections = []

    if len(boxes) > 0:
        indices = cv2.dnn.NMSBoxes(boxes, scores, score_threshold=0.35, nms_threshold=0.45)
        
        if len(indices) > 0:
            for i in indices.flatten():
                box = boxes[i]
                class_id = class_ids[i]
                
                # Normalize coordinates from 0 to 1 relative to the 640x640 frame
                norm_xMin = max(0.0, min(box[0] / input_size, 1.0))
                norm_yMin = max(0.0, min(box[1] / input_size, 1.0))
                norm_width = min(box[2] / input_size, 1.0 - norm_xMin)
                norm_height = min(box[3] / input_size, 1.0 - norm_yMin)

                detections.append(
                    PestDetection(
                        id=str(uuid.uuid4()),
                        pest_class=PEST_CLASSES[class_id],
                        confidence=scores[i],
                        box=BoundingBox(
                            xMin=norm_xMin, 
                            yMin=norm_yMin, 
                            width=norm_width, 
                            height=norm_height
                        )
                    )
                )

    return PestResponse(detections=detections)
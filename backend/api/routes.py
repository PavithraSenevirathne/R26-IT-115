import cv2
import numpy as np
import onnxruntime as ort
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from .schemas import HarvestResponse, PestResponse, PestDetection, BoundingBox, DiseaseResponse

router = APIRouter()

try:
    pest_session = ort.InferenceSession("models/pest_yolov8.onnx")
    pest_input_name = pest_session.get_inputs()[0].name
except Exception as e:
    print(f"Error loading pest_yolov8.onnx: {e}")

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
        class_probs = row[4:]
        class_id = np.argmax(class_probs)
        confidence = class_probs[class_id]

        if confidence >= 0.35:
            xc, yc, w, h = row[0:4]

            x_min = xc - (w / 2)
            y_min = yc - (h / 2)

            boxes.append([int(x_min), int(y_min), int(w), int(h)])
            scores.append(float(confidence))
            class_ids.append(class_id)

    detections = []

    if len(boxes) > 0:
        indices = cv2.dnn.NMSBoxes(boxes, scores, score_threshold=0.35, nms_threshold=0.45)
        
        for i in indices.flatten():
            box = boxes[i]
            class_id = class_ids[i]
            
            norm_xMin = box[0] / input_size
            norm_yMin = box[1] / input_size
            norm_width = box[2] / input_size
            norm_height = box[3] / input_size

            final_xMin = max(0.0, min(norm_xMin, 1.0))
            final_yMin = max(0.0, min(norm_yMin, 1.0))
            final_width = min(norm_width, 1.0 - final_xMin)
            final_height = min(norm_height, 1.0 - final_yMin)

            detections.append(
                PestDetection(
                    id=str(uuid.uuid4()),
                    pest_class=PEST_CLASSES[class_id],
                    confidence=scores[i],
                    box=BoundingBox(
                        xMin=final_xMin, 
                        yMin=final_yMin, 
                        width=final_width, 
                        height=final_height
                    )
                )
            )

    return PestResponse(detections=detections)
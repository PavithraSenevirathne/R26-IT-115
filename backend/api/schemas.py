from pydantic import BaseModel
from typing import List, Tuple

# Harvest Model Schema
class HarvestResponse(BaseModel):
    readiness_score: float
    std: float
    confidence_interval_95: Tuple[float, float]
    predicted_class: str

# Pest Model Schemas
class BoundingBox(BaseModel):
    xMin: float
    yMin: float
    width: float
    height: float

class PestDetection(BaseModel):
    id: str
    pest_class: str
    confidence: float
    box: BoundingBox

class PestResponse(BaseModel):
    detections: List[PestDetection]

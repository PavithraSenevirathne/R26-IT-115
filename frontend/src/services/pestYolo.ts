import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import { loadModel } from './inference';

let pestSession: InferenceSession | null = null;

const PEST_CLASSES = [
  'stem_borer', 'thrips', 'moth', 'mite', 
  'leaf_miner', 'root_grub', 'caterpillar', 'weevil'
];

export interface Detection {
  x1: number; y1: number; x2: number; y2: number;
  score: number; classId: number; className: string;
}

export const initializePestModel = async () => {
  if (!pestSession) {
    pestSession = await loadModel(require('../../assets/models/pest_yolo.onnx'));
  }
};

const calculateIoU = (box1: Detection, box2: Detection) => {
  const xA = Math.max(box1.x1, box2.x1);
  const yA = Math.max(box1.y1, box2.y1);
  const xB = Math.min(box1.x2, box2.x2);
  const yB = Math.min(box1.y2, box2.y2);
  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const box1Area = (box1.x2 - box1.x1) * (box1.y2 - box1.y1);
  const box2Area = (box2.x2 - box2.x1) * (box2.y2 - box2.y1);
  return interArea / (box1Area + box2Area - interArea);
};

export const runPestDetection = async (tensor: Tensor): Promise<Detection[]> => {
  if (!pestSession) throw new Error("Pest model not loaded");

  const feeds = { images: tensor };
  const results = await pestSession.run(feeds);
  const outputKey = Object.keys(results)[0];
  const outputData = results[outputKey].data as Float32Array;

  let detections: Detection[] = [];
  const numClasses = 8;
  const numAnchors = 8400;

  for (let i = 0; i < numAnchors; i++) {
    let maxScore = 0;
    let classId = -1;

    for (let c = 0; c < numClasses; c++) {
      const score = outputData[(4 + c) * numAnchors + i];
      if (score > maxScore) {
        maxScore = score;
        classId = c;
      }
    }

    const threshold = (classId === 0 || classId === 6) ? 0.40 : 0.35;

    if (maxScore >= threshold) {
      const xc = outputData[0 * numAnchors + i];
      const yc = outputData[1 * numAnchors + i];
      const w = outputData[2 * numAnchors + i];
      const h = outputData[3 * numAnchors + i];

      detections.push({
        x1: xc - w / 2,
        y1: yc - h / 2,
        x2: xc + w / 2,
        y2: yc + h / 2,
        score: maxScore,
        classId,
        className: PEST_CLASSES[classId]
      });
    }
  }

  detections.sort((a, b) => b.score - a.score);
  const finalDetections: Detection[] = [];

  while (detections.length > 0) {
    const bestBox = detections.shift()!;
    finalDetections.push(bestBox);
    detections = detections.filter(box => calculateIoU(bestBox, box) < 0.45);
  }

  return finalDetections;
};
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import * as jpeg from 'jpeg-js';

let gateSession: InferenceSession | null = null;

export const initializePlantGate = async () => {
  if (gateSession) return;
  try {
    const modelAsset = Asset.fromModule(require('../../assets/models/plant_gate.onnx'));
    await modelAsset.downloadAsync();

    if (!modelAsset.localUri) {
      throw new Error("Failed to resolve local URI for the gatekeeper model.");
    }

    gateSession = await InferenceSession.create(modelAsset.localUri);
    console.log("Plant Gate model loaded successfully.");
  } catch (e) {
    console.error("Failed to load Plant Gate model:", e);
  }
};

export const runPlantValidation = async (imageUri: string): Promise<boolean> => {
  if (!gateSession) throw new Error('Gate model is not initialized');

  // Read and Decode Image
  const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: FileSystem.EncodingType.Base64 });
  const rawImageData = decode(base64);
  const image = jpeg.decode(rawImageData, { useTArray: true }); 

  // Prepare Float32Array
  const FloatArray = new Float32Array(3 * 224 * 224);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];

  for (let i = 0; i < 224 * 224; i++) {
    const r = image.data[i * 4] / 255.0;
    const g = image.data[i * 4 + 1] / 255.0;
    const b = image.data[i * 4 + 2] / 255.0;

    FloatArray[i] = (r - mean[0]) / std[0];
    FloatArray[i + 224 * 224] = (g - mean[1]) / std[1];
    FloatArray[i + 2 * 224 * 224] = (b - mean[2]) / std[2];
  }

  // Create Tensor and Run Inference
  const tensor = new Tensor('float32', FloatArray, [1, 3, 224, 224]);
  const feeds: Record<string, Tensor> = {};
  feeds[gateSession.inputNames[0]] = tensor;
  
  const outputData = await gateSession.run(feeds);
  const logits = outputData[gateSession.outputNames[0]].data as Float32Array;

  // Apply Softmax Math
  const maxLogit = Math.max(logits[0], logits[1]);
  const exp0 = Math.exp(logits[0] - maxLogit);
  const exp1 = Math.exp(logits[1] - maxLogit);
  const sumExp = exp0 + exp1;
  
  const probPlant = exp1 / sumExp;

  console.log(`Gatekeeper Check -> Not Plant: ${(exp0/sumExp).toFixed(2)}, Plant: ${probPlant.toFixed(2)}`);

  // Threshold Validation
  return probPlant > 0.65;
};
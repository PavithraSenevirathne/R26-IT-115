import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import * as jpeg from 'jpeg-js';

let barkGateSession: InferenceSession | null = null;

const BARK_GATE_THRESHOLD = 0.50;

export const initializeBarkGate = async (): Promise<void> => {
  if (barkGateSession) return;
  try {
    const modelAsset = Asset.fromModule(require('../../assets/models/bark_gate.onnx'));
    await modelAsset.downloadAsync();

    if (!modelAsset.localUri) {
      throw new Error('Failed to resolve local URI for the bark-gate model.');
    }

    barkGateSession = await InferenceSession.create(modelAsset.localUri);
    console.log('Bark-Gate model loaded successfully.');
  } catch (e) {
    console.error('Failed to load Bark-Gate model:', e);
    throw e;
  }
};

export const runBarkValidation = async (imageUri: string): Promise<boolean> => {
  if (!barkGateSession) {
    await initializeBarkGate();
    if (!barkGateSession) throw new Error('Bark-Gate model is not initialized');
  }

  // 1. Read and Decode JPEG Image
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const rawImageData = decode(base64);
  const image = jpeg.decode(rawImageData, { useTArray: true });

  if (image.width !== 224 || image.height !== 224) {
    throw new Error(
      `Bark-Gate expected 224x224 image, but decoded ${image.width}x${image.height}.`
    );
  }

  const floatArray = new Float32Array(3 * 224 * 224);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const stride = 224 * 224;

  for (let i = 0; i < stride; i++) {
    const r = image.data[i * 4] / 255.0;
    const g = image.data[i * 4 + 1] / 255.0;
    const b = image.data[i * 4 + 2] / 255.0;

    floatArray[i] = (r - mean[0]) / std[0];
    floatArray[i + stride] = (g - mean[1]) / std[1];
    floatArray[i + 2 * stride] = (b - mean[2]) / std[2];
  }

  const tensor = new Tensor('float32', floatArray, [1, 3, 224, 224]);
  const feeds: Record<string, Tensor> = {};
  feeds[barkGateSession.inputNames[0]] = tensor;

  const outputData = await barkGateSession.run(feeds);
  const outputTensor = outputData[barkGateSession.outputNames[0]].data as Float32Array;

  const probCinnamon = outputTensor[0];

  console.log(
    `Bark-Gate Check -> Cinnamon Bark: ${(probCinnamon * 100).toFixed(2)}%, Non-Cinnamon: ${((1 - probCinnamon) * 100).toFixed(2)}%`
  );

  return probCinnamon >= BARK_GATE_THRESHOLD;
};
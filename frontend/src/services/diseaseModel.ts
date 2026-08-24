import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

let leafSession: InferenceSession | null = null;
let stemSession: InferenceSession | null = null;

export const LEAF_CLASSES = ['healthy_leaves', 'leaf_blight', 'leaf_gall', 'leaf_spot'];
export const STEM_CLASSES = ['healthy_stem', 'rough_bark', 'stripe_canker'];

export interface DiseasePrediction {
  className: string;
  probability: number;
}

const loadModelSafely = async (assetRequire: any, filename: string) => {
  const asset = Asset.fromModule(assetRequire);
  await asset.downloadAsync();

  let localPath = asset.localUri || asset.uri;

  if (localPath.startsWith('http')) {
    const baseDir = (FileSystem as any).documentDirectory || '';
    const fileUri = `${baseDir}${filename}`;
    const download = await FileSystem.downloadAsync(localPath, fileUri);
    localPath = download.uri;
  }

  return await InferenceSession.create(localPath);
};

export const initializeDiseaseModels = async () => {
  try {
    if (!leafSession) {
      leafSession = await loadModelSafely(require('../../assets/models/leaf_model.onnx'), 'leaf_model.onnx');
    }
    if (!stemSession) {
      stemSession = await loadModelSafely(require('../../assets/models/stem_model.onnx'), 'stem_model.onnx');
    }
    console.log("Disease ONNX models initialized successfully!");
  } catch (error) {
    console.log("Failed to initialize disease models:", error);
    throw error;
  }
};

export const runDiseaseInference = async (tensor: Tensor, target: 'leaf' | 'stem'): Promise<DiseasePrediction[]> => {
  const session = target === 'leaf' ? leafSession : stemSession;
  if (!session) throw new Error(`${target} model is not loaded`);

  const feeds: Record<string, Tensor> = {};
  feeds[session.inputNames[0]] = tensor;

  const results = await session.run(feeds);
  const outputName = session.outputNames[0];
  const outputData = results[outputName].data as Float32Array;

  const maxLogit = Math.max(...Array.from(outputData));
  const expScores = Array.from(outputData).map((x) => Math.exp(x - maxLogit));
  const sumExp = expScores.reduce((a, b) => a + b, 0);
  const probabilities = expScores.map((x) => x / sumExp);

  const classes = target === 'leaf' ? LEAF_CLASSES : STEM_CLASSES;

  return classes
    .map((className, index) => ({
      className,
      probability: probabilities[index],
    }))
    .sort((a, b) => b.probability - a.probability);
};
import { InferenceSession } from 'onnxruntime-react-native';
import { Asset } from 'expo-asset';

export const loadModel = async (assetModule: any): Promise<InferenceSession> => {
  const [asset] = await Asset.loadAsync(assetModule);
  
  const localUri = asset.localUri;
  
  if (!localUri) {
    throw new Error(`Failed to resolve local URI for model: ${asset.name}`);
  }

  const cleanPath = localUri.replace('file://', '');

  const session = await InferenceSession.create(cleanPath);
  return session;
};
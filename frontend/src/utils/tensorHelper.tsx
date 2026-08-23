import * as jpeg from 'jpeg-js';
import { Tensor } from 'onnxruntime-react-native';

export const imageToTensor = async (imageUri: string, targetSize: number = 224): Promise<Tensor> => {
  const response = await fetch(imageUri);
  const arrayBuffer = await response.arrayBuffer();
  const rawImageData = jpeg.decode(arrayBuffer, { useTArray: true });
  const { width, height, data } = rawImageData;

  const float32Data = new Float32Array(3 * targetSize * targetSize);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];

  for (let i = 0; i < targetSize * targetSize; i++) {
    const r = data[i * 4] / 255.0;
    const g = data[i * 4 + 1] / 255.0;
    const b = data[i * 4 + 2] / 255.0;

    float32Data[i] = (r - mean[0]) / std[0];
    float32Data[i + targetSize * targetSize] = (g - mean[1]) / std[1];
    float32Data[i + 2 * targetSize * targetSize] = (b - mean[2]) / std[2];
  }

  return new Tensor('float32', float32Data, [1, 3, targetSize, targetSize]);
};
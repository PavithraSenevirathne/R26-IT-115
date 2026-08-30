import * as jpeg from 'jpeg-js';
import { Tensor } from 'onnxruntime-react-native';
import * as FileSystem from 'expo-file-system/legacy';

const decodeBase64 = (base64: string): Uint8Array => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  let bufferLength = base64.length * 0.75;
  if (base64[base64.length - 1] === '=') bufferLength--;
  if (base64[base64.length - 2] === '=') bufferLength--;

  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < base64.length; i += 4) {
    const encoded1 = lookup[base64.charCodeAt(i)];
    const encoded2 = lookup[base64.charCodeAt(i + 1)];
    const encoded3 = lookup[base64.charCodeAt(i + 2)];
    const encoded4 = lookup[base64.charCodeAt(i + 3)];

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    if (encoded3 !== 64) bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    if (encoded4 !== 64) bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
  }
  return bytes;
};

export const imageToTensor = async (
  imageUri: string, 
  targetSize: number = 224,
  isYolo: boolean = false
): Promise<Tensor> => {
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const uint8Array = decodeBase64(base64);
  const rawImageData = jpeg.decode(uint8Array, { useTArray: true });
  const { data } = rawImageData;

  const float32Data = new Float32Array(3 * targetSize * targetSize);

  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];

  for (let i = 0; i < targetSize * targetSize; i++) {
    const r = data[i * 4] / 255.0;
    const g = data[i * 4 + 1] / 255.0;
    const b = data[i * 4 + 2] / 255.0;

    if (isYolo) {
      float32Data[i] = r;
      float32Data[i + targetSize * targetSize] = g;
      float32Data[i + 2 * targetSize * targetSize] = b;
    } else {
      float32Data[i] = (r - mean[0]) / std[0];
      float32Data[i + targetSize * targetSize] = (g - mean[1]) / std[1];
      float32Data[i + 2 * targetSize * targetSize] = (b - mean[2]) / std[2];
    }
  }

  return new Tensor('float32', float32Data, [1, 3, targetSize, targetSize]);
};
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import { loadModel } from './inference'; 

let ensembleSessions: InferenceSession[] = [];

export const initializeHarvestEnsemble = async () => {
  if (ensembleSessions.length > 0) return; 

  console.log("Loading 5 Harvest Ensemble Models...");
  ensembleSessions = await Promise.all([
    loadModel(require('../../assets/models/ensemble_model_0.onnx')),
    loadModel(require('../../assets/models/ensemble_model_1.onnx')),
    loadModel(require('../../assets/models/ensemble_model_2.onnx')),
    loadModel(require('../../assets/models/ensemble_model_3.onnx')),
    loadModel(require('../../assets/models/ensemble_model_4.onnx')),
  ]);
  console.log("Harvest Ensemble Ready.");
};

export const runHarvestInference = async (tensor: Tensor) => {
  if (ensembleSessions.length !== 5) throw new Error("Models not loaded");

  const feeds = { image: tensor };

  const promises = ensembleSessions.map(session => session.run(feeds));
  const results = await Promise.all(promises);

  const scores = results.map(res => {
    const outputKey = Object.keys(res)[0]; 
    const outputData = res[outputKey].data;
    return typeof outputData[0] === 'number' ? outputData[0] : Number(outputData[0]);
  });

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;

  const variance = scores.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / scores.length;
  const std = Math.sqrt(variance);

  const predictedClass = Math.max(0, Math.min(2, Math.round(mean)));

  let confidenceTier: 'High' | 'Medium' | 'Low' = 'Medium';
  if (std < 0.05) confidenceTier = 'High';
  else if (std > 0.15) confidenceTier = 'Low';

  return {
    meanScore: mean.toFixed(3),
    stdDev: std.toFixed(3),
    predictedClass,
    confidenceTier,
    rawScores: scores,
  };
};
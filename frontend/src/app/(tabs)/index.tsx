import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { imageToTensor } from '../../utils/tensorHelper';
import { initializeDiseaseModels, runDiseaseInference } from '../../services/diseaseModel';

type PlantPart = 'leaf' | 'stem';

interface Prediction {
  label: string;
  confidence: number;
}

const formatLabel = (label: string) => {
  return label.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

// Safe inline shadow to completely avoid the NativeWind crash
const safeShadow = {
  elevation: 2,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 2,
};

export default function DiseaseScreen() {
  const [selectedPart, setSelectedPart] = useState<PlantPart | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<Prediction[] | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    initializeDiseaseModels().catch((err) => console.log('Model init log:', err));
  }, []);

  const pickImage = async (useCamera: boolean) => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    };

    let result = useCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
      setResults(null);
    }
  };

  const runLocalInference = async () => {
    if (!imageUri || !selectedPart) return;
    setIsAnalyzing(true);

    try {
      // @ts-ignore
      const manipulated = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          { resize: { width: 256, height: 256 } },
          { crop: { originX: 16, originY: 16, width: 224, height: 224 } },
        ],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );

      const tensor = await imageToTensor(manipulated.uri, 224);
      const predictions = await runDiseaseInference(tensor, selectedPart);

      setResults(
        predictions.map((p) => ({
          label: p.className,
          confidence: p.probability,
        }))
      );
    } catch (error) {
      console.log('Inference Error:', error);
      Alert.alert('Error', 'Failed to run on-device inference.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetScanner = () => {
    setImageUri(null);
    setResults(null);
    setSelectedPart(null);
  };

  const renderResults = () => {
    if (!results || results.length === 0) return null;

    const topPrediction = results[0];
    const secondPrediction = results[1];

    const isUncertain = topPrediction.confidence < 0.5;
    const isHealthy = topPrediction.label.includes('healthy');
    const showSecondary = !isHealthy && !isUncertain && topPrediction.confidence < 0.6;
    const isRoughBarkWarning =
      selectedPart === 'stem' && topPrediction.label === 'rough_bark' && topPrediction.confidence < 0.85;

    if (isUncertain) {
      return (
        <View style={safeShadow} className="bg-slate-100 rounded-3xl p-6 border border-slate-200 mt-6">
          <View className="items-center mb-4">
            <View className="bg-slate-200 w-16 h-16 rounded-full items-center justify-center mb-3">
              <Feather name="help-circle" size={32} color="#64748B" />
            </View>
            <Text className="text-xl font-extrabold text-slate-800 text-center">Uncertain Result</Text>
            <Text className="text-slate-500 font-bold mt-1 text-center">
              Top Match: {Math.round(topPrediction.confidence * 100)}%
            </Text>
          </View>
          <Text className="text-slate-600 text-center leading-relaxed mb-6">
            The model could not identify the condition with high confidence. Ensure the photo is focused, well-lit, and close to the symptom area.
          </Text>
        </View>
      );
    }

    if (isHealthy) {
      return (
        <View style={safeShadow} className="bg-emerald-50 rounded-3xl p-6 border border-emerald-200 mt-6">
          <View className="flex-row items-center mb-4">
            <View style={safeShadow} className="bg-emerald-500 w-12 h-12 rounded-full items-center justify-center mr-4">
              <Feather name="check" size={28} color="white" />
            </View>
            <View className="flex-1">
              <Text className="text-2xl font-extrabold text-emerald-900">Looks Healthy!</Text>
              <Text className="text-emerald-700 font-bold">{Math.round(topPrediction.confidence * 100)}% Confidence</Text>
            </View>
          </View>
          <Text className="text-emerald-800 font-medium leading-relaxed">
            No active disease symptoms detected on this {selectedPart}.
          </Text>
        </View>
      );
    }

    return (
      <View style={safeShadow} className="bg-rose-50 rounded-3xl p-6 border border-rose-200 mt-6">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-rose-500 font-bold text-xs uppercase tracking-widest">Disease Detected</Text>
          <Feather name="alert-circle" size={20} color="#F43F5E" />
        </View>

        <Text className="text-3xl font-extrabold text-rose-900 mb-1">{formatLabel(topPrediction.label)}</Text>

        <View className="flex-row items-center mb-6">
          <View className="h-3 flex-1 bg-rose-200 rounded-full overflow-hidden mr-3">
            <View style={{ width: `${topPrediction.confidence * 100}%` }} className="h-full bg-rose-500 rounded-full" />
          </View>
          <Text className="text-rose-700 font-extrabold">{Math.round(topPrediction.confidence * 100)}%</Text>
        </View>

        {isRoughBarkWarning && (
          <View className="bg-amber-100 p-4 rounded-2xl border border-amber-200 mb-4">
            <Text className="text-amber-800 text-xs font-semibold">
              ⚠️ Model Note: Rough bark and stripe canker share visual similarities. Confidence is below 85% — inspect for localized sunken streaks or bark cracking.
            </Text>
          </View>
        )}

        {showSecondary && secondPrediction && (
          <View className="bg-white/60 p-4 rounded-2xl border border-rose-100 mb-2">
            <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">Possible Alternate</Text>
            <View className="flex-row justify-between items-center">
              <Text className="text-slate-800 font-bold">{formatLabel(secondPrediction.label)}</Text>
              <Text className="text-slate-500 font-bold">{Math.round(secondPrediction.confidence * 100)}%</Text>
            </View>
            <Text className="text-xs text-slate-500 mt-2 leading-tight">
              Confidence is below 60%. Compare physical signs for both conditions.
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView
      className="flex-1 bg-slate-50 px-6 pt-6"
      contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-center self-start bg-indigo-100 px-3 py-1.5 rounded-full mb-6 border border-indigo-200">
        <Feather name="wifi-off" size={12} color="#4338CA" />
        <Text className="text-indigo-800 text-xs font-bold ml-1.5 uppercase tracking-wide">Fully Offline</Text>
      </View>

      <Text className="text-3xl font-extrabold text-slate-800 mb-2">Diagnosis</Text>
      <Text className="mb-8 text-base text-slate-500 leading-relaxed">
        Select target part, capture a clear photo, and run on-device inference.
      </Text>

      {/* Step 1: Target Selection */}
      <View className="mb-8">
        <Text className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Step 1: Select Target</Text>
        <View className="flex-row justify-between">
          <TouchableOpacity
            onPress={() => { setSelectedPart('leaf'); setResults(null); }}
            style={{ width: '48%' }}
            className={`p-4 rounded-2xl border-2 items-center flex-row justify-center ${
              selectedPart === 'leaf' ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-slate-200'
            }`}
          >
            <Feather name="target" size={20} color={selectedPart === 'leaf' ? '#10B981' : '#94A3B8'} />
            <Text className={`font-bold ml-2 ${selectedPart === 'leaf' ? 'text-emerald-700' : 'text-slate-500'}`}>
              Leaf
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { setSelectedPart('stem'); setResults(null); }}
            style={{ width: '48%' }}
            className={`p-4 rounded-2xl border-2 items-center flex-row justify-center ${
              selectedPart === 'stem' ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-slate-200'
            }`}
          >
            <Feather name="target" size={20} color={selectedPart === 'stem' ? '#10B981' : '#94A3B8'} />
            <Text className={`font-bold ml-2 ${selectedPart === 'stem' ? 'text-emerald-700' : 'text-slate-500'}`}>
              Stem
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Step 2: Image Capture */}
      <View className="mb-8">
        <View style={{ opacity: selectedPart ? 1 : 0.5 }} pointerEvents={selectedPart ? 'auto' : 'none'}>
          <Text className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Step 2: Scan</Text>

          {imageUri ? (
            <View style={safeShadow} className="w-full aspect-square bg-slate-200 rounded-[32px] overflow-hidden border-2 border-slate-200 relative mb-6">
              <Image source={{ uri: imageUri }} className="w-full h-full" resizeMode="cover" />

              {!isAnalyzing && !results && (
                <TouchableOpacity
                  onPress={() => setImageUri(null)}
                  style={safeShadow}
                  className="absolute top-4 right-4 bg-white/90 p-2 rounded-full"
                >
                  <Feather name="x" size={20} color="#334155" />
                </TouchableOpacity>
              )}

              {isAnalyzing && (
                <View className="absolute inset-0 bg-slate-900/40 items-center justify-center">
                  <ActivityIndicator size="large" color="white" />
                  <Text className="mt-3 font-bold text-white text-lg tracking-wide">Processing On-Device...</Text>
                </View>
              )}
            </View>
          ) : (
            <View className="flex-row justify-between mb-6">
              <TouchableOpacity
                onPress={() => pickImage(true)}
                style={[{ width: '65%' }, safeShadow]}
                className="h-40 bg-slate-800 rounded-3xl items-center justify-center"
              >
                <Feather name="camera" size={32} color="white" />
                <Text className="text-white font-bold mt-2">Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => pickImage(false)}
                style={[{ width: '31%' }, safeShadow]}
                className="h-40 bg-white border border-slate-200 rounded-3xl items-center justify-center"
              >
                <Feather name="image" size={28} color="#64748B" />
                <Text className="text-slate-500 font-bold mt-2">Gallery</Text>
              </TouchableOpacity>
            </View>
          )}

          {imageUri && !results && (
            <TouchableOpacity
              onPress={runLocalInference}
              style={safeShadow}
              className="bg-slate-800 py-4 rounded-2xl flex-row justify-center items-center"
            >
              <Feather name="zap" size={20} color="white" />
              <Text className="text-white font-bold ml-2 text-base">
                Analyze {selectedPart === 'leaf' ? 'Stem' : 'Leaf'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {renderResults()}

      {results && (
        <View className="mt-6 mb-8">
          <TouchableOpacity
            onPress={resetScanner}
            className="bg-white border border-slate-200 py-4 rounded-2xl flex-row justify-center items-center"
          >
            <Feather name="refresh-cw" size={18} color="#64748B" />
            <Text className="text-slate-600 font-bold ml-2">Scan Another Plant</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}
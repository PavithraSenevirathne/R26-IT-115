import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import PrimaryButton from '../../components/PrimaryButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type PlantPart = 'leaf' | 'stem';

interface Prediction {
  label: string;
  confidence: number;
}

const formatLabel = (label: string) => {
  return label.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

export default function DiseaseScreen() {
  const [selectedPart, setSelectedPart] = useState<PlantPart | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<Prediction[] | null>(null);
  const insets = useSafeAreaInsets()

  const pickImage = async (useCamera: boolean) => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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

  // 2. Simulated On-Device Inference
  const runLocalInference = () => {
    if (!imageUri || !selectedPart) return;
    setIsAnalyzing(true);

    setTimeout(() => {
      const mockResult: Prediction[] = selectedPart === 'leaf' 
        ? [
            { label: 'leaf_spot', confidence: 0.55 },
            { label: 'leaf_blight', confidence: 0.35 },
            { label: 'healthy_leaves', confidence: 0.08 },
            { label: 'leaf_gall', confidence: 0.02 },
          ]
        : [
            { label: 'healthy_stem', confidence: 0.92 },
            { label: 'rough_bark', confidence: 0.05 },
            { label: 'stripe_canker', confidence: 0.03 },
          ];

      setResults(mockResult.sort((a, b) => b.confidence - a.confidence));
      setIsAnalyzing(false);
    }, 150); 
  };

  const resetScanner = () => {
    setImageUri(null);
    setResults(null);
    setSelectedPart(null);
  };

  // --- Rendering Helpers ---
  const renderResults = () => {
    if (!results || results.length === 0) return null;

    const topPrediction = results[0];
    const secondPrediction = results[1];
    
    const isUncertain = topPrediction.confidence < 0.50;
    const isHealthy = topPrediction.label.includes('healthy');
    const showSecondary = !isHealthy && !isUncertain && topPrediction.confidence < 0.60;

    if (isUncertain) {
      return (
        <Animated.View entering={FadeInDown.springify()} className="bg-slate-100 rounded-3xl p-6 border border-slate-200 mt-6 shadow-sm">
          <View className="items-center mb-4">
            <View className="bg-slate-200 w-16 h-16 rounded-full items-center justify-center mb-3">
              <Feather name="help-circle" size={32} color="#64748B" />
            </View>
            <Text className="text-xl font-extrabold text-slate-800 text-center">Uncertain Result</Text>
            <Text className="text-slate-500 font-bold mt-1 text-center">Top Match: {Math.round(topPrediction.confidence * 100)}%</Text>
          </View>
          <Text className="text-slate-600 text-center leading-relaxed mb-6">
            The model couldn't confidently identify the cinnamon plant's condition. This usually happens if the photo is blurry, too dark, or too far away.
          </Text>
          <PrimaryButton label="Retake Photo" colorClass="bg-slate-700" iconName="camera" onPress={() => pickImage(true)} />
        </Animated.View>
      );
    }

    if (isHealthy) {
      return (
        <Animated.View entering={FadeInDown.springify()} className="bg-emerald-50 rounded-3xl p-6 border border-emerald-200 mt-6 shadow-sm">
          <View className="flex-row items-center mb-4">
            <View className="bg-emerald-500 w-12 h-12 rounded-full items-center justify-center mr-4 shadow-sm">
              <Feather name="check" size={28} color="white" />
            </View>
            <View className="flex-1">
              <Text className="text-2xl font-extrabold text-emerald-900">Looks Healthy!</Text>
              <Text className="text-emerald-700 font-bold">{Math.round(topPrediction.confidence * 100)}% Confidence</Text>
            </View>
          </View>
          <Text className="text-emerald-800 font-medium leading-relaxed">
            No signs of disease detected on this {selectedPart}. Continue your current care routine.
          </Text>
        </Animated.View>
      );
    }

    return (
      <Animated.View entering={FadeInDown.springify()} className="bg-rose-50 rounded-3xl p-6 border border-rose-200 mt-6 shadow-sm">
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

        {showSecondary && (
          <View className="bg-white/60 p-4 rounded-2xl border border-rose-100 mb-2">
            <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">Possible Alternate</Text>
            <View className="flex-row justify-between items-center">
              <Text className="text-slate-800 font-bold">{formatLabel(secondPrediction.label)}</Text>
              <Text className="text-slate-500 font-bold">{Math.round(secondPrediction.confidence * 100)}%</Text>
            </View>
            <Text className="text-xs text-slate-500 mt-2 leading-tight">
              Confidence is below 60%. If symptoms persist, compare physical signs for both conditions.
            </Text>
          </View>
        )}
      </Animated.View>
    );
  };

  return (
    <ScrollView className="flex-1 bg-slate-50 px-6 pt-6" contentContainerStyle={{ paddingTop: insets.top + 20,paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      
      <Animated.View entering={FadeInDown.delay(100)} className="flex-row items-center self-start bg-indigo-100 px-3 py-1.5 rounded-full mb-6 border border-indigo-200">
        <Feather name="wifi-off" size={12} color="#4338CA" />
        <Text className="text-indigo-800 text-xs font-bold ml-1.5 uppercase tracking-wide">Fully Offline</Text>
      </Animated.View>

      <Text className="text-3xl font-extrabold text-slate-800 mb-2">Diagnosis</Text>
      <Text className="mb-8 text-base text-slate-500 leading-relaxed">
        Select the plant part you want to analyze, then capture a clear, well-lit photo.
      </Text>

      {/* Step 1: Target Selection */}
      <Animated.View entering={FadeInDown.delay(200)} className="mb-8">
        <Text className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Step 1: Select Target</Text>
        <View className="flex-row gap-4">
          <TouchableOpacity 
            onPress={() => { setSelectedPart('leaf'); setResults(null); }}
            className={`flex-1 p-4 rounded-2xl border-2 items-center flex-row justify-center ${selectedPart === 'leaf' ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-slate-200'}`}
          >
            <Feather name="target" size={20} color={selectedPart === 'leaf' ? '#10B981' : '#94A3B8'} />
            <Text className={`font-bold ml-2 ${selectedPart === 'leaf' ? 'text-emerald-700' : 'text-slate-500'}`}>Leaf</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => { setSelectedPart('stem'); setResults(null); }}
            className={`flex-1 p-4 rounded-2xl border-2 items-center flex-row justify-center ${selectedPart === 'stem' ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-slate-200'}`}
          >
            <Feather name="target" size={20} color={selectedPart === 'stem' ? '#10B981' : '#94A3B8'} />
            <Text className={`font-bold ml-2 ${selectedPart === 'stem' ? 'text-emerald-700' : 'text-slate-500'}`}>Stem</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Step 2: Image Capture (Safely Animated Wrapper) */}
      <Animated.View entering={FadeInDown.delay(300)} className="mb-8">
        <View style={{ opacity: selectedPart ? 1 : 0.5 }} pointerEvents={selectedPart ? 'auto' : 'none'}>
          <Text className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Step 2: Scan</Text>
          
          {imageUri ? (
            <View className="w-full aspect-square bg-slate-200 rounded-[32px] overflow-hidden border-2 border-slate-200 relative shadow-sm mb-6">
              <Image source={{ uri: imageUri }} className="w-full h-full" resizeMode="cover" />
              
              {!isAnalyzing && !results && (
                <TouchableOpacity onPress={() => setImageUri(null)} className="absolute top-4 right-4 bg-white/90 p-2 rounded-full shadow-sm">
                  <Feather name="x" size={20} color="#334155" />
                </TouchableOpacity>
              )}

              {isAnalyzing && (
                <Animated.View entering={FadeIn} className="absolute inset-0 bg-slate-900/40 items-center justify-center backdrop-blur-sm">
                  <Feather name="cpu" size={32} color="white" className="animate-pulse" />
                  <Text className="mt-3 font-bold text-white text-lg tracking-wide">Processing On-Device...</Text>
                </Animated.View>
              )}
            </View>
          ) : (
            <View className="flex-row gap-4 mb-6">
              <TouchableOpacity onPress={() => pickImage(true)} className="flex-[2] h-40 bg-slate-800 rounded-3xl items-center justify-center shadow-sm">
                <Feather name="camera" size={32} color="white" />
                <Text className="text-white font-bold mt-2">Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => pickImage(false)} className="flex-[1] h-40 bg-white border border-slate-200 rounded-3xl items-center justify-center shadow-sm">
                <Feather name="image" size={28} color="#64748B" />
                <Text className="text-slate-500 font-bold mt-2">Gallery</Text>
              </TouchableOpacity>
            </View>
          )}

          {imageUri && !results && (
            <PrimaryButton 
              label={`Analyze ${selectedPart === 'leaf' ? 'Leaf' : 'Stem'}`} 
              colorClass="bg-slate-800" 
              iconName="zap"
              onPress={runLocalInference} 
            />
          )}
        </View>
      </Animated.View>

      {/* Results Rendering */}
      {renderResults()}

      {results && (
        <Animated.View entering={FadeInDown.delay(200).springify()} className="mt-6 mb-8">
          <TouchableOpacity onPress={resetScanner} className="bg-white border border-slate-200 py-4 rounded-2xl flex-row justify-center items-center">
            <Feather name="refresh-cw" size={18} color="#64748B" />
            <Text className="text-slate-600 font-bold ml-2">Scan Another Plant</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

    </ScrollView>
  );
}
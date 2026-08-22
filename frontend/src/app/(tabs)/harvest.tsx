import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import PrimaryButton from '../../components/PrimaryButton';
import { imageToTensor } from '../../utils/tensorHelper';
import { initializeHarvestEnsemble, runHarvestInference } from '../../services/harvestEnsemble';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BACKEND_URL = 'http://192.168.X.X:8000/api/v1/predict/harvest';

type ReadinessClass = 'Immature' | 'Optimal' | 'Over-mature';

interface HarvestAnalysisResult {
  readiness_score: number;
  std: number;
  predicted_class: ReadinessClass;
}

export default function HarvestScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isModelsLoading, setIsModelsLoading] = useState(true);
  const [result, setResult] = useState<HarvestAnalysisResult | null>(null);
  const insets = useSafeAreaInsets();

  // Load the 5 ONNX models into memory when the tab opens
  useEffect(() => {
    const loadModels = async () => {
      try {
        await initializeHarvestEnsemble();
      } catch (error) {
        console.error("Failed to load ensemble models:", error);
        Alert.alert("Initialization Error", "Could not load the AI models.");
      } finally {
        setIsModelsLoading(false);
      }
    };
    loadModels();
  }, []);

  const pickImage = async () => {
    let pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.8,
    });

    if (!pickerResult.canceled) {
      setImageUri(pickerResult.assets[0].uri);
      setResult(null);
    }
  };

  const analyzeBark = async () => {
    if (!imageUri) return;
    setIsAnalyzing(true);
    
    try {
      // @ts-ignore
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 224, height: 224 } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );

      const tensor = await imageToTensor(manipulatedImage.uri);
      
      const inferenceResult = await runHarvestInference(tensor);
      
      const classes: ReadinessClass[] = ['Immature', 'Optimal', 'Over-mature'];
      
      setResult({
        readiness_score: parseFloat(inferenceResult.meanScore),
        std: parseFloat(inferenceResult.stdDev),
        predicted_class: classes[inferenceResult.predictedClass],
      });

    } catch (error) {
      console.error("Harvest Inference Error:", error);
      Alert.alert("Analysis Failed", "Something went wrong during local inference.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getConfidenceInfo = (std: number) => {
    if (std < 0.05) return { level: 'High', color: 'text-emerald-600', bg: 'bg-emerald-100', icon: 'check-circle' as const };
    if (std < 0.15) return { level: 'Medium', color: 'text-amber-600', bg: 'bg-amber-100', icon: 'minus-circle' as const };
    return { level: 'Low', color: 'text-rose-600', bg: 'bg-rose-100', icon: 'alert-circle' as const };
  };

  const getRecommendation = (predictedClass: ReadinessClass) => {
    switch (predictedClass) {
      case 'Immature': return "Wait a bit longer before peeling.";
      case 'Optimal': return "Ready to harvest. Peel now for best yield.";
      case 'Over-mature': return "Past optimal window. Bark may be tough.";
    }
  };

  if (isModelsLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#F5F3E9]">
        <ActivityIndicator size="large" color="#4A6B4D" />
        <Text className="mt-4 text-[#8A9A86] font-semibold">Warming up AI Ensemble...</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#F5F3E9] px-6 pt-6" contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).springify()}>
        <Text className="mb-6 text-base font-medium text-[#8A9A86] leading-relaxed">
          Upload a close-up photo of the cinnamon stem bark. Try to fill the entire frame with the bark surface for the most accurate ensemble prediction.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).springify()} className="mb-6">
        {imageUri ? (
          <View className="overflow-hidden rounded-[32px] border-2 border-[#7CB342] shadow-sm relative">
            <Image source={{ uri: imageUri }} className="w-full h-72 bg-[#E2F4C5]" resizeMode="cover" />
            {!isAnalyzing && !result && (
              <TouchableOpacity onPress={() => setImageUri(null)} className="absolute top-4 right-4 bg-white/90 p-2 rounded-full shadow-sm">
                <Feather name="x" size={20} color="#2C402E" />
              </TouchableOpacity>
            )}
            {isAnalyzing && (
              <Animated.View entering={FadeIn} className="absolute inset-0 bg-white/70 items-center justify-center backdrop-blur-md">
                <ActivityIndicator size="large" color="#4A6B4D" />
                <Text className="mt-4 font-bold text-[#2C402E] text-lg">Running Ensemble...</Text>
              </Animated.View>
            )}
          </View>
        ) : (
          <TouchableOpacity onPress={pickImage} className="h-72 rounded-[32px] border-2 border-dashed border-[#B0BDB0] bg-white items-center justify-center shadow-sm">
            <View className="w-16 h-16 rounded-full bg-[#F5F3E9] items-center justify-center mb-4">
              <Feather name="camera" size={28} color="#4A6B4D" />
            </View>
            <Text className="text-lg font-bold text-[#2C402E]">Capture Bark</Text>
          </TouchableOpacity>
        )}
      </Animated.View>

      {!result && (
        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <PrimaryButton 
            label={imageUri ? "Analyze Readiness" : "Waiting for Image..."} 
            colorClass={imageUri ? "bg-[#4A6B4D]" : "bg-[#B0BDB0]"} 
            iconName={imageUri ? "cpu" : "image"}
            onPress={imageUri ? analyzeBark : () => {}}
          />
        </Animated.View>
      )}

      {result && (
        <Animated.View entering={FadeInDown.springify()} className="rounded-[32px] border border-[#E8E6DD] bg-white p-6 shadow-sm mb-6">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-[#8A9A86] font-bold text-sm uppercase tracking-wider">Analysis Complete</Text>
            <TouchableOpacity onPress={() => setResult(null)}>
              <Text className="text-[#7CB342] font-bold text-sm">Reset</Text>
            </TouchableOpacity>
          </View>

          <Text className="text-3xl font-extrabold text-[#2C402E] mt-2 mb-1">{result.predicted_class}</Text>
          <Text className="text-base font-medium text-[#4A6B4D] mb-6">{getRecommendation(result.predicted_class)}</Text>

          <View className="mb-8 mt-2">
            <View className="flex-row justify-between mb-2 px-1">
              <Text className="text-xs font-bold text-[#8A9A86]">Immature</Text>
              <Text className="text-xs font-bold text-[#8A9A86]">Optimal</Text>
              <Text className="text-xs font-bold text-[#8A9A86]">Over-mature</Text>
            </View>
            <View className="h-4 w-full bg-[#F5F3E9] rounded-full flex-row overflow-hidden relative">
              <View className="flex-1 bg-amber-200" />
              <View className="flex-1 bg-emerald-400" />
              <View className="flex-1 bg-orange-300" />
              <View 
                style={{ left: `${(result.readiness_score / 2) * 100}%` }} 
                className="absolute top-0 bottom-0 w-[6px] bg-[#2C402E] rounded-full -ml-[3px] border-[1px] border-white shadow-sm" 
              />
            </View>
            <Text className="text-center text-xs font-bold text-[#8A9A86] mt-2">Score: {result.readiness_score.toFixed(2)}</Text>
          </View>

          <View className="bg-[#F5F3E9] p-4 rounded-2xl border border-[#E8E6DD]">
            <View className="flex-row items-center mb-2">
              <Text className="font-bold text-[#2C402E] mr-2">Ensemble Confidence</Text>
              {(() => {
                const conf = getConfidenceInfo(result.std);
                return (
                  <View className={`flex-row items-center px-2 py-1 rounded-md ${conf.bg}`}>
                    <Feather name={conf.icon} size={12} color={conf.color.replace('text-', '')} className="mr-1" />
                    <Text className={`text-xs font-bold ${conf.color}`}>{conf.level}</Text>
                  </View>
                );
              })()}
            </View>
            <Text className="text-sm text-[#8A9A86] leading-tight">
              {result.std > 0.15 
                ? "Models disagree. Consider performing a manual bark slit test to confirm."
                : `Deviation: ±${result.std}. Strong agreement among models.`}
            </Text>
          </View>
        </Animated.View>
      )}
    </ScrollView>
  );
}
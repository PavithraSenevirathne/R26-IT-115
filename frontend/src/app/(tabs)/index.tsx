import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Image, Alert, ActivityIndicator, Modal, Pressable } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { imageToTensor } from '../../utils/tensorHelper';
import { initializeDiseaseModels, runDiseaseInference } from '../../services/diseaseModel';
import { initializePlantGate, runPlantValidation } from '@/services/plantValidation';

type PlantPart = 'leaf' | 'stem';

interface Prediction {
  label: string;
  confidence: number;
}

const formatLabel = (label: string) => {
  return label.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const safeShadow = {
  elevation: 2,
  shadowColor: '#2C402E',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
};

export default function DiseaseScreen() {
  const [selectedPart, setSelectedPart] = useState<PlantPart | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<Prediction[] | null>(null);
  
  const [showValidationAlert, setShowValidationAlert] = useState(false);
  
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();

  useEffect(() => {
    initializeDiseaseModels().catch((err) => console.log('Model init log:', err));
    initializePlantGate().catch((err) => console.log('Gate init log:', err));
  }, []);

  const handlePartSelection = (part: PlantPart) => {
    if (selectedPart === part) return;
    setSelectedPart(part);
    setImageUri(null);
    setResults(null);
  };

  const pickImage = async (useCamera: boolean) => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    };

    let result;
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera access is needed to capture the specimen.');
        return;
      }
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Gallery access is required to select a photo.');
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync(options);
    }

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

      const isPlant = await runPlantValidation(manipulated.uri);
      if (!isPlant) {
        setTimeout(() => {
          setImageUri(null);
          setResults(null);
          setShowValidationAlert(true);
        }, 150);
        return;
      }

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
      const errorMessage = error instanceof Error ? error.message : String(error);
      Alert.alert('Pipeline Error', errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetScanner = () => {
    if (isAnalyzing) return;
    setTimeout(() => {
      setImageUri(null);
      setResults(null);
      setSelectedPart(null);
    }, 150);
  };

  const handleDiscussWithAI = () => {
    if (!results || results.length === 0) return;

    const topPrediction = results[0];
    const isHealthy = topPrediction.label.includes('healthy');
    const conditionText = isHealthy ? "healthy" : `infected with ${formatLabel(topPrediction.label)}`;
    
    const newChatId = Crypto.randomUUID();
    const chatTitle = isHealthy 
      ? `${selectedPart === 'leaf' ? 'Leaf' : 'Stem'} Scan: Healthy` 
      : `${selectedPart === 'leaf' ? 'Leaf' : 'Stem'}: ${formatLabel(topPrediction.label)}`;
    const chatColor = isHealthy ? '#10B981' : '#E11D48';

    try {
      db.runSync(
        'INSERT INTO plants (id, name, color, created_at) VALUES (?, ?, ?, ?)',
        [newChatId, chatTitle, chatColor, Date.now()]
      );
    } catch (err) {
      console.error("Failed to create new chat session in DB:", err);
      Alert.alert("Database Error", "Could not create a new chat session.");
      return;
    }
    
    const promptText = encodeURIComponent(
      `My AI disease scanner just analyzed a cinnamon ${selectedPart} and determined it is ${conditionText} (Confidence: ${Math.round(topPrediction.confidence * 100)}%). What exact agronomic steps, treatments, or preventative care should I take now?`
    );

    router.push(`/chat/${newChatId}?autoPrompt=${promptText}`);
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
        <View style={safeShadow} className="bg-white rounded-3xl p-6 border border-[#E8E6DD] mt-6">
          <View className="items-center mb-4">
            <View className="bg-[#F5F3E9] w-16 h-16 rounded-full items-center justify-center mb-3">
              <MaterialCommunityIcons name="help-network-outline" size={32} color="#768C73" />
            </View>
            <Text className="text-xl font-extrabold text-[#1F3021] text-center">Uncertain Result</Text>
            <Text className="text-[#768C73] font-bold mt-1 text-center">
              Top Match: {Math.round(topPrediction.confidence * 100)}%
            </Text>
          </View>
          <Text className="text-[#4F6851] text-center leading-relaxed mb-2 text-sm">
            The AI could not identify the condition with high confidence. Ensure the photo is well-lit, focused, and close to the symptom.
          </Text>
        </View>
      );
    }

    if (isHealthy) {
      return (
        <View style={safeShadow} className="bg-[#EBF3E8] rounded-3xl p-6 border border-[#CBDBC7] mt-6">
          <View className="flex-row items-center mb-4">
            <View style={safeShadow} className="bg-[#3E5C41] w-12 h-12 rounded-full items-center justify-center mr-4">
              <MaterialCommunityIcons name="check-decagram" size={26} color="white" />
            </View>
            <View className="flex-1">
              <Text className="text-2xl font-extrabold text-[#1F3021]">Healthy Crop!</Text>
              <Text className="text-[#3E5C41] font-bold mt-0.5">{Math.round(topPrediction.confidence * 100)}% Confidence</Text>
            </View>
          </View>
          <Text className="text-[#4F6851] font-medium leading-relaxed">
            No active disease symptoms detected on this {selectedPart}. Continue your standard cultivation protocols.
          </Text>
        </View>
      );
    }

    return (
      <View style={safeShadow} className="bg-[#FFF4F4] rounded-3xl p-6 border border-[#FDE8E8] mt-6">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-rose-600 font-bold text-xs uppercase tracking-widest">Disease Detected</Text>
          <MaterialCommunityIcons name="shield-alert-outline" size={20} color="#E11D48" />
        </View>

        <Text className="text-3xl font-extrabold text-[#881337] mb-2">{formatLabel(topPrediction.label)}</Text>

        <View className="flex-row items-center mb-6">
          <View className="h-2.5 flex-1 bg-[#FEE2E2] rounded-full overflow-hidden mr-3">
            <View style={{ width: `${topPrediction.confidence * 100}%` }} className="h-full bg-rose-500 rounded-full" />
          </View>
          <Text className="text-rose-700 font-extrabold">{Math.round(topPrediction.confidence * 100)}%</Text>
        </View>

        {isRoughBarkWarning && (
          <View className="bg-amber-50 p-4 rounded-2xl border border-amber-200/60 mb-4">
            <Text className="text-amber-800 text-xs font-semibold leading-relaxed">
              ⚠️ Model Note: Rough bark and stripe canker share visual similarities. Because confidence is below 85%, inspect closely for localized sunken streaks or deep bark cracking.
            </Text>
          </View>
        )}

        {showSecondary && secondPrediction && (
          <View className="bg-white/80 p-4 rounded-2xl border border-rose-100 mb-2">
            <Text className="text-[#768C73] font-bold text-[10px] uppercase tracking-wider mb-1.5">Possible Alternate</Text>
            <View className="flex-row justify-between items-center">
              <Text className="text-[#1F3021] font-bold">{formatLabel(secondPrediction.label)}</Text>
              <Text className="text-[#768C73] font-bold">{Math.round(secondPrediction.confidence * 100)}%</Text>
            </View>
            <Text className="text-[11px] text-[#768C73] mt-2 leading-tight">
              Confidence is below 60%. Compare physical signs for both conditions to be safe.
            </Text>
          </View>
        )}
      </View>
    );
  };

  const isLocked = isAnalyzing || !!results;

  return (
    <>
      <ScrollView
        className="flex-1 bg-[#F0F4F1] px-6 pt-6"
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center self-start bg-[#E4ECE1] px-3 py-1.5 rounded-full mb-6 border border-[#CBDBC7]">
          <MaterialCommunityIcons name="shield-check" size={14} color="#3E5C41" />
          <Text className="text-[#3E5C41] text-[10px] font-bold ml-1.5 uppercase tracking-widest">On-Device AI</Text>
        </View>

        <Text className="text-3xl font-extrabold text-[#1F3021] mb-2 tracking-tight">Plant Scanner</Text>
        <Text className="mb-8 text-sm text-[#768C73] leading-relaxed">
          Detect cinnamon diseases instantly. Select a target, capture a photo, and analyze completely offline.
        </Text>

        <View className="mb-8">
          <Text className="text-xs font-bold text-[#768C73] uppercase tracking-widest mb-3">Step 1: Select Target</Text>
          <View className="flex-row justify-between">
            <TouchableOpacity
              onPress={() => handlePartSelection('leaf')}
              disabled={isLocked}
              activeOpacity={0.7}
              style={[{ width: '48%' }, selectedPart === 'leaf' && safeShadow]}
              className={`p-4 rounded-2xl border flex-row items-center justify-center transition-all ${
                selectedPart === 'leaf' ? 'bg-[#EBF3E8] border-[#3E5C41]' : 'bg-white border-[#E8E6DD]'
              } ${isLocked ? 'opacity-50' : ''}`}
            >
              <MaterialCommunityIcons name="leaf" size={20} color={selectedPart === 'leaf' ? '#3E5C41' : '#A3B5A0'} />
              <Text className={`font-bold ml-2 ${selectedPart === 'leaf' ? 'text-[#1F3021]' : 'text-[#768C73]'}`}>
                Leaf
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handlePartSelection('stem')}
              disabled={isLocked}
              activeOpacity={0.7}
              style={[{ width: '48%' }, selectedPart === 'stem' && safeShadow]}
              className={`p-4 rounded-2xl border flex-row items-center justify-center transition-all ${
                selectedPart === 'stem' ? 'bg-[#EBF3E8] border-[#3E5C41]' : 'bg-white border-[#E8E6DD]'
              } ${isLocked ? 'opacity-50' : ''}`}
            >
              <MaterialCommunityIcons name="tree-outline" size={20} color={selectedPart === 'stem' ? '#3E5C41' : '#A3B5A0'} />
              <Text className={`font-bold ml-2 ${selectedPart === 'stem' ? 'text-[#1F3021]' : 'text-[#768C73]'}`}>
                Stem
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mb-8">
          <View style={{ opacity: selectedPart ? 1 : 0.4 }} pointerEvents={selectedPart ? 'auto' : 'none'}>
            <Text className="text-xs font-bold text-[#768C73] uppercase tracking-widest mb-3">Step 2: Scan & Analyze</Text>

            {imageUri ? (
              <View style={safeShadow} className="w-full aspect-square bg-[#E8E6DD] rounded-[32px] overflow-hidden border-2 border-white relative mb-6">
                <Image source={{ uri: imageUri }} className="w-full h-full" resizeMode="cover" />

                {!isLocked && (
                  <Pressable
                    onPress={resetScanner}
                    style={safeShadow}
                    className="absolute top-5 right-5 w-9 h-9 bg-white/95 rounded-full items-center justify-center active:bg-gray-200"
                  >
                    <Feather name="x" size={16} color="#1F3021" strokeWidth={2.5} />
                  </Pressable>
                )}

                {isAnalyzing && (
                  <View className="absolute inset-0 bg-[#1F3021]/60 items-center justify-center">
                    <ActivityIndicator size="large" color="white" />
                    <Text className="mt-4 font-bold text-white text-base tracking-wide">Analyzing Image...</Text>
                  </View>
                )}
              </View>
            ) : (
              <View className="flex-row justify-between mb-6">
                <TouchableOpacity
                  onPress={() => pickImage(true)}
                  activeOpacity={0.85}
                  style={[{ width: '65%' }, safeShadow]}
                  className="h-36 bg-[#2D4530] rounded-3xl items-center justify-center border border-[#3E5C41]"
                >
                  <MaterialCommunityIcons name="camera-outline" size={36} color="white" />
                  <Text className="text-white font-bold mt-2">Take Photo</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  onPress={() => pickImage(false)}
                  activeOpacity={0.7}
                  style={[{ width: '31%' }, safeShadow]}
                  className="h-36 bg-white border border-[#E8E6DD] rounded-3xl items-center justify-center"
                >
                  <MaterialCommunityIcons name="image-outline" size={32} color="#768C73" />
                  <Text className="text-[#4F6851] font-bold mt-2 text-sm">Gallery</Text>
                </TouchableOpacity>
              </View>
            )}

            {imageUri && !results && (
              <TouchableOpacity
                onPress={runLocalInference}
                activeOpacity={0.8}
                style={safeShadow}
                className="bg-[#3E5C41] py-4 rounded-2xl flex-row justify-center items-center border border-[#4A6B4D]"
              >
                <MaterialCommunityIcons name="microscope" size={22} color="white" />
                <Text className="text-white font-bold ml-2 text-base tracking-wide">
                  Analyze {selectedPart === 'leaf' ? 'Leaf' : 'Stem'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {renderResults()}

        {results && (
          <View className="mt-2 mb-8">
            <TouchableOpacity
              onPress={handleDiscussWithAI}
              activeOpacity={0.8}
              style={safeShadow}
              className="bg-[#2D4530] border border-[#3E5C41] py-4 rounded-2xl flex-row justify-center items-center mb-3"
            >
              <MaterialCommunityIcons name="robot-outline" size={20} color="white" />
              <Text className="text-white font-bold ml-2 text-base">Discuss with CinnLLM</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={resetScanner}
              activeOpacity={0.7}
              style={safeShadow}
              className="bg-white border border-[#E8E6DD] py-4 rounded-2xl flex-row justify-center items-center mb-6"
            >
              <Feather name="refresh-cw" size={18} color="#768C73" />
              <Text className="text-[#4F6851] font-bold ml-2 text-base">Scan Another Specimen</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal transparent visible={showValidationAlert} animationType="fade">
        <View className="flex-1 bg-black/60 items-center justify-center px-6">
          <View className="bg-white rounded-[32px] p-6 w-full items-center" style={safeShadow}>
            <View className="bg-[#FFF4F4] w-16 h-16 rounded-full items-center justify-center mb-4 border border-[#FDE8E8]">
              <MaterialCommunityIcons name="leaf-off" size={32} color="#E11D48" />
            </View>
            <Text className="text-2xl font-extrabold text-[#1F3021] mb-2 text-center">Invalid Subject</Text>
            <Text className="text-[#4F6851] text-center leading-relaxed mb-8">
              This image does not appear to be a plant. Please capture a clear photo of a leaf or stem.
            </Text>
            
            <TouchableOpacity
              onPress={() => setShowValidationAlert(false)}
              activeOpacity={0.8}
              className="bg-[#2D4530] py-4 w-full rounded-2xl items-center border border-[#3E5C41]"
            >
              <Text className="text-white font-bold text-base tracking-wide">Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
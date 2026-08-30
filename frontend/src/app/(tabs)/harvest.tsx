import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Image, ActivityIndicator, Alert, Pressable, Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { imageToTensor } from '../../utils/tensorHelper';
import { initializeHarvestEnsemble, runHarvestInference } from '../../services/harvestEnsemble';
import { initializePlantGate, runPlantValidation } from '../../services/plantValidation';

type ReadinessClass = 'Immature' | 'Optimal' | 'Over-mature';

interface HarvestAnalysisResult {
  readiness_score: number;
  std: number;
  predicted_class: ReadinessClass;
}

const safeShadow = {
  elevation: 2,
  shadowColor: '#2C402E',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
};

export default function HarvestScreen() {
  const [isModelReady, setIsModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<HarvestAnalysisResult | null>(null);
  
  const [showValidationAlert, setShowValidationAlert] = useState(false);

  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();

  useEffect(() => {
    initializeHarvestEnsemble()
      .then(() => setIsModelReady(true))
      .catch((error) => {
        console.error("Failed to load ensemble models:", error);
        setModelError("Could not load the AI ensemble. Please restart the app.");
      });
      
    initializePlantGate().catch((err) => console.log('Gate init log:', err));
  }, []);

  const pickImage = async (useCamera: boolean) => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.8,
    };

    let pickerResult;
    
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera access is needed to capture the bark.');
        return;
      }
      pickerResult = await ImagePicker.launchCameraAsync(options);
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Gallery access is required to select a photo.');
        return;
      }
      pickerResult = await ImagePicker.launchImageLibraryAsync(options);
    }

    if (!pickerResult.canceled) {
      setImageUri(pickerResult.assets[0].uri);
      setResult(null);
    }
  };

  const analyzeBark = async () => {
    if (!imageUri || !isModelReady) return;
    setIsAnalyzing(true);
    
    try {
      // @ts-ignore
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 224, height: 224 } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );

      const isPlant = await runPlantValidation(manipulatedImage.uri);
      if (!isPlant) {
        setTimeout(() => { 
          setImageUri(null); 
          setResult(null); 
          setShowValidationAlert(true);
        }, 150);
        return; 
      }

      const tensor = await imageToTensor(manipulatedImage.uri);
      const inferenceResult = await runHarvestInference(tensor);
      
      const score = parseFloat(inferenceResult.meanScore);
      const std = parseFloat(inferenceResult.stdDev);

      let mappedClass: ReadinessClass = 'Optimal';
      if (score < 0.66) mappedClass = 'Immature';
      else if (score > 1.33) mappedClass = 'Over-mature';

      setResult({
        readiness_score: score,
        std: std,
        predicted_class: mappedClass,
      });

    } catch (error) {
      console.error("Harvest Inference Error:", error);
      Alert.alert(
        "Analysis Failed", 
        "Could not process the image. Please try again.",
        [{ text: "OK", onPress: () => setTimeout(() => { setImageUri(null); setResult(null); }, 150) }]
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getRecommendation = (predictedClass: ReadinessClass) => {
    switch (predictedClass) {
      case 'Immature': return "Bark is too thin. Wait longer before peeling.";
      case 'Optimal': return "Prime readiness! Harvest now for a good gain.";
      case 'Over-mature': return "Past optimal time-frame. Bark may be tough to peel.";
    }
  };

  const getConfidenceInfo = (std: number) => {
    if (std < 0.05) return { level: 'High', color: '#059669', bg: '#D1FAE5', icon: 'check-circle' as const };
    if (std < 0.15) return { level: 'Medium', color: '#D97706', bg: '#FEF3C7', icon: 'minus-circle' as const };
    return { level: 'Low', color: '#E11D48', bg: '#FFE4E6', icon: 'alert-circle' as const };
  };

  const resetScanner = () => {
    if (isAnalyzing) return;    
    setTimeout(() => {
      setImageUri(null);
      setResult(null);
    }, 150);
  };

  const handleDiscussWithAI = () => {
    if (!result) return;

    const newChatId = Crypto.randomUUID();
    const chatTitle = `Harvest Scan: ${result.predicted_class}`;
    
    let chatColor = '#10B981'; 
    if (result.predicted_class === 'Immature') chatColor = '#F59E0B';
    else if (result.predicted_class === 'Over-mature') chatColor = '#F43F5E';

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
      `My cinnamon bark scan indicates a maturity status of "${result.predicted_class}" (Readiness score: ${result.readiness_score.toFixed(2)} / 2.00). What exact operational steps should I take next regarding stem harvesting, peeling technique and timing?`
    );

    router.push(`/chat/${newChatId}?autoPrompt=${promptText}`);
  };

  const isLocked = isAnalyzing || !isModelReady || !!modelError;

  return (
    <>
      <ScrollView 
        className="flex-1 bg-[#ACE1AF] px-6 pt-6" 
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40 }} 
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center self-start bg-[#E4ECE1] px-3 py-1.5 rounded-full mb-6 border border-[#CBDBC7]">
          <MaterialCommunityIcons name="layers-triple-outline" size={14} color="#3E5C41" />
          <Text className="text-[#3E5C41] text-[10px] font-bold ml-1.5 uppercase tracking-widest">Ensemble AI</Text>
        </View>

        <Text className="text-3xl font-extrabold text-[#1F3021] mb-2 tracking-tight">Harvest Readiness</Text>
        <Text className="mb-8 text-sm text-[#768C73] leading-relaxed">
          Determine the optimal time to peel cinnamon bark. Capture a clear, close-up photo of the stem surface.
        </Text>

        {modelError && (
          <View className="bg-[#FFF4F4] p-4 rounded-2xl border border-[#FDE8E8] mb-6 flex-row items-center">
            <MaterialCommunityIcons name="alert-circle-outline" size={24} color="#E11D48" />
            <Text className="text-[#881337] font-semibold ml-3 flex-1">{modelError}</Text>
          </View>
        )}

        <View className="mb-6">
          {!imageUri ? (
            <View className="flex-row justify-between mb-2">
              <TouchableOpacity
                onPress={() => pickImage(true)}
                disabled={isLocked}
                activeOpacity={0.85}
                style={[{ width: '48%' }, !isLocked && safeShadow]}
                className={`h-40 rounded-3xl items-center justify-center border transition-all ${
                  isLocked ? 'bg-[#768C73] border-[#768C73] opacity-60' : 'bg-[#2D4530] border-[#3E5C41]'
                }`}
              >
                {isLocked && !modelError ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="camera-iris" size={36} color="white" />
                    <Text className="text-white font-bold mt-3">Camera</Text>
                  </>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={() => pickImage(false)}
                disabled={isLocked}
                activeOpacity={0.7}
                style={[{ width: '48%' }, !isLocked && safeShadow]}
                className={`h-40 bg-white border rounded-3xl items-center justify-center transition-all ${
                  isLocked ? 'border-[#E8E6DD] opacity-60' : 'border-[#E8E6DD]'
                }`}
              >
                {isLocked && !modelError ? (
                  <Text className="text-[#768C73] font-bold text-xs mt-3">Warming Models...</Text>
                ) : (
                  <>
                    <MaterialCommunityIcons name="image-multiple-outline" size={32} color="#768C73" />
                    <Text className="text-[#4F6851] font-bold mt-3 text-sm">Gallery</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={safeShadow} className="w-full aspect-[4/5] bg-[#E8E6DD] rounded-[32px] overflow-hidden border-2 border-white relative">
              <Image source={{ uri: imageUri }} className="w-full h-full" resizeMode="cover" />
              
              {!isAnalyzing && !result && (
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
                  <Text className="mt-4 font-bold text-white text-base tracking-wide">Evaluating Bark...</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {imageUri && !result && (
          <View>
            <TouchableOpacity
              onPress={analyzeBark}
              disabled={isLocked}
              activeOpacity={0.8}
              style={safeShadow}
              className={`py-4 rounded-2xl flex-row justify-center items-center border ${
                isLocked ? 'bg-[#768C73] border-[#768C73]' : 'bg-[#3E5C41] border-[#4A6B4D]'
              }`}
            >
              {isAnalyzing ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <>
                  <MaterialCommunityIcons name="chart-bell-curve" size={22} color="white" />
                  <Text className="text-white font-bold ml-2 text-base tracking-wide">Analyze Readiness</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {result && (
          <View>
            <View style={safeShadow} className="bg-white rounded-[32px] border border-[#E8E6DD] p-6 mb-6">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-[#768C73] font-bold text-[10px] uppercase tracking-widest">Ensemble Output</Text>
                <MaterialCommunityIcons 
                  name={result.predicted_class === 'Optimal' ? "check-decagram" : "alert-circle-outline"} 
                  size={22} 
                  color={result.predicted_class === 'Optimal' ? "#10B981" : "#D97706"} 
                />
              </View>

              <Text className="text-3xl font-extrabold text-[#1F3021] mb-1">{result.predicted_class}</Text>
              <Text className="text-sm font-semibold text-[#4F6851] mb-8">{getRecommendation(result.predicted_class)}</Text>

              <View className="mb-8">
                <View className="flex-row justify-between mb-2 px-1">
                  <Text className="text-[10px] font-bold text-[#768C73] uppercase tracking-wider">Immature</Text>
                  <Text className="text-[10px] font-bold text-[#768C73] uppercase tracking-wider">Optimal</Text>
                  <Text className="text-[10px] font-bold text-[#768C73] uppercase tracking-wider">Over-mature</Text>
                </View>
                
                <View className="h-3.5 w-full bg-[#F5F3E9] rounded-full flex-row overflow-hidden relative">
                  <View className="flex-1 bg-[#FCD34D]" /> 
                  <View className="flex-1 bg-[#34D399]" /> 
                  <View className="flex-1 bg-[#FDBA74]" /> 
                  
                  <View 
                    style={{ left: `${Math.min(Math.max((result.readiness_score / 2) * 100, 0), 100)}%` }} 
                    className="absolute top-0 bottom-0 w-1.5 bg-[#1F3021] rounded-full -ml-[3px] border-[1px] border-white shadow-sm" 
                  />
                </View>
                <Text className="text-center text-xs font-bold text-[#768C73] mt-2">Score: {result.readiness_score.toFixed(2)}</Text>
              </View>

              <View className="bg-[#F5F3E9] p-4 rounded-2xl border border-[#E8E6DD]">
                <View className="flex-row items-center mb-2">
                  <Text className="font-bold text-[#1F3021] mr-2 text-sm">Model Consensus</Text>
                  {(() => {
                    const conf = getConfidenceInfo(result.std);
                    return (
                      <View style={{ backgroundColor: conf.bg }} className="flex-row items-center px-2 py-1 rounded-md">
                        <Feather name={conf.icon} size={12} color={conf.color} className="mr-1" />
                        <Text style={{ color: conf.color }} className="text-xs font-bold">{conf.level}</Text>
                      </View>
                    );
                  })()}
                </View>
                <Text className="text-[#4F6851] text-xs leading-relaxed">
                  {result.std > 0.15 
                    ? "The ensemble models disagree. Consider performing a manual bark slit test to confirm readiness."
                    : `Deviation: ±${result.std.toFixed(3)}. Strong agreement among all AI models.`}
                </Text>
              </View>
            </View>
            
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
              <Text className="text-[#4F6851] font-bold ml-2 text-base">Scan Another Stem</Text>
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
              This image does not appear to be cinnamon bark. Please capture a clear, close-up photo of the stem surface.
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
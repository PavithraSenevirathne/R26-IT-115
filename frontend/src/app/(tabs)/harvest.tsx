import React, { useState, useEffect } from 'react';
import { 
  ScrollView, 
  View, 
  Text, 
  TouchableOpacity, 
  Image, 
  ActivityIndicator, 
  Alert, 
  Pressable, 
  Modal,
  LayoutAnimation,
  Platform,
  UIManager
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { imageToTensor } from '../../utils/tensorHelper';
import { initializeHarvestEnsemble, runHarvestInference } from '../../services/harvestEnsemble';
import { initializeBarkGate, runBarkValidation } from '../../services/barkValidation';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type ReadinessClass = 'Immature' | 'Optimal' | 'Over-mature';

interface HarvestAnalysisResult {
  readiness_score: number;
  std: number;
  predicted_class: ReadinessClass;
}

const premiumShadow = {
  elevation: 6,
  shadowColor: '#9A3412', 
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.12,
  shadowRadius: 12,
};

const softShadow = {
  elevation: 2,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 4,
};

const calmingAnimation = {
  duration: 400,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
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

  const triggerAnimation = () => {
    LayoutAnimation.configureNext(calmingAnimation);
  };

  useEffect(() => {
    Promise.all([
      initializeHarvestEnsemble(),
      initializeBarkGate(),
    ])
      .then(() => setIsModelReady(true))
      .catch((error) => {
        console.error("Failed to load harvest models:", error);
        setModelError("Could not load the AI models. Please restart the app.");
      });
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
      triggerAnimation();
      setImageUri(pickerResult.assets[0].uri);
      setResult(null);
    }
  };

  const analyzeBark = async () => {
    if (!imageUri || !isModelReady) return;
    triggerAnimation();
    setIsAnalyzing(true);
    
    try {
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 224, height: 224 } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );

      const isCinnamonBark = await runBarkValidation(manipulatedImage.uri);
      if (!isCinnamonBark) {
        setTimeout(() => { 
          triggerAnimation();
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

      triggerAnimation();
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
        [{ text: "OK", onPress: () => setTimeout(() => { 
          triggerAnimation();
          setImageUri(null); 
          setResult(null); 
        }, 150) }]
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getRecommendation = (predictedClass: ReadinessClass) => {
    switch (predictedClass) {
      case 'Immature': return "Bark is too thin. Wait longer before peeling.";
      case 'Optimal': return "Prime readiness! Harvest now for maximum yield.";
      case 'Over-mature': return "Past optimal time-frame. Bark may be tough.";
    }
  };

  const getConfidenceInfo = (std: number) => {
    if (std < 0.05) return { level: 'High Consensus', textClass: 'text-emerald-800', bgClass: 'bg-emerald-100', icon: 'check-circle' as const };
    if (std < 0.15) return { level: 'Medium Consensus', textClass: 'text-amber-800', bgClass: 'bg-amber-100', icon: 'minus-circle' as const };
    return { level: 'Low Consensus', textClass: 'text-rose-800', bgClass: 'bg-rose-100', icon: 'alert-circle' as const };
  };

  const resetScanner = () => {
    if (isAnalyzing) return;    
    triggerAnimation();
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
        className="flex-1 bg-[#FFFBF7] px-5 pt-6"
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 50 }} 
        showsVerticalScrollIndicator={true}
        indicatorStyle="default"
      >
        <View style={premiumShadow} className="bg-green-600 rounded-2xl p-6 mb-8 overflow-hidden relative">
          <MaterialCommunityIcons 
            name="leaf-maple" 
            size={140} 
            color="#FFFFFF" 
            style={{ position: 'absolute', right: -30, top: -20, opacity: 0.15, transform: [{ rotate: '15deg' }] }} 
          />
          <Text className="text-white text-3xl font-extrabold mb-1 tracking-tight">Harvest Readiness Indicator</Text>
          <Text className="text-orange-100 text-sm font-medium leading-relaxed w-5/6">
            Powered by 5 Ensemble models. Helpful to determine the perfect time for cinnamon harvesting by analyzing the bark's maturity.
          </Text>
        </View>

        {modelError && (
          <View className="bg-rose-50 p-4 rounded-xl border-l-4 border-rose-500 mb-6 flex-row items-center" style={softShadow}>
            <MaterialCommunityIcons name="alert-circle" size={28} color="#E11D48" />
            <Text className="text-rose-900 font-semibold ml-3 flex-1 text-sm">{modelError}</Text>
          </View>
        )}

        <View className="mb-6">
          {!imageUri ? (
            <View className="flex-col">
              <Text className="text-slate-800 font-extrabold text-lg mb-4 ml-1">Add Specimen</Text>
              
              <TouchableOpacity
                onPress={() => pickImage(true)}
                disabled={isLocked}
                activeOpacity={0.8}
                style={!isLocked && premiumShadow}
                className={`w-full rounded-2xl flex-row items-center p-4 mb-4 transition-all ${
                  isLocked ? 'bg-slate-200 opacity-60' : 'bg-green-600'
                }`}
              >
                {isLocked && !modelError ? (
                  <View className="w-full items-center py-4"><ActivityIndicator color="white" /></View>
                ) : (
                  <>
                    <View className="bg-white/20 p-3 rounded-xl mr-4">
                      <MaterialCommunityIcons name="camera-iris" size={28} color="white" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-white font-extrabold text-lg">Open Camera</Text>
                      <Text className="text-orange-100 text-xs font-medium mt-0.5">Capture a fresh bark photo</Text>
                    </View>
                    <Feather name="chevron-right" size={24} color="white" opacity={0.6} />
                  </>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={() => pickImage(false)}
                disabled={isLocked}
                activeOpacity={0.7}
                style={!isLocked && softShadow}
                className={`w-full bg-white border border-slate-100 rounded-2xl flex-row items-center p-4 transition-all ${
                  isLocked ? 'opacity-60' : ''
                }`}
              >
                {isLocked && !modelError ? (
                  <View className="w-full items-center py-4"><Text className="text-slate-400 font-bold">Warming Models...</Text></View>
                ) : (
                  <>
                    <View className="bg-green-50 p-3 rounded-xl mr-4">
                      <MaterialCommunityIcons name="image-multiple" size={28} color="#F97316" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-slate-800 font-extrabold text-lg">Photo Gallery</Text>
                      <Text className="text-slate-400 text-xs font-medium mt-0.5">Choose an existing image</Text>
                    </View>
                    <Feather name="chevron-right" size={24} color="#CBD5E1" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text className="text-slate-800 font-extrabold text-lg mb-4 ml-1">Target Acquired</Text>
              <View style={premiumShadow} className="w-full bg-white p-3 rounded-[24px] mb-6 border border-slate-100">
                <View className="w-full aspect-[4/5] bg-slate-100 rounded-xl overflow-hidden relative">
                  <Image source={{ uri: imageUri }} className="w-full h-full" resizeMode="cover" />
                  
                  {!isAnalyzing && !result && (
                    <Pressable 
                      onPress={resetScanner} 
                      style={premiumShadow} 
                      className="absolute top-4 right-4 w-10 h-10 bg-white/95 rounded-full items-center justify-center active:bg-slate-100"
                    >
                      <Feather name="x" size={20} color="#0F172A" strokeWidth={3} />
                    </Pressable>
                  )}
                  
                  {isAnalyzing && (
                    <View className="absolute inset-0 bg-slate-900/60 items-center justify-center backdrop-blur-sm">
                      <View className="bg-white/20 p-4 rounded-full mb-3">
                        <ActivityIndicator size="large" color="#FFFFFF" />
                      </View>
                      <Text className="font-extrabold text-white text-lg tracking-wider">Analyzing Bark</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}
        </View>

        {imageUri && !result && (
          <TouchableOpacity
            onPress={analyzeBark}
            disabled={isLocked}
            activeOpacity={0.8}
            style={premiumShadow}
            className={`py-4 rounded-xl flex-row justify-center items-center ${
              isLocked ? 'bg-slate-300' : 'bg-emerald-500'
            }`}
          >
            {isAnalyzing ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="layers-triple" size={24} color="white" />
                <Text className="text-white font-extrabold ml-3 text-lg">Run Analysis</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {result && (
          <View className="mt-2">
            <Text className="text-slate-800 font-extrabold text-lg mb-4 ml-1">Analysis Results</Text>
            
            <View className="flex-row gap-3 mb-3">
              <View style={softShadow} className="flex-1 bg-white p-5 rounded-2xl border border-slate-100">
                <MaterialCommunityIcons 
                  name={result.predicted_class === 'Optimal' ? "check-decagram" : "alert-decagram"} 
                  size={32} 
                  color={result.predicted_class === 'Optimal' ? "#10B981" : "#F59E0B"} 
                  className="mb-2"
                />
                <Text className="text-3xl font-extrabold text-slate-800 mb-1">{result.predicted_class}</Text>
                <Text className="text-sm font-medium text-slate-500 leading-tight">{getRecommendation(result.predicted_class)}</Text>
              </View>
            </View>

            <View style={softShadow} className="bg-white p-5 rounded-2xl border border-slate-100 mb-3">
              <View className="flex-row justify-between items-end mb-3">
                 <Text className="font-extrabold text-slate-800">Readiness Spectrum</Text>
                 <Text className="font-bold text-orange-500 text-lg">{result.readiness_score.toFixed(2)}</Text>
              </View>
              
              <View className="h-4 w-full bg-slate-100 rounded-full flex-row overflow-hidden relative mb-2">
                <View className="flex-1 bg-amber-300" /> 
                <View className="flex-1 bg-emerald-400" /> 
                <View className="flex-1 bg-rose-400" /> 
                
                <View 
                  style={{ left: `${Math.min(Math.max((result.readiness_score / 2) * 100, 0), 100)}%` }} 
                  className="absolute top-0 bottom-0 w-2.5 bg-slate-800 rounded-full -ml-1 border-2 border-white shadow-md" 
                />
              </View>
              <View className="flex-row justify-between px-1">
                <Text className="text-[10px] font-bold text-slate-400 uppercase">Immature</Text>
                <Text className="text-[10px] font-bold text-slate-400 uppercase">Over-mature</Text>
              </View>
            </View>

            {(() => {
              const conf = getConfidenceInfo(result.std);
              return (
                <View style={softShadow} className={`${conf.bgClass} p-4 rounded-2xl border border-white/60 mb-6 flex-row items-center`}>
                  <View className="bg-white/50 p-2 rounded-full mr-3">
                    <Feather name={conf.icon} size={20} color="currentColor" className={conf.textClass} />
                  </View>
                  <View className="flex-1">
                    <Text className={`font-extrabold text-sm mb-0.5 ${conf.textClass}`}>{conf.level}</Text>
                    <Text className={`${conf.textClass} text-xs font-medium leading-tight opacity-90`}>
                      {result.std > 0.15 
                        ? "Models disagree slightly. Perform a slit test."
                        : `Deviation: ±${result.std.toFixed(3)}. AI agreement is solid.`}
                    </Text>
                  </View>
                </View>
              );
            })()}
            
            <TouchableOpacity
              onPress={handleDiscussWithAI}
              activeOpacity={0.8}
              style={premiumShadow}
              className="bg-indigo-500 py-4 rounded-xl flex-row justify-center items-center mb-4"
            >
              <MaterialCommunityIcons name="robot-outline" size={24} color="white" />
              <Text className="text-white font-extrabold ml-3 text-lg">Discuss Plan with AI</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={resetScanner}
              activeOpacity={0.7}
              className="bg-transparent py-4 rounded-xl flex-row justify-center items-center"
            >
              <Feather name="refresh-cw" size={18} color="#64748B" />
              <Text className="text-slate-500 font-bold ml-2 text-base">Scan Another Stem</Text>
            </TouchableOpacity>

          </View>
        )}
      </ScrollView>

      <Modal transparent visible={showValidationAlert} animationType="fade">
        <View className="flex-1 bg-slate-900/60 items-center justify-center px-6 backdrop-blur-sm">
          <View className="bg-white rounded-3xl p-8 w-full items-center" style={premiumShadow}>
            <View className="bg-rose-50 w-20 h-20 rounded-full items-center justify-center mb-5">
              <MaterialCommunityIcons name="leaf-off" size={40} color="#E11D48" />
            </View>
            <Text className="text-2xl font-extrabold text-slate-800 mb-2 text-center">Invalid Image</Text>
            <Text className="text-slate-500 text-center leading-relaxed mb-8 text-base font-medium">
              This does not appear to be cinnamon bark. Please capture a clear, close-up photo of the stem.
            </Text>
            
            <TouchableOpacity
              onPress={() => setShowValidationAlert(false)}
              activeOpacity={0.8}
              className="bg-slate-800 py-4 w-full rounded-xl items-center"
            >
              <Text className="text-white font-bold text-lg">Understood</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
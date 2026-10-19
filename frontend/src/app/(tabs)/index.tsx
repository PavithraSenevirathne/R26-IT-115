import React, { useState, useEffect } from 'react';
import { 
  ScrollView, 
  View, 
  Text, 
  TouchableOpacity, 
  Image, 
  Alert, 
  ActivityIndicator, 
  Modal, 
  Pressable,
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
import { initializeDiseaseModels, runDiseaseInference } from '../../services/diseaseModel';
import { initializePlantGate, runPlantValidation } from '@/services/plantValidation';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type PlantPart = 'leaf' | 'stem';

interface Prediction {
  label: string;
  confidence: number;
}

const formatLabel = (label: string) => {
  return label.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const DISEASE_INFO: Record<string, { nameSi: string, descEn: string, descSi: string }> = {
  'leaf_gall': {
    nameSi: 'පත්‍ර ගැල් රෝගය',
    descEn: 'Abnormal swellings or blister-like growths on leaves caused by insects or mites, reducing the overall photosynthetic area.',
    descSi: 'කෘමීන් හෝ මයිටාවන් නිසා පත්‍ර මතුපිට ඇතිවන අසාමාන්‍ය ඉදිමුම් හෝ බිබිලි වැනි වර්ධනයන් වේ. මින් ප්‍රභාසංශ්ලේෂණය අඩු වේ.'
  },
  'leaf_spot': {
    nameSi: 'පත්‍ර ලප රෝගය',
    descEn: 'Dark, necrotic lesions on leaves typically caused by fungal pathogens, which can lead to premature leaf drop if unmanaged.',
    descSi: 'දිලීර ආසාදන නිසා පත්‍ර මත ඇතිවන තද පැහැති ලප වේ. පාලනය නොකළහොත් පත්‍ර අකාලයේ හැලී යාමට මෙය හේතු වේ.'
  },
  'leaf_blight': {
    nameSi: 'පත්‍ර අංගමාරය',
    descEn: 'Rapid, widespread browning and withering of leaf tissues. Often a severe fungal infection requiring immediate action.',
    descSi: 'පත්‍රවල පටක වේගයෙන් දුඹුරු පැහැ වී මැලවී යාමයි. මෙය ඉක්මන් ප්‍රතිකාර අවශ්‍ය වන දරුණු දිලීර ආසාදනයකි.'
  },
  'rough_bark': {
    nameSi: 'රළු පොතු රෝගය',
    descEn: 'Causes the bark to become abnormally corky, cracked, and scaly, significantly degrading the quality of the harvestable cinnamon quill.',
    descSi: 'කුරුඳු පොත්ත අසාමාන්‍ය ලෙස රළු වීම, ඉරිතැලීම සහ කොරපොතු ස්වභාවයක් ගැනීමයි. මින් කුරුඳු පොත්තේ ගුණාත්මකභාවය බෙහෙවින් අඩු වේ.'
  },
  'stripe_canker': {
    nameSi: 'ඉරි පිළිකා රෝගය',
    descEn: 'Sunken, discolored vertical lesions on the stem that disrupt nutrient flow and severely damage bark harvest.',
    descSi: 'කඳේ සිරස් අතට ඇතිවන ගිලුණු, අවපැහැ වූ ඉරි වැනි ලප වේ. මින් පෝෂක පරිවහනය අඩාල වන අතර කුරුඳු පොත්තට දැඩි හානි සිදු වේ.'
  },
};

const premiumShadow = {
  elevation: 6,
  shadowColor: '#0F766E',
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

export default function DiseaseScreen() {
  const [selectedPart, setSelectedPart] = useState<PlantPart | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<Prediction[] | null>(null);
  
  const [showValidationAlert, setShowValidationAlert] = useState(false);
  
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();

  const triggerAnimation = () => {
    LayoutAnimation.configureNext(calmingAnimation);
  };

  useEffect(() => {
    initializeDiseaseModels().catch((err) => console.log('Model init log:', err));
    initializePlantGate().catch((err) => console.log('Gate init log:', err));
  }, []);

  const handlePartSelection = (part: PlantPart) => {
    if (selectedPart === part) return;
    triggerAnimation();
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
      triggerAnimation();
      setImageUri(result.assets[0].uri);
      setResults(null);
    }
  };

  const runLocalInference = async () => {
    if (!imageUri || !selectedPart) return;
    triggerAnimation();
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
          triggerAnimation();
          setImageUri(null);
          setResults(null);
          setShowValidationAlert(true);
        }, 150);
        return;
      }

      const tensor = await imageToTensor(manipulated.uri, 224);
      const predictions = await runDiseaseInference(tensor, selectedPart);

      triggerAnimation();
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
    triggerAnimation();
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
        <View className="mt-6 mb-6">
          <Text className="text-slate-800 font-extrabold text-lg mb-3 ml-1">Scan Results</Text>
          <View style={softShadow} className="bg-white p-6 rounded-2xl border border-slate-100 items-center">
            <View className="bg-amber-50 w-16 h-16 rounded-2xl items-center justify-center mb-4">
              <MaterialCommunityIcons name="help-network-outline" size={36} color="#F59E0B" />
            </View>
            <Text className="text-2xl font-extrabold text-slate-800 mb-1">Uncertain Result</Text>
            <Text className="text-amber-600 font-bold mb-3">Top Match: {Math.round(topPrediction.confidence * 100)}%</Text>
            <Text className="text-slate-500 text-center text-sm leading-relaxed px-2">
              The AI could not identify the condition with high confidence. Ensure the photo is well-lit, focused, and close to the symptom.
            </Text>
          </View>
        </View>
      );
    }

    if (isHealthy) {
      return (
        <View className="mt-6 mb-6">
          <Text className="text-slate-800 font-extrabold text-lg mb-3 ml-1">Scan Results</Text>
          <View style={softShadow} className="bg-white p-6 rounded-2xl border border-emerald-100">
            <View className="flex-row items-center mb-4">
              <View style={premiumShadow} className="bg-emerald-500 w-14 h-14 rounded-2xl items-center justify-center mr-4">
                <MaterialCommunityIcons name="check-decagram" size={32} color="white" />
              </View>
              <View className="flex-1">
                <Text className="text-2xl font-extrabold text-slate-800">Healthy Crop!</Text>
                <Text className="text-emerald-600 font-bold mt-0.5">{Math.round(topPrediction.confidence * 100)}% Confidence</Text>
              </View>
            </View>
            <Text className="text-slate-600 font-medium leading-relaxed bg-emerald-50 p-4 rounded-xl">
              No active disease symptoms detected on this {selectedPart}. Continue your standard cultivation protocols!
            </Text>
          </View>
        </View>
      );
    }

    const diseaseInfo = DISEASE_INFO[topPrediction.label.toLowerCase()];

    return (
      <View className="mt-6 mb-6">
        <Text className="text-slate-800 font-extrabold text-lg mb-3 ml-1">Scan Results</Text>
        
        <View style={softShadow} className="bg-white p-5 rounded-2xl border border-rose-100 mb-3">
          <View className="flex-row items-center justify-between mb-3">
            <View className="bg-rose-50 px-3 py-1.5 rounded-lg flex-row items-center">
              <MaterialCommunityIcons name="shield-alert" size={16} color="#E11D48" />
              <Text className="text-rose-600 font-bold text-[11px] uppercase tracking-widest ml-1.5">Disease Detected</Text>
            </View>
          </View>

          <Text className="text-3xl font-extrabold text-slate-800 mb-0.5">{formatLabel(topPrediction.label)}</Text>
          {diseaseInfo && (
            <Text className="text-base font-bold text-slate-500 mb-4">{diseaseInfo.nameSi}</Text>
          )}

          <View className="mb-5">
            <View className="flex-row justify-between mb-1.5">
              <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider">Confidence Level</Text>
              <Text className="text-rose-600 font-extrabold">{Math.round(topPrediction.confidence * 100)}%</Text>
            </View>
            <View className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
              <View style={{ width: `${topPrediction.confidence * 100}%` }} className="h-full bg-rose-500 rounded-full" />
            </View>
          </View>
          
          <View className="pt-4 border-t border-slate-100">
            <Text className="text-slate-700 text-sm leading-relaxed font-medium mb-3">
              {diseaseInfo ? diseaseInfo.descEn : 'A condition that requires attention and active management.'}
            </Text>
            {diseaseInfo && (
              <Text className="text-slate-500 text-sm leading-relaxed">
                {diseaseInfo.descSi}
              </Text>
            )}
          </View>
        </View>

        {isRoughBarkWarning && (
          <View style={softShadow} className="bg-amber-50 p-4 rounded-2xl border border-amber-200 mb-3 flex-row">
            <MaterialCommunityIcons name="alert" size={24} color="#D97706" style={{ marginTop: 2, marginRight: 12 }} />
            <Text className="text-amber-800 text-sm font-semibold leading-relaxed flex-1">
              Rough bark and stripe canker share visual similarities. Because confidence is below 85%, inspect closely for localized sunken streaks or deep bark cracking.
            </Text>
          </View>
        )}

        {showSecondary && secondPrediction && (
          <View style={softShadow} className="bg-white p-4 rounded-2xl border border-slate-100">
            <Text className="text-slate-400 font-bold text-[10px] uppercase tracking-wider mb-2">Possible Alternate</Text>
            <View className="flex-row justify-between items-center mb-1">
              <View>
                <Text className="text-slate-700 font-extrabold text-base">{formatLabel(secondPrediction.label)}</Text>
                {DISEASE_INFO[secondPrediction.label.toLowerCase()] && (
                  <Text className="text-slate-500 font-semibold text-xs mt-0.5">
                    {DISEASE_INFO[secondPrediction.label.toLowerCase()].nameSi}
                  </Text>
                )}
              </View>
              <View className="bg-slate-100 px-2 py-1 rounded-md">
                <Text className="text-slate-600 font-bold text-xs">{Math.round(secondPrediction.confidence * 100)}%</Text>
              </View>
            </View>
            <Text className="text-xs text-slate-500 mt-2 leading-tight">
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
        className="flex-1 bg-[#F8FAFC] px-5 pt-6"
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 50 }}
        showsVerticalScrollIndicator={true}
        indicatorStyle="default"
      >
        <View style={premiumShadow} className="bg-teal-600 rounded-2xl p-6 mb-6 overflow-hidden relative">
          <MaterialCommunityIcons 
            name="microscope" 
            size={160} 
            color="#FFFFFF" 
            style={{ position: 'absolute', right: -40, top: -30, opacity: 0.1, zIndex: 0, transform: [{ rotate: '-10deg' }] }} 
          />
          <View className="relative z-10">
            <Text className="text-white text-3xl font-bold mb-1 tracking-tight">Disease Detector</Text>
            <Text className="text-teal-100 text-sm font-medium leading-relaxed w-[90%]">
              Detect cinnamon diseases instantly before it hurts your plant. Select a target, capture a photo and analyze completely offline.
            </Text>
          </View>
        </View>

        <View className="mb-8">
          <Text className="text-slate-800 font-extrabold text-lg mb-4 ml-1">Step 1: Select Target</Text>
          
          <View className="flex-row justify-between">
            <TouchableOpacity
              onPress={() => handlePartSelection('leaf')}
              disabled={isLocked}
              activeOpacity={0.8}
              style={[{ width: '48%' }, selectedPart === 'leaf' && !isLocked ? premiumShadow : softShadow]}
              className={`p-4 rounded-2xl border-2 flex-col items-center justify-center transition-all ${
                isLocked 
                  ? selectedPart === 'leaf' ? 'bg-teal-50 border-teal-100' : 'bg-slate-50 border-slate-100'
                  : selectedPart === 'leaf' ? 'bg-teal-600 border-teal-500' : 'bg-white border-slate-100'
              }`}
            >
              <View className={`w-12 h-12 rounded-full items-center justify-center mb-2 ${
                isLocked
                  ? selectedPart === 'leaf' ? 'bg-teal-100/50' : 'bg-slate-200/50'
                  : selectedPart === 'leaf' ? 'bg-white/20' : 'bg-slate-50'
              }`}>
                <MaterialCommunityIcons 
                  name="leaf" 
                  size={28} 
                  color={
                    isLocked 
                      ? selectedPart === 'leaf' ? '#0D9488' : '#CBD5E1'
                      : selectedPart === 'leaf' ? '#FFFFFF' : '#94A3B8'
                  } 
                />
              </View>
              <Text className={`font-extrabold text-base ${
                isLocked 
                  ? selectedPart === 'leaf' ? 'text-teal-700' : 'text-slate-400'
                  : selectedPart === 'leaf' ? 'text-white' : 'text-slate-600'
              }`}>
                Leaf
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handlePartSelection('stem')}
              disabled={isLocked}
              activeOpacity={0.8}
              style={[{ width: '48%' }, selectedPart === 'stem' && !isLocked ? premiumShadow : softShadow]}
              className={`p-4 rounded-2xl border-2 flex-col items-center justify-center transition-all ${
                isLocked 
                  ? selectedPart === 'stem' ? 'bg-teal-50 border-teal-100' : 'bg-slate-50 border-slate-100'
                  : selectedPart === 'stem' ? 'bg-teal-600 border-teal-500' : 'bg-white border-slate-100'
              }`}
            >
              <View className={`w-12 h-12 rounded-full items-center justify-center mb-2 ${
                isLocked
                  ? selectedPart === 'stem' ? 'bg-teal-100/50' : 'bg-slate-200/50'
                  : selectedPart === 'stem' ? 'bg-white/20' : 'bg-slate-50'
              }`}>
                <MaterialCommunityIcons 
                  name="tree-outline" 
                  size={28} 
                  color={
                    isLocked 
                      ? selectedPart === 'stem' ? '#0D9488' : '#CBD5E1'
                      : selectedPart === 'stem' ? '#FFFFFF' : '#94A3B8'
                  } 
                />
              </View>
              <Text className={`font-extrabold text-base ${
                isLocked 
                  ? selectedPart === 'stem' ? 'text-teal-700' : 'text-slate-400'
                  : selectedPart === 'stem' ? 'text-white' : 'text-slate-600'
              }`}>
                Stem
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mb-2">
          <View style={{ opacity: selectedPart ? 1 : 0.4 }} pointerEvents={selectedPart ? 'auto' : 'none'}>
            <Text className="text-slate-800 font-extrabold text-lg mb-4 ml-1">Step 2: Add Specimen</Text>

            {imageUri ? (
              <View style={premiumShadow} className="w-full bg-white p-3 rounded-[24px] mb-6 border border-slate-100">
                <View className="w-full aspect-square bg-slate-100 rounded-xl overflow-hidden relative">
                  <Image source={{ uri: imageUri }} className="w-full h-full" resizeMode="cover" />

                  {!isLocked && (
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
                      <Text className="font-extrabold text-white text-lg tracking-wider">Analyzing Image...</Text>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <View className="flex-col mb-4">
                <TouchableOpacity
                  onPress={() => pickImage(true)}
                  activeOpacity={0.8}
                  style={premiumShadow}
                  className="w-full rounded-2xl flex-row items-center p-4 mb-4 bg-teal-600"
                >
                  <View className="bg-white/20 p-3 rounded-xl mr-4">
                    <MaterialCommunityIcons name="camera-iris" size={28} color="white" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-extrabold text-lg">Take Photo</Text>
                    <Text className="text-teal-100 text-xs font-medium mt-0.5">Capture a fresh specimen</Text>
                  </View>
                  <Feather name="chevron-right" size={24} color="white" opacity={0.6} />
                </TouchableOpacity>
                
                <TouchableOpacity
                  onPress={() => pickImage(false)}
                  activeOpacity={0.7}
                  style={softShadow}
                  className="w-full bg-white border border-slate-100 rounded-2xl flex-row items-center p-4"
                >
                  <View className="bg-teal-50 p-3 rounded-xl mr-4">
                    <MaterialCommunityIcons name="image-multiple" size={28} color="#0D9488" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-800 font-extrabold text-lg">Photo Gallery</Text>
                    <Text className="text-slate-400 text-xs font-medium mt-0.5">Choose an existing image</Text>
                  </View>
                  <Feather name="chevron-right" size={24} color="#CBD5E1" />
                </TouchableOpacity>
              </View>
            )}

            {imageUri && !results && (
              <TouchableOpacity
                onPress={runLocalInference}
                activeOpacity={0.8}
                style={premiumShadow}
                className="bg-emerald-500 py-4 rounded-xl flex-row justify-center items-center"
              >
                <MaterialCommunityIcons name="microscope" size={24} color="white" />
                <Text className="text-white font-extrabold ml-3 text-lg tracking-wide">
                  Analyze {selectedPart === 'leaf' ? 'Leaf' : 'Stem'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {renderResults()}

        {results && (
          <View className="mt-2">
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
              className="bg-transparent py-4 rounded-xl flex-row justify-center items-center mb-4"
            >
              <Feather name="refresh-cw" size={18} color="#64748B" />
              <Text className="text-slate-500 font-bold ml-2 text-base">Scan Another Specimen</Text>
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
            <Text className="text-2xl font-extrabold text-slate-800 mb-2 text-center">Invalid Subject</Text>
            <Text className="text-slate-500 text-center leading-relaxed mb-8 text-base font-medium">
              This image does not appear to be a plant. Please capture a clear photo of a leaf or stem.
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
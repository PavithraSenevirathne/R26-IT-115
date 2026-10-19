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
import { initializePestModel, runPestDetection, Detection } from '../../services/pestYolo';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CLASS_COLOURS: Record<string, string> = {
  caterpillar: '#F43F5E',
  stem_borer: '#8B5CF6',
  thrips: '#F59E0B',
  beetle: '#3B82F6',
  grasshopper: '#10B981'
};

const PEST_DESCRIPTIONS: Record<string, string> = {
  caterpillar: 'Chews through foliage rapidly, leaving large irregular holes in leaves and stunting plant growth.',
  stem_borer: 'Burrows deep into the stem, weakening the plant structure and severely disrupting nutrient transport.',
  thrips: 'Tiny insects that puncture plant cells and suck out contents, causing silvering, stippling, and leaf curling.',
  beetle: 'Feeds aggressively on leaves and young bark, causing physical damage and exposing the plant to secondary fungal infections.',
  grasshopper: 'Aggressive foliage feeders that can strip a plant of its leaves in large numbers if left unchecked.'
};

const premiumShadow = {
  elevation: 6,
  shadowColor: '#4C1D95',
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

export default function PestScreen() {
  const [isModelReady, setIsModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detections, setDetections] = useState<Detection[] | null>(null);
  
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();

  const triggerAnimation = () => {
    LayoutAnimation.configureNext(calmingAnimation);
  };

  useEffect(() => {
    initializePestModel()
      .then(() => setIsModelReady(true))
      .catch((err) => {
        console.log('Pest Model init log:', err);
        setModelError('Failed to load the AI engine. Please restart the app.');
      });
  }, []);

  const pickImage = async (useCamera: boolean) => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.8,
    };

    let result;
    
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera access is required to scan for pests.');
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
      setDetections(null);
    }
  };

  const analyzePest = async () => {
    if (!imageUri || !isModelReady) return;
    triggerAnimation();
    setIsAnalyzing(true);
    
    try {
      // @ts-ignore
      const manipulated = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 640, height: 640 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      const tensor = await imageToTensor(manipulated.uri, 640, true);
      const results = await runPestDetection(tensor);
      
      triggerAnimation();
      setDetections(results);
    } catch (error) {
      console.error(error);
      Alert.alert('Analysis Failed', 'Could not process the image. Please try a different photo.');
      triggerAnimation();
      setDetections(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetScanner = () => {
    if (isAnalyzing) return; 
    triggerAnimation();
    setImageUri(null);
    setDetections(null);
  };

  const handleDiscussWithAI = () => {
    if (detections === null) return;

    const newChatId = Crypto.randomUUID();
    const isHealthy = detections.length === 0;

    const uniquePests = Array.from(new Set(detections.map(d => d.className.replace('_', ' '))));
    const pestListText = uniquePests.join(', ');

    const chatTitle = isHealthy ? 'Pest Scan: Clear' : `Pest Scan: ${uniquePests[0]}`;
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

    const conditionText = isHealthy 
      ? "no visible pests" 
      : `signs of the following pests: ${pestListText}`;

    const promptText = encodeURIComponent(
      `My AI pest radar just scanned my cinnamon plant and detected ${conditionText}. What specific operational steps, organic treatments, or preventative care should I take now?`
    );

    router.push(`/chat/${newChatId}?autoPrompt=${promptText}`);
  };

  const isLocked = isAnalyzing || !isModelReady || !!modelError;

  return (
    <ScrollView 
      className="flex-1 bg-[#F8FAFC] px-5 pt-6"
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 50 }}
      showsVerticalScrollIndicator={true}
      indicatorStyle="default"
    >
      <View style={premiumShadow} className="bg-indigo-600 rounded-2xl p-6 mb-6 overflow-hidden">
        <MaterialCommunityIcons 
          name="radar" 
          size={160} 
          color="#FFFFFF" 
          style={{ position: 'absolute', right: -40, top: -20, opacity: 0.1, zIndex: 0, transform: [{ rotate: '15deg' }] }} 
        />
        
        <View className="relative z-10">
          <Text className="text-white text-3xl font-bold mb-1 tracking-tight">Pest Radar</Text>
          <Text className="text-indigo-100 text-sm font-medium leading-relaxed w-[90%]">
            Powered by YOLOv11s to detect active insect infestations instantly.
          </Text>
        </View>
      </View>

      <View className="mb-6">
        <Text className="text-slate-800 font-extrabold text-sm mb-3 ml-1 uppercase tracking-wider">Detectable Targets</Text>
        <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
          {Object.keys(CLASS_COLOURS).map((pest, index) => (
            <View 
              key={index} 
              style={softShadow}
              className="flex-row items-center bg-white px-3 py-2 rounded-xl border border-slate-100 m-1"
            >
              <View 
                className="w-2.5 h-2.5 rounded-full mr-2" 
                style={{ backgroundColor: CLASS_COLOURS[pest] }} 
              />
              <Text className="text-slate-600 text-xs font-extrabold capitalize tracking-wide">
                {pest.replace('_', ' ')}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {modelError && (
        <View className="bg-rose-50 p-4 rounded-xl border-l-4 border-rose-500 mb-6 flex-row items-center" style={softShadow}>
          <MaterialCommunityIcons name="alert-circle" size={28} color="#E11D48" />
          <Text className="text-rose-900 font-semibold ml-3 flex-1 text-sm">{modelError}</Text>
        </View>
      )}

      <View className="mb-4">
        {!imageUri ? (
          <View className="flex-col">
            <Text className="text-slate-800 font-extrabold text-lg mb-4 ml-1">Add Specimen</Text>
            
            <TouchableOpacity
              onPress={() => pickImage(true)}
              disabled={isLocked}
              activeOpacity={0.8}
              style={!isLocked && premiumShadow}
              className={`w-full rounded-2xl flex-row items-center p-4 mb-4 transition-all ${
                isLocked ? 'bg-violet-50' : 'bg-violet-600'
              }`}
            >
              {isLocked && !modelError ? (
                <View className="w-full items-center py-4"><ActivityIndicator color="#6D28D9" /></View>
              ) : (
                <>
                  <View className={`p-3 rounded-xl mr-4 ${isLocked ? 'bg-violet-100/50' : 'bg-white/20'}`}>
                    <MaterialCommunityIcons name="camera-iris" size={28} color={isLocked ? '#8B5CF6' : 'white'} />
                  </View>
                  <View className="flex-1">
                    <Text className={`font-extrabold text-lg ${isLocked ? 'text-violet-400' : 'text-white'}`}>Open Camera</Text>
                    <Text className={`text-xs font-medium mt-0.5 ${isLocked ? 'text-violet-300' : 'text-violet-100'}`}>Capture a fresh scan</Text>
                  </View>
                  <Feather name="chevron-right" size={24} color={isLocked ? '#DDD6FE' : 'white'} opacity={0.6} />
                </>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={() => pickImage(false)}
              disabled={isLocked}
              activeOpacity={0.7}
              style={!isLocked && softShadow}
              className={`w-full bg-white border rounded-2xl flex-row items-center p-4 transition-all ${
                isLocked ? 'border-slate-100 bg-slate-50' : 'border-slate-200'
              }`}
            >
              {isLocked && !modelError ? (
                <View className="w-full items-center py-4"><Text className="text-slate-400 font-bold">Warming Models...</Text></View>
              ) : (
                <>
                  <View className={`p-3 rounded-xl mr-4 ${isLocked ? 'bg-slate-100' : 'bg-violet-50'}`}>
                    <MaterialCommunityIcons name="image-multiple" size={28} color={isLocked ? '#94A3B8' : '#7C3AED'} />
                  </View>
                  <View className="flex-1">
                    <Text className={`font-extrabold text-lg ${isLocked ? 'text-slate-400' : 'text-slate-800'}`}>Photo Gallery</Text>
                    <Text className={`text-xs font-medium mt-0.5 ${isLocked ? 'text-slate-300' : 'text-slate-400'}`}>Choose an existing image</Text>
                  </View>
                  <Feather name="chevron-right" size={24} color={isLocked ? '#F1F5F9' : '#CBD5E1'} />
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text className="text-slate-800 font-extrabold text-lg mb-4 ml-1">Target Acquired</Text>
            
            <View style={premiumShadow} className="w-full bg-white p-3 rounded-[24px] mb-6 border border-slate-100">
              <View className="w-full aspect-square bg-slate-100 rounded-xl overflow-hidden relative">
                <Image source={{ uri: imageUri }} className="w-full h-full" resizeMode="cover" />
                
                {detections?.map((det, index) => {
                  const color = CLASS_COLOURS[det.className] || '#FFFFFF';
                  return (
                    <View
                      key={index}
                      className="absolute border-2 items-start justify-start overflow-visible rounded-sm"
                      style={{
                        borderColor: color,
                        backgroundColor: `${color}25`,
                        left: `${(det.x1 / 640) * 100}%`,
                        top: `${(det.y1 / 640) * 100}%`,
                        width: `${((det.x2 - det.x1) / 640) * 100}%`,
                        height: `${((det.y2 - det.y1) / 640) * 100}%`,
                      }}
                    >
                      <View className="px-2 py-1 rounded-br-lg" style={{ backgroundColor: color }}>
                        <Text className="text-white text-[10px] font-extrabold uppercase tracking-widest">
                          {det.className.replace('_', ' ')} ({Math.round(det.score * 100)}%)
                        </Text>
                      </View>
                    </View>
                  );
                })}

                {!isAnalyzing && !detections && (
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
                    <Text className="font-extrabold text-white text-lg tracking-wider">Mapping Signatures...</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {imageUri && !detections && (
          <TouchableOpacity
            onPress={analyzePest}
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
                <MaterialCommunityIcons name="radar" size={24} color="white" />
                <Text className="text-white font-extrabold ml-3 text-lg tracking-wide">Run Spatial Scan</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {detections !== null && (
        <View className="mt-2 mb-6">
          <Text className="text-slate-800 font-extrabold text-lg mb-4 ml-1">Scan Results</Text>
          
          <View style={softShadow} className="bg-white rounded-2xl p-6 mb-4 border border-slate-100">
            <View className="flex-row items-center justify-between mb-5">
              <Text className="text-2xl font-extrabold text-slate-800">
                {detections.length === 0 ? "Clear Field" : `${detections.length} Signature(s)`}
              </Text>
              <View className={`p-2 rounded-xl ${detections.length === 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                <MaterialCommunityIcons 
                  name={detections.length === 0 ? "shield-check" : "bug"} 
                  size={28} 
                  color={detections.length === 0 ? "#10B981" : "#E11D48"} 
                />
              </View>
            </View>
            
            {detections.length === 0 ? (
              <View className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                <Text className="text-emerald-800 font-medium leading-relaxed text-sm">
                  The visual field appears clear of recognized pests. If you suspect an infestation, try scanning from a different angle or under better lighting.
                </Text>
              </View>
            ) : (
              <View>
                {detections.map((det, index) => (
                  <View 
                    key={index} 
                    className={`py-4 ${index !== detections.length - 1 ? 'border-b border-slate-100' : ''}`}
                  >
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center">
                        <View 
                          className="w-3.5 h-3.5 rounded-full mr-3 shadow-sm" 
                          style={{ backgroundColor: CLASS_COLOURS[det.className] || '#3E5C41' }} 
                        />
                        <Text className="text-slate-800 font-extrabold capitalize text-lg">
                          {det.className.replace('_', ' ')}
                        </Text>
                      </View>
                      <View className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                        <Text className="text-slate-600 font-bold text-xs">{Math.round(det.score * 100)}% Match</Text>
                      </View>
                    </View>
                    <Text className="text-slate-500 text-sm leading-relaxed font-medium">
                      {PEST_DESCRIPTIONS[det.className.toLowerCase()] || 'Pest detected in the mapped area.'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

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
            disabled={isLocked}
            activeOpacity={0.7}
            className="bg-transparent py-4 rounded-xl flex-row justify-center items-center"
          >
            <Feather name="refresh-cw" size={18} color="#64748B" />
            <Text className="text-slate-500 font-bold ml-2 text-base">Scan Another Area</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}
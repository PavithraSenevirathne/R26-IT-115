import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { imageToTensor } from '../../utils/tensorHelper';
import { initializePestModel, runPestDetection, Detection } from '../../services/pestYolo';

const CLASS_COLOURS: Record<string, string> = {
  stem_borer: '#EF4444', 
  thrips: '#F59E0B', 
  moth: '#8B5CF6', 
  mite: '#EC4899',
  leaf_miner: '#10B981', 
  root_grub: '#D97706', 
  caterpillar: '#F43F5E', 
  weevil: '#3B82F6'
};

const safeShadow = {
  elevation: 2,
  shadowColor: '#2C402E',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
};

export default function PestScreen() {
  const [isModelReady, setIsModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detections, setDetections] = useState<Detection[] | null>(null);
  
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();

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
      setImageUri(result.assets[0].uri);
      setDetections(null);
    }
  };

  const analyzePest = async () => {
    if (!imageUri || !isModelReady) return;
    setIsAnalyzing(true);
    
    try {
      // @ts-ignore
      const manipulated = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 640, height: 640 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      const tensor = await imageToTensor(manipulated.uri, 640);
      const results = await runPestDetection(tensor);
      setDetections(results);
    } catch (error) {
      console.error(error);
      Alert.alert('Analysis Failed', 'Could not process the image. Please try a different photo.');
      setDetections(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetScanner = () => {
    if (isAnalyzing) return; 
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
      className="flex-1 bg-[#F0F4F1] px-6 pt-6"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-center self-start bg-[#E4ECE1] px-3 py-1.5 rounded-full mb-6 border border-[#CBDBC7]">
        <MaterialCommunityIcons name="magnify-scan" size={14} color="#3E5C41" />
        <Text className="text-[#3E5C41] text-[10px] font-bold ml-1.5 uppercase tracking-widest">YOLOv8 Vision</Text>
      </View>

      <Text className="text-3xl font-extrabold text-[#1F3021] mb-2 tracking-tight">Pest Radar</Text>
      <Text className="mb-6 text-sm text-[#768C73] leading-relaxed">
        Identify insects and infestations using spatial AI. Capture a clear, close-up photo of the affected area.
      </Text>

      <View className="mb-8">
        <Text className="text-xs font-bold text-[#768C73] uppercase tracking-widest mb-3">Detectable Targets</Text>
        <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
          {Object.keys(CLASS_COLOURS).map((pest, index) => (
            <View 
              key={index} 
              style={safeShadow}
              className="flex-row items-center bg-white px-3 py-1.5 rounded-full border border-[#E8E6DD] m-1"
            >
              <View 
                className="w-2.5 h-2.5 rounded-full mr-2" 
                style={{ backgroundColor: CLASS_COLOURS[pest] }} 
              />
              <Text className="text-[#4F6851] text-[11px] font-bold capitalize tracking-wide">
                {pest.replace('_', ' ')}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {modelError && (
        <View className="bg-[#FFF4F4] p-4 rounded-2xl border border-[#FDE8E8] mb-6 flex-row items-center">
          <MaterialCommunityIcons name="alert-circle-outline" size={24} color="#E11D48" />
          <Text className="text-[#881337] font-semibold ml-3 flex-1">{modelError}</Text>
        </View>
      )}

      <View className="mb-8">
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
                <Text className="text-[#768C73] font-bold text-xs mt-3">Initializing AI...</Text>
              ) : (
                <>
                  <MaterialCommunityIcons name="image-multiple-outline" size={32} color="#768C73" />
                  <Text className="text-[#4F6851] font-bold mt-3 text-sm">Gallery</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={safeShadow} className="w-full aspect-[4/5] bg-[#E8E6DD] rounded-[32px] overflow-hidden border-2 border-white relative mb-6">
            <Image source={{ uri: imageUri }} className="w-full h-full" resizeMode="cover" />
            
            {detections?.map((det, index) => {
              const color = CLASS_COLOURS[det.className] || '#FFFFFF';
              return (
                <View
                  key={index}
                  className="absolute border-2 items-start justify-start overflow-visible"
                  style={{
                    borderColor: color,
                    backgroundColor: `${color}20`,
                    left: `${(det.x1 / 640) * 100}%`,
                    top: `${(det.y1 / 640) * 100}%`,
                    width: `${((det.x2 - det.x1) / 640) * 100}%`,
                    height: `${((det.y2 - det.y1) / 640) * 100}%`,
                  }}
                >
                  <View className="px-1.5 py-0.5 rounded-br-md" style={{ backgroundColor: color }}>
                    <Text className="text-white text-[10px] font-bold uppercase tracking-wider">
                      {det.className.replace('_', ' ')} ({Math.round(det.score * 100)}%)
                    </Text>
                  </View>
                </View>
              );
            })}

            {!isAnalyzing && !detections && (
              <TouchableOpacity
                onPress={resetScanner}
                style={safeShadow}
                className="absolute top-5 right-5 w-9 h-9 bg-white/95 rounded-full items-center justify-center"
              >
                <Feather name="x" size={16} color="#1F3021" strokeWidth={2.5} />
              </TouchableOpacity>
            )}

            {isAnalyzing && (
              <View className="absolute inset-0 bg-[#1F3021]/60 items-center justify-center">
                <ActivityIndicator size="large" color="white" />
                <Text className="mt-4 font-bold text-white text-base tracking-wide">Mapping Detections...</Text>
              </View>
            )}
          </View>
        )}

        {imageUri && !detections && (
          <TouchableOpacity
            onPress={analyzePest}
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
                <MaterialCommunityIcons name="radar" size={22} color="white" />
                <Text className="text-white font-bold ml-2 text-base tracking-wide">Scan for Pests</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {detections !== null && (
        <View style={safeShadow} className="bg-white rounded-3xl p-6 mb-8 border border-[#E8E6DD]">
          <View className="flex-row items-center justify-between mb-5">
            <Text className="text-lg font-extrabold text-[#1F3021]">
              {detections.length === 0 ? "No Pests Detected" : `${detections.length} Signature(s) Found`}
            </Text>
            <MaterialCommunityIcons 
              name={detections.length === 0 ? "shield-check-outline" : "bug-outline"} 
              size={24} 
              color={detections.length === 0 ? "#10B981" : "#E11D48"} 
            />
          </View>
          
          {detections.length === 0 ? (
            <View className="bg-[#EBF3E8] p-4 rounded-2xl border border-[#CBDBC7]">
              <Text className="text-[#4F6851] leading-relaxed text-sm">
                The visual field appears clear of recognized pests. If you suspect an infestation, try scanning from a different angle or under better lighting.
              </Text>
            </View>
          ) : (
            <View>
              {detections.map((det, index) => (
                <View 
                  key={index} 
                  className={`flex-row items-center justify-between py-3.5 ${index !== detections.length - 1 ? 'border-b border-[#F0F4F1]' : ''}`}
                >
                  <View className="flex-row items-center">
                    <View 
                      className="w-3.5 h-3.5 rounded-full mr-3 shadow-sm" 
                      style={{ backgroundColor: CLASS_COLOURS[det.className] || '#3E5C41' }} 
                    />
                    <Text className="text-[#1F3021] font-bold capitalize text-base">
                      {det.className.replace('_', ' ')}
                    </Text>
                  </View>
                  <View className="bg-[#F5F3E9] px-3 py-1 rounded-full border border-[#E8E6DD]">
                    <Text className="text-[#4F6851] font-bold text-xs">{Math.round(det.score * 100)}% Match</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {detections !== null && (
        <View className="mb-8">
          <TouchableOpacity
            onPress={handleDiscussWithAI}
            activeOpacity={0.8}
            style={safeShadow}
            className="bg-[#2D4530] border border-[#3E5C41] py-4 rounded-2xl flex-row justify-center items-center mb-3"
          >
            <MaterialCommunityIcons name="robot-outline" size={20} color="white" />
            <Text className="text-white font-bold ml-2 text-base">Discuss with AI Advisor</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={resetScanner}
            disabled={isLocked}
            activeOpacity={0.7}
            className="bg-white border border-[#E8E6DD] py-4 rounded-2xl flex-row justify-center items-center shadow-sm"
          >
            <Feather name="refresh-cw" size={18} color="#768C73" />
            <Text className="text-[#4F6851] font-bold ml-2 text-base">Scan Another Area</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}
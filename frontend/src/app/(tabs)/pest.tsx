import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import PrimaryButton from '../../components/PrimaryButton';

type PestClass = 
  | 'stem_borer' | 'thrips' | 'moth' | 'mite' 
  | 'leaf_miner' | 'root_grub' | 'caterpillar' | 'weevil';

interface Detection {
  id: string;
  class: PestClass;
  confidence: number;
  box: { xMin: number; yMin: number; width: number; height: number };
}

const PEST_DB: Record<PestClass, { name: string; color: string; desc: string; treatment: string }> = {
  stem_borer: { name: 'Stem Borer', color: '#EF4444', desc: 'Bores into stems and bark, causing severe structural damage and yield loss.', treatment: 'Prune and burn affected stems. Deploy pheromone traps.' },
  thrips: { name: 'Thrips', color: '#F97316', desc: 'Tiny insects on leaves causing silvering, stippling, and leaf curling.', treatment: 'Apply neem oil or insecticidal soap. Introduce predatory mites.' },
  moth: { name: 'Moth Larvae', color: '#EAB308', desc: 'Larvae feed on new foliage, hindering plant growth.', treatment: 'Manual removal for small infestations. Apply Bacillus thuringiensis (Bt).' },
  mite: { name: 'Spider Mites', color: '#EC4899', desc: 'Sapsuckers causing yellow stippling and fine webbing on leaves.', treatment: 'Increase ambient humidity. Use horticultural oils or miticides.' },
  leaf_miner: { name: 'Leaf Miner', color: '#A855F7', desc: 'Larvae tunnel through leaves, leaving visible white trails.', treatment: 'Remove and destroy affected leaves. Apply Spinosad-based sprays.' },
  root_grub: { name: 'Root Grub', color: '#8B5CF6', desc: 'Soil-dwelling grubs that feed on roots, causing wilting and yellowing.', treatment: 'Apply beneficial nematodes to soil. Use soil drenches if severe.' },
  caterpillar: { name: 'Caterpillar', color: '#84CC16', desc: 'Chewing insects that aggressively consume leaves and tender stems.', treatment: 'Handpick visible pests. Apply Bt spray for widespread issues.' },
  weevil: { name: 'Weevil', color: '#14B8A6', desc: 'Beetles that chew distinct notches along the edges of cinnamon leaves.', treatment: 'Dust diatomaceous earth around the base. Use pyrethrin sprays.' }
};

const BACKEND_URL = 'http://192.168.52.41:8000/api/v1/predict/pest';

export default function PestScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasRunInference, setHasRunInference] = useState(false);
  
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedPest, setSelectedPest] = useState<Detection | null>(null);

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
      setDetections([]);
      setSelectedPest(null);
      setHasRunInference(false);
    }
  };

  const runYoloInference = async () => {
    if (!imageUri) return;
    setIsAnalyzing(true);
    setSelectedPest(null);

    try {
      const filename = imageUri.split('/').pop() || 'pest_sample.jpg';

      const localFileResponse = await fetch(imageUri);
      const blob = await localFileResponse.blob();

      const formData = new FormData();
      formData.append('file', blob, filename);

      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Server returned status: ${response.status}`);
      }

      const data = await response.json();
      
      const mappedDetections: Detection[] = data.detections.map((d: any) => ({
        id: d.id,
        class: d.pest_class as PestClass,
        confidence: d.confidence,
        box: {
          xMin: d.box.xMin,
          yMin: d.box.yMin,
          width: d.box.width,
          height: d.box.height,
        },
      }));

      setDetections(mappedDetections);
    } catch (error) {
      console.error("YOLO Inference Error:", error);
      Alert.alert(
        "Connection Failed",
        "Could not reach the AI server. Ensure your computer and phone are on the same Wi-Fi and the IP address is correct."
      );
    } finally {
      setIsAnalyzing(false);
      setHasRunInference(true);
    }
  };

  return (
    <ScrollView className="flex-1 bg-[#F5F3E9] px-6 pt-6" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      
      <Animated.View entering={FadeInDown.delay(100).springify()}>
        <Text className="mb-4 text-base font-medium text-[#8A9A86] leading-relaxed">
          Detect 8 species of cinnamon pests instantly. Upload a photo of affected foliage or bark to scan for active infestations.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).springify()} className="mb-6">
        {imageUri ? (
          <View className="w-full aspect-square bg-[#E2F4C5] rounded-[32px] overflow-hidden border-2 border-[#E8E6DD] relative shadow-sm">
            <Image source={{ uri: imageUri }} className="w-full h-full" resizeMode="contain" />
            
            {/* Draw Bounding Boxes */}
            {!isAnalyzing && detections.map((det) => {
              const pestData = PEST_DB[det.class];
              const isSelected = selectedPest?.id === det.id;
              
              return (
                <TouchableOpacity
                  key={det.id}
                  activeOpacity={0.8}
                  onPress={() => setSelectedPest(det)}
                  style={{
                    position: 'absolute',
                    left: `${det.box.xMin * 100}%`,
                    top: `${det.box.yMin * 100}%`,
                    width: `${det.box.width * 100}%`,
                    height: `${det.box.height * 100}%`,
                    borderWidth: isSelected ? 3 : 2,
                    borderColor: pestData.color,
                    backgroundColor: isSelected ? `${pestData.color}33` : 'transparent',
                  }}
                >
                  <View 
                    style={{ backgroundColor: pestData.color }} 
                    className="absolute -top-6 left-[-2px] px-2 py-1 rounded-t-md flex-row items-center whitespace-nowrap"
                  >
                    <Text className="text-white text-[10px] font-extrabold tracking-wider uppercase mr-1">
                      {pestData.name}
                    </Text>
                    <Text className="text-white/90 text-[10px] font-bold">
                      {Math.round(det.confidence * 100)}%
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {isAnalyzing && (
              <Animated.View entering={FadeIn} className="absolute inset-0 bg-white/70 items-center justify-center backdrop-blur-md">
                <ActivityIndicator size="large" color="#EA580C" />
                <Text className="mt-4 font-bold text-[#2C402E] text-lg">YOLOv8 Scanning...</Text>
                <Text className="text-sm font-medium text-[#8A9A86] mt-1">Applying confidence threshold (≥35%)</Text>
              </Animated.View>
            )}
          </View>
        ) : (
          <View className="w-full aspect-square bg-white rounded-[32px] border-2 border-dashed border-[#B0BDB0] items-center justify-center shadow-sm">
            <View className="w-20 h-20 rounded-full bg-[#FFF7ED] items-center justify-center mb-4">
              <Feather name="target" size={32} color="#EA580C" />
            </View>
            <Text className="text-xl font-extrabold text-[#2C402E] mb-2">Pest Radar</Text>
            <Text className="text-sm font-medium text-[#8A9A86] text-center px-8">
              Take a square photo of the plant surface to analyze for pests.
            </Text>
          </View>
        )}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).springify()} className="mb-8">
        {!imageUri ? (
          <View className="flex-row gap-4">
            <TouchableOpacity onPress={() => pickImage(true)} className="flex-1 bg-[#EA580C] py-4 rounded-2xl flex-row justify-center items-center shadow-sm">
              <Feather name="camera" size={20} color="white" />
              <Text className="text-white font-bold ml-2">Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => pickImage(false)} className="flex-1 bg-white border border-[#E8E6DD] py-4 rounded-2xl flex-row justify-center items-center shadow-sm">
              <Feather name="image" size={20} color="#EA580C" />
              <Text className="text-[#EA580C] font-bold ml-2">Gallery</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="flex-row gap-4">
            <TouchableOpacity onPress={() => pickImage(false)} className="flex-1 bg-white border border-[#E8E6DD] py-4 rounded-2xl flex-row justify-center items-center shadow-sm">
              <Feather name="refresh-ccw" size={18} color="#8A9A86" />
              <Text className="text-[#4A6B4D] font-bold ml-2">Retake</Text>
            </TouchableOpacity>
            {!hasRunInference && (
              <TouchableOpacity onPress={runYoloInference} className="flex-[2] bg-[#EA580C] py-4 rounded-2xl flex-row justify-center items-center shadow-sm">
                <Feather name="cpu" size={20} color="white" />
                <Text className="text-white font-bold ml-2">Run Inference</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Animated.View>

      {hasRunInference && !isAnalyzing && (
        <Animated.View entering={FadeInDown.springify()} className="bg-white rounded-[32px] border border-[#E8E6DD] p-6 shadow-sm mb-6">
          <Text className="text-xl font-extrabold text-[#2C402E] mb-4">Detection Summary</Text>
          
          {detections.length === 0 ? (
            <View className="bg-[#E2F4C5] p-5 rounded-2xl flex-row items-center border border-[#D2E3C8]">
              <Feather name="check-circle" size={24} color="#597E52" />
              <View className="ml-3 flex-1">
                <Text className="font-bold text-[#2D4A22] text-base">No pests detected!</Text>
                <Text className="text-sm text-[#4A6B4D] mt-1">
                  The model found no high-confidence threats (≥35%) in this frame.
                </Text>
              </View>
            </View>
          ) : (
            <View>
              <Text className="text-sm font-bold text-[#8A9A86] mb-3 uppercase tracking-wider">
                Found {detections.length} Signature{detections.length > 1 ? 's' : ''}
              </Text>
              {detections.map((det) => {
                const pestData = PEST_DB[det.class];
                const isSelected = selectedPest?.id === det.id;

                return (
                  <TouchableOpacity 
                    key={`summary-${det.id}`}
                    onPress={() => setSelectedPest(det)}
                    className={`flex-row items-center justify-between p-3 rounded-xl mb-2 border ${
                      isSelected ? 'bg-[#F5F3E9] border-[#D5D3C8]' : 'bg-white border-[#E8E6DD]'
                    }`}
                  >
                    <View className="flex-row items-center">
                      <View style={{ backgroundColor: pestData.color }} className="w-3 h-3 rounded-full mr-3" />
                      <Text className="font-bold text-[#2C402E]">{pestData.name}</Text>
                    </View>
                    <Text className="font-bold text-[#8A9A86]">{Math.round(det.confidence * 100)}%</Text>
                  </TouchableOpacity>
                );
              })}
              <Text className="text-xs text-center font-medium text-[#B0BDB0] mt-2 italic">
                Tap a bounding box or list item for treatment details.
              </Text>
            </View>
          )}
        </Animated.View>
      )}

      {selectedPest && (
        <Animated.View entering={FadeInDown.springify()} className="bg-[#FFF7ED] rounded-[32px] border border-[#FED7AA] p-6 shadow-sm mb-6">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <View style={{ backgroundColor: PEST_DB[selectedPest.class].color }} className="p-2 rounded-xl mr-3">
                <Feather name="alert-triangle" size={18} color="white" />
              </View>
              <Text className="text-xl font-extrabold text-[#9A3412]">
                {PEST_DB[selectedPest.class].name}
              </Text>
            </View>
            <Text className="text-[#EA580C] font-bold">
              {Math.round(selectedPest.confidence * 100)}% Match
            </Text>
          </View>
          
          <Text className="text-base text-[#7C2D12] font-medium mb-5 leading-relaxed">
            {PEST_DB[selectedPest.class].desc}
          </Text>

          <View className="bg-white rounded-2xl p-4 border border-[#FED7AA]/50">
            <Text className="text-sm font-bold text-[#EA580C] mb-2 uppercase tracking-wider">Recommended Action</Text>
            <Text className="text-[#9A3412] leading-relaxed">
              {PEST_DB[selectedPest.class].treatment}
            </Text>
          </View>
        </Animated.View>
      )}

    </ScrollView>
  );
}
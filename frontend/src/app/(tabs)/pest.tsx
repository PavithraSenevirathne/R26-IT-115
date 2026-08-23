import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { imageToTensor } from '../../utils/tensorHelper';
import { initializePestModel, runPestDetection, Detection } from '../../services/pestYolo';

const CLASS_COLOURS: Record<string, string> = {
  stem_borer: '#FF4444', thrips: '#FF9900', moth: '#9B59B6', mite: '#FF69B4',
  leaf_miner: '#27AE60', root_grub: '#8B4513', caterpillar: '#E74C3C', weevil: '#2980B9'
};

export default function PestScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detections, setDetections] = useState<Detection[] | null>(null);

  useEffect(() => {
    initializePestModel();
  }, []);

  const analyzePest = async () => {
    if (!imageUri) return;
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
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-[#F5F3E9] p-6 pt-16">
      <Text className="text-2xl font-bold text-[#2C402E] mb-6">Pest Detection</Text>
      

      {imageUri && (
        <View className="relative w-full h-72 rounded-[32px] overflow-hidden bg-black mb-6">
          <Image source={{ uri: imageUri }} className="w-full h-full" resizeMode="contain" />
          
          {detections?.map((det, index) => (
            <View
              key={index}
              className="absolute border-2 items-start"
              style={{
                borderColor: CLASS_COLOURS[det.className],
                left: `${(det.x1 / 640) * 100}%`,
                top: `${(det.y1 / 640) * 100}%`,
                width: `${((det.x2 - det.x1) / 640) * 100}%`,
                height: `${((det.y2 - det.y1) / 640) * 100}%`,
              }}
            >
              <Text className="text-white text-[10px] font-bold px-1" style={{ backgroundColor: CLASS_COLOURS[det.className] }}>
                {det.className} ({Math.round(det.score * 100)}%)
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
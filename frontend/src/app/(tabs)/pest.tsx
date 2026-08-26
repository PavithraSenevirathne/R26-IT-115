import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
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

  const pickImage = async () => {
    let pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.8,
    });

    if (!pickerResult.canceled) {
      setImageUri(pickerResult.assets[0].uri);
      setDetections(null);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera access is needed to take a photo of the plant.');
      return;
    }

    let cameraResult = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.8,
    });

    if (!cameraResult.canceled) {
      setImageUri(cameraResult.assets[0].uri);
      setDetections(null);
    }
  };

  const selectImageSource = () => {
    Alert.alert(
      "Upload Plant Photo",
      "Choose an image source",
      [
        { text: "Take Photo", onPress: takePhoto },
        { text: "Choose from Gallery", onPress: pickImage },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

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
      
      {!imageUri ? (
        <TouchableOpacity 
          onPress={selectImageSource}
          className="w-full h-72 bg-white rounded-[32px] border-2 border-dashed border-[#A0A9A0] items-center justify-center mb-6"
        >
          <Text className="text-[#59735B] font-medium mt-4">Tap to upload plant photo</Text>
        </TouchableOpacity>
      ) : (
        <View className="relative w-full h-72 rounded-[32px] overflow-hidden bg-black mb-6">
          <Image source={{ uri: imageUri }} className="w-full h-full" resizeMode="contain" />
          
          {detections?.map((det, index) => (
            <View
              key={index}
              className="absolute border-2 items-start"
              style={{
                borderColor: CLASS_COLOURS[det.className] || '#FFFFFF',
                left: `${(det.x1 / 640) * 100}%`,
                top: `${(det.y1 / 640) * 100}%`,
                width: `${((det.x2 - det.x1) / 640) * 100}%`,
                height: `${((det.y2 - det.y1) / 640) * 100}%`,
              }}
            >
              <Text className="text-white text-[10px] font-bold px-1" style={{ backgroundColor: CLASS_COLOURS[det.className] || '#000000' }}>
                {det.className} ({Math.round(det.score * 100)}%)
              </Text>
            </View>
          ))}
        </View>
      )}

      <View className="flex-row gap-4 mb-6">
        <TouchableOpacity 
          onPress={selectImageSource} 
          className="flex-1 bg-white border border-[#DCE4DC] py-4 rounded-2xl items-center"
        >
          <Text className="text-[#2C402E] font-semibold">Choose Photo</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={analyzePest} 
          disabled={!imageUri || isAnalyzing}
          className={`flex-1 py-4 rounded-2xl items-center ${!imageUri || isAnalyzing ? 'bg-[#A0A9A0]' : 'bg-[#2C402E]'}`}
        >
          {isAnalyzing ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold">Scan for Pests</Text>
          )}
        </TouchableOpacity>
      </View>

      {detections !== null && (
        <View className="bg-white rounded-3xl p-6 mb-10 shadow-sm border border-[#DCE4DC]">
          <Text className="text-lg font-bold text-[#2C402E] mb-4">
            {detections.length === 0 ? "No pests detected" : `${detections.length} pest(s) found`}
          </Text>
          
          {detections.length === 0 ? (
            <Text className="text-[#59735B]">The plant appears healthy. Ensure good lighting and get close to the leaves for the best scan.</Text>
          ) : (
            detections.map((det, index) => (
              <View key={index} className="flex-row items-center justify-between py-3 border-b border-[#F5F3E9]">
                <View className="flex-row items-center gap-3">
                  <View className="w-3 h-3 rounded-full" style={{ backgroundColor: CLASS_COLOURS[det.className] || '#000' }} />
                  <Text className="text-[#2C402E] font-medium capitalize">{det.className.replace('_', ' ')}</Text>
                </View>
                <Text className="text-[#59735B] font-semibold">{Math.round(det.score * 100)}% Match</Text>
              </View>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}
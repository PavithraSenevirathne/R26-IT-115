import React from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DiseaseScreen() {
  const insets = useSafeAreaInsets();
  
  return (
    <View className="flex-1 bg-slate-50 p-6 justify-center items-center" style={{ paddingTop: insets.top }}>
      <Text className="text-2xl font-extrabold text-emerald-800">Disease Diagnostics</Text>
      <Text className="text-slate-500 mt-2">Team member will add UI here!</Text>
    </View>
  );
}
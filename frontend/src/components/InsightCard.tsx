import React from 'react';
import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function InsightCard({ title, value, icon, colorClass, textClass }: any) {
  return (
    <View className="flex-1 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm mx-1">
      <View className={`w-8 h-8 rounded-full items-center justify-center mb-3 ${colorClass}`}>
        <Feather name={icon} size={16} color="white" />
      </View>
      <Text className="text-slate-500 text-xs font-medium mb-1">{title}</Text>
      <Text className={`text-lg font-bold ${textClass}`}>{value}</Text>
    </View>
  );
}
import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { router, useFocusEffect } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface PlantChat {
  id: string;
  name: string;
  color: string;
}

export default function FertilizerTab() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [chats, setChats] = useState<PlantChat[]>([]);

  useFocusEffect(
    useCallback(() => {
      const data = db.getAllSync<PlantChat>('SELECT id, name, color FROM plants ORDER BY created_at DESC');
      setChats(data);
    }, [db])
  );

  return (
    <View className="flex-1 bg-[#F5F3E9]" style={{ paddingTop: insets.top + 20 }}>
      <View className="px-6 mb-6 flex-row justify-between items-center">
        <View>
          <Text className="text-3xl font-extrabold text-[#2C402E]">Agronomy AI</Text>
          <Text className="text-sm font-semibold text-[#8A9A86] mt-1">Your localized field assistants</Text>
        </View>
        <TouchableOpacity 
          onPress={() => router.push('/new-chat' as any)}
          className="w-12 h-12 bg-[#4A6B4D] rounded-full items-center justify-center shadow-sm"
        >
          <Feather name="plus" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
        {chats.length === 0 ? (
          <View className="items-center justify-center py-20">
            <Feather name="message-square" size={48} color="#D5D3C8" />
            <Text className="text-[#8A9A86] font-bold mt-4 text-center">No active chats.</Text>
            <Text className="text-[#8A9A86] text-center mt-1">Create a new chat for a plot to get started.</Text>
          </View>
        ) : (
          chats.map((chat, index) => (
            <Animated.View key={chat.id} entering={FadeInDown.delay(index * 100).springify()}>
              <TouchableOpacity 
                onPress={() => router.push(`/chat/${chat.id}` as any)}
                className="bg-white p-4 rounded-2xl mb-4 flex-row items-center border border-[#E8E6DD] shadow-sm"
              >
                <View className="w-12 h-12 rounded-full items-center justify-center mr-4" style={{ backgroundColor: chat.color }}>
                  <Feather name="cpu" size={20} color="#FFFFFF" />
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-bold text-[#2C402E]">{chat.name}</Text>
                  <Text className="text-[#8A9A86] text-sm mt-0.5">Tap to open diagnostic chat</Text>
                </View>
                <Feather name="chevron-right" size={20} color="#B0BDB0" />
              </TouchableOpacity>
            </Animated.View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
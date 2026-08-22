import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
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

  const loadChats = useCallback(() => {
    const data = db.getAllSync<PlantChat>(
      'SELECT id, name, color FROM plants ORDER BY created_at DESC'
    );
    setChats(data);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      loadChats();
    }, [loadChats])
  );

  const handleDeleteChat = (chatId: string, chatName: string) => {
    Alert.alert(
      'Delete Plot Chat',
      `Delete "${chatName}" and all saved messages?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            db.runSync('DELETE FROM messages WHERE session_id = ?', [chatId]);
            db.runSync('DELETE FROM plants WHERE id = ?', [chatId]);
            loadChats();
          },
        },
      ]
    );
  };

  return (
    <View className="flex-1 bg-[#F5F3E9]" style={{ paddingTop: insets.top + 16 }}>
      <View className="px-6 mb-6 flex-row justify-between items-center">
        <View>
          <Text className="text-3xl font-extrabold text-[#2C402E]">Agronomy AI</Text>
          <Text className="text-sm font-semibold text-[#8A9A86] mt-1">Plot-specific AI chat sessions</Text>
        </View>
        <TouchableOpacity 
          onPress={() => router.push('/new-chat')}
          className="w-12 h-12 bg-[#4A6B4D] rounded-2xl items-center justify-center shadow-sm"
        >
          <Feather name="plus" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
        {chats.length === 0 ? (
          <View className="items-center justify-center py-20">
            <Feather name="message-square" size={48} color="#D5D3C8" />
            <Text className="text-[#8A9A86] font-bold mt-4 text-center">No active plot chats.</Text>
            <Text className="text-[#8A9A86] text-center mt-1 text-sm">
              Tap the + button to create a plot profile.
            </Text>
          </View>
        ) : (
          chats.map((chat, index) => (
            <Animated.View key={chat.id} entering={FadeInDown.delay(index * 60).springify()}>
              <View className="bg-white p-4 rounded-2xl mb-3.5 flex-row items-center border border-[#E8E6DD] shadow-sm">
                <TouchableOpacity 
                  onPress={() => router.push(`/chat/${chat.id}`)}
                  className="flex-row items-center flex-1"
                >
                  <View 
                    className="w-11 h-11 rounded-xl items-center justify-center mr-3.5" 
                    style={{ backgroundColor: chat.color }}
                  >
                    <Feather name="cpu" size={20} color="#FFFFFF" />
                  </View>
                  <View className="flex-1 mr-2">
                    <Text className="text-base font-bold text-[#2C402E]" numberOfLines={1}>{chat.name}</Text>
                    <Text className="text-[#8A9A86] text-xs mt-0.5">Tap to view diagnostic chat</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity 
                  onPress={() => handleDeleteChat(chat.id, chat.name)}
                  className="p-2 rounded-lg bg-[#F5F3E9] ml-1"
                >
                  <Feather name="trash" size={16} color="#A8A29E" />
                </TouchableOpacity>
              </View>
            </Animated.View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
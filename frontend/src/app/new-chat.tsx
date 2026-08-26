import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { router, Stack } from 'expo-router';
import * as Crypto from 'expo-crypto';
import PrimaryButton from '../components/PrimaryButton';

const COLORS = ['#4A6B4D', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6'];

export default function NewChatScreen() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);

  const handleCreate = () => {
    if (!name.trim()) return;
    
    const newId = Crypto.randomUUID();
    db.runSync('INSERT INTO plants (id, name, color) VALUES (?, ?, ?)', [newId, name.trim(), selectedColor]);
    
    router.replace(`/chat/${newId}` as any);
  };

  return (
    <View className="flex-1 bg-[#F0F4F1]" style={{ paddingTop: insets.top }}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <View className="flex-row items-center px-6 pt-4 pb-6">
          <TouchableOpacity onPress={() => router.back()} className="w-12 h-12 bg-white rounded-2xl items-center justify-center border border-[#E8E6DD] shadow-sm">
            <Feather name="arrow-left" size={20} color="#2C402E" />
          </TouchableOpacity>
          <Text className="text-xl font-extrabold text-[#2C402E] ml-4">New Plot Chat</Text>
        </View>

        <View className="px-6 flex-1">
          <View className="mb-8">
            <Text className="text-sm font-bold text-[#4A6B4D] mb-2">Plot or Plant Name</Text>
            <View className="flex-row items-center rounded-2xl border border-[#E8E6DD] bg-white px-4 h-14 shadow-sm">
              <TextInput 
                className="flex-1 text-base text-[#2C402E] font-semibold"
                placeholder="e.g., Eastern Hill 2-Year"
                placeholderTextColor="#B0BDB0"
                value={name}
                onChangeText={setName}
                autoFocus
              />
            </View>
          </View>

          <View className="mb-10">
            <Text className="text-sm font-bold text-[#4A6B4D] mb-3">Color Code</Text>
            <View className="flex-row justify-between">
              {COLORS.map((color) => (
                <TouchableOpacity 
                  key={color} 
                  onPress={() => setSelectedColor(color)}
                  className="w-12 h-12 rounded-full items-center justify-center shadow-sm"
                  style={{ backgroundColor: color, borderWidth: selectedColor === color ? 3 : 0, borderColor: '#2C402E' }}
                >
                  {selectedColor === color && <Feather name="check" size={20} color="#FFFFFF" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <PrimaryButton 
            label="Start Chat" 
            colorClass={name.trim() ? "bg-[#4A6B4D]" : "bg-[#8A9A86]"} 
            iconName="message-circle"
            onPress={handleCreate} 
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
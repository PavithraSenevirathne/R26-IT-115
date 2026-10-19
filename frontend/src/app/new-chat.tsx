import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  ScrollView
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { router, Stack } from 'expo-router';
import * as Crypto from 'expo-crypto';

const COLORS = ['#10B981', '#0EA5E9', '#F59E0B', '#8B5CF6', '#F43F5E', '#14B8A6'];

const premiumShadow = {
  elevation: 6,
  shadowColor: '#047857',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.15,
  shadowRadius: 12,
};

const softShadow = {
  elevation: 2,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 4,
};

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

  const isFormValid = name.trim().length > 0;

  return (
    <View className="flex-1 bg-[#F8FAFC]" style={{ paddingTop: insets.top }}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        className="flex-1"
      >
        <View className="flex-row items-center px-5 pt-4 pb-6">
          <TouchableOpacity 
            onPress={() => router.back()} 
            style={softShadow}
            className="w-12 h-12 bg-white rounded-2xl items-center justify-center border border-slate-100"
          >
            <Feather name="arrow-left" size={20} color="#1E293B" />
          </TouchableOpacity>
          <Text className="text-2xl font-extrabold text-slate-800 ml-4">New Plot</Text>
        </View>

        <ScrollView 
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={softShadow} className="bg-white rounded-3xl p-6 mb-8 border border-slate-100">
            
            <View className="flex-row items-center mb-6">
              <View className="bg-emerald-50 w-12 h-12 rounded-xl items-center justify-center mr-4">
                <MaterialCommunityIcons name="sprout" size={24} color="#10B981" />
              </View>
              <View>
                <Text className="text-lg font-extrabold text-slate-800">Plot Details</Text>
                <Text className="text-slate-500 text-xs font-medium mt-0.5">Configure your advisory session</Text>
              </View>
            </View>

            <View className="mb-8">
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 ml-1">
                Plot Designation
              </Text>
              <View className="flex-row items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 h-16 transition-colors focus:border-emerald-500 focus:bg-white">
                <TextInput 
                  className="flex-1 text-base text-slate-800 font-extrabold h-full"
                  placeholder="e.g., Eastern Hill 2-Year"
                  placeholderTextColor="#94A3B8"
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  selectionColor="#10B981"
                />
                {name.trim().length > 0 && (
                  <Feather name="check-circle" size={20} color="#10B981" />
                )}
              </View>
            </View>

            <View className="mb-2">
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 ml-1">
                Visual Identifier
              </Text>
              <View className="flex-row justify-between bg-slate-50 p-2 rounded-2xl border border-slate-100">
                {COLORS.map((color) => {
                  const isSelected = selectedColor === color;
                  return (
                    <TouchableOpacity 
                      key={color} 
                      onPress={() => setSelectedColor(color)}
                      activeOpacity={0.8}
                      className="w-12 h-12 rounded-xl items-center justify-center relative"
                      style={{ backgroundColor: color }}
                    >
                      {isSelected && (
                        <View className="absolute inset-0 border-4 border-white rounded-xl items-center justify-center">
                          <Feather name="check" size={18} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          <TouchableOpacity 
            onPress={handleCreate}
            disabled={!isFormValid}
            activeOpacity={0.8}
            style={isFormValid && premiumShadow}
            className={`w-full py-4 rounded-2xl flex-row justify-center items-center transition-colors mb-10 ${
              isFormValid ? 'bg-emerald-500 border border-emerald-400' : 'bg-slate-200 border border-slate-200'
            }`}
          >
            <MaterialCommunityIcons name="robot-outline" size={24} color={isFormValid ? 'white' : '#94A3B8'} />
            <Text className={`font-extrabold ml-3 text-lg ${isFormValid ? 'text-white' : 'text-slate-400'}`}>
              Initialize CinnLLM
            </Text>
          </TouchableOpacity>
          
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
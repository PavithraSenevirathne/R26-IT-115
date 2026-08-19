import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/authContext';
import PrimaryButton from '../components/PrimaryButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');

  return (
    <View className="flex-1 bg-[#F5F3E9]" style={{ paddingTop: insets.top }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        
        <View className="flex-row items-center px-6 pt-4 pb-6">
          <TouchableOpacity 
            onPress={() => router.back()}
            className="w-12 h-12 bg-white rounded-2xl items-center justify-center border border-[#E8E6DD] shadow-sm"
          >
            <Feather name="arrow-left" size={20} color="#2C402E" />
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <Text className="text-3xl font-extrabold text-[#2C402E] mb-2">Welcome Back</Text>
            <Text className="text-base font-semibold text-[#8A9A86] mb-10">Enter your details to access your offline workspace.</Text>

            <View className="mb-6">
              <Text className="text-sm font-bold text-[#4A6B4D] mb-2">Phone Number</Text>
              <View className="flex-row items-center rounded-2xl border border-[#E8E6DD] bg-white px-4 h-14 shadow-sm">
                <Feather name="phone" size={20} color="#8A9A86" />
                <TextInput 
                  className="flex-1 ml-3 text-base text-[#2C402E] font-semibold"
                  placeholder="+94 7X XXX XXXX"
                  placeholderTextColor="#B0BDB0"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
              </View>
            </View>

            <View className="mb-10">
              <Text className="text-sm font-bold text-[#4A6B4D] mb-2">Secure PIN</Text>
              <View className="flex-row items-center rounded-2xl border border-[#E8E6DD] bg-white px-4 h-14 shadow-sm">
                <Feather name="lock" size={20} color="#8A9A86" />
                <TextInput 
                  className="flex-1 ml-3 text-base text-[#2C402E] font-semibold"
                  placeholder="••••"
                  placeholderTextColor="#B0BDB0"
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
              <TouchableOpacity className="mt-4">
                <Text className="text-[#7CB342] font-bold text-right text-sm">Forgot PIN?</Text>
              </TouchableOpacity>
            </View>

            <PrimaryButton 
              label="Secure Sign In" 
              colorClass="bg-[#4A6B4D]" 
              onPress={signIn} 
            />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
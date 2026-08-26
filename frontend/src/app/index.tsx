import React from 'react';
import { View, Text, StatusBar } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router'; 
import PrimaryButton from '../components/PrimaryButton'; 

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-[#2C402E]">
      <StatusBar barStyle="light-content" backgroundColor="#2C402E" />
      
      <View 
        className="flex-1 justify-center items-center px-6"
        style={{ paddingTop: insets.top }} 
      >
        <Animated.View entering={FadeInDown.delay(200).springify()} className="items-center mb-10">
          <View className="w-24 h-24 bg-[#E2F4C5]/10 rounded-full items-center justify-center border-2 border-[#E2F4C5] mb-6">
            <Text className="text-4xl">🌿</Text>
          </View>
          <Text className="text-4xl font-extrabold text-[#F5F3E9] tracking-tight mb-3">CinnaCare</Text>
          <Text className="text-[#C5EBAA] text-center text-base px-4 font-medium leading-relaxed">
            Intelligent decision support for sustainable cinnamon cultivation.
          </Text>
        </Animated.View>
      </View>

      <Animated.View 
        entering={FadeInUp.delay(400).springify()} 
        className="px-6 w-full bg-[#F5F3E9] rounded-t-[40px] pt-10 shadow-lg border-t border-[#E8E6DD]"
        style={{ paddingBottom: Math.max(insets.bottom, 24) + 24 }} 
      >
        <PrimaryButton 
          label="Sign In" 
          colorClass="bg-[#4A6B4D]" 
          iconName="log-in" 
          onPress={() => router.push('/login')} 
        />
        <PrimaryButton 
          label="Create Account" 
          colorClass="bg-white border border-[#E8E6DD]" 
          textClass="text-[#2C402E]" 
          onPress={() => router.push('/signup')} 

        />
        <Text className="text-center text-[#8A9A86] font-semibold text-xs mt-2">
          By continuing, you agree to our Terms of Service.
        </Text>
      </Animated.View>
    </View>
  );
}
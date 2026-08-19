import React from 'react';
import { View, Text, TouchableOpacity, Dimensions } from 'react-native';
import Animated, { FadeInRight, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.42; 

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface ModuleCardProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  bgColor: string;
  onPress: () => void;
  index: number;
}

export default function ModuleCard({ title, subtitle, icon, bgColor, onPress, index }: ModuleCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInRight.delay(index * 150).springify()}
      style={{ width: CARD_WIDTH, marginRight: 16 }}
    >
      <AnimatedTouchableOpacity
        activeOpacity={1}
        onPressIn={() => (scale.value = withSpring(0.92, { damping: 12, stiffness: 300 }))}
        onPressOut={() => (scale.value = withSpring(1, { damping: 12, stiffness: 300 }))}
        onPress={onPress}
        style={animatedStyle}
        className={`h-48 rounded-[32px] p-5 justify-between shadow-sm ${bgColor}`}
      >
        <View className="w-12 h-12 rounded-full bg-white/40 items-center justify-center">
          {icon}
        </View>
        <View>
          <Text className="text-lg font-extrabold text-[#2C402E] mb-1">{title}</Text>
          <Text className="text-xs font-semibold text-[#4A6B4D]">{subtitle}</Text>
        </View>
      </AnimatedTouchableOpacity>
    </Animated.View>
  );
}
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, FadeInUp } from 'react-native-reanimated';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface PrimaryButtonProps {
  label: string;
  onPress?: () => void;
  colorClass?: string;
  textClass?: string; 
  iconName?: keyof typeof Feather.glyphMap;
}

export default function PrimaryButton({ 
  label, 
  onPress, 
  colorClass = "bg-[#4A6B4D]", 
  textClass = "text-white", 
  iconName
}: PrimaryButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const iconColor = textClass.includes('#') ? textClass.replace('text-[', '').replace(']', '') : 'white';

  return (
    <Animated.View entering={FadeInUp.delay(300).springify()} style={{ width: '100%', marginBottom: 24 }}>
      <AnimatedTouchableOpacity 
        className={`flex-row items-center justify-center rounded-2xl py-4 shadow-sm ${colorClass}`}
        style={animatedStyle}
        onPressIn={() => (scale.value = withSpring(0.95))}
        onPressOut={() => (scale.value = withSpring(1))}
        onPress={onPress}
        activeOpacity={0.9}
      >
        {iconName && <Feather name={iconName} size={20} color={textClass === 'text-white' ? 'white' : '#2C402E'} className="mr-2" />}
        
        <Text className={`text-base font-bold ml-2 ${textClass}`}>{label}</Text>
      </AnimatedTouchableOpacity>
    </Animated.View>
  );
}
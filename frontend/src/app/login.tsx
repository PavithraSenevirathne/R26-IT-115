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
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const normalizePhone = (raw: string) => {
    let clean = raw.replace(/[^\d+]/g, '');
    if (clean.startsWith('0')) clean = '+94' + clean.slice(1);
    else if (clean.startsWith('7') || clean.startsWith('9')) clean = '+94' + clean;
    return clean;
  };

  const handleLogin = async () => {
    setErrorMsg('');
    const cleanPhone = normalizePhone(phone);

    if (cleanPhone.length < 10) {
      setErrorMsg('Please enter a valid mobile number.');
      return;
    }
    if (pin.length !== 4) {
      setErrorMsg('PIN must be exactly 4 digits.');
      return;
    }

    setLoading(true);
    try {
      await signIn(cleanPhone, pin);
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Check your network.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-[#F5F3E9]" style={{ paddingTop: insets.top }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        
        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingTop: 40 }} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <Text className="text-3xl font-extrabold text-[#2C402E] mb-2">Welcome Back</Text>
            <Text className="text-base font-semibold text-[#8A9A86] mb-8">
              Enter your phone number & PIN to access your workspace.
            </Text>

            {errorMsg ? (
              <View className="bg-rose-100 p-4 rounded-2xl border border-rose-200 flex-row items-center mb-6">
                <Feather name="alert-circle" size={18} color="#E11D48" />
                <Text className="text-rose-700 font-bold ml-2 flex-1 text-sm">{errorMsg}</Text>
              </View>
            ) : null}

            <View className="mb-6">
              <Text className="text-sm font-bold text-[#4A6B4D] mb-2">Mobile Number</Text>
              <View className="flex-row items-center rounded-2xl border border-[#E8E6DD] bg-white px-4 h-14 shadow-sm">
                <Feather name="phone" size={20} color="#8A9A86" />
                <TextInput
                  className="flex-1 ml-3 text-base text-[#2C402E] font-semibold"
                  placeholder="07X XXX XXXX"
                  placeholderTextColor="#B0BDB0"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={(text) => { setPhone(text); setErrorMsg(''); }}
                  editable={!loading}
                />
              </View>
            </View>

            <View className="mb-8">
              <Text className="text-sm font-bold text-[#4A6B4D] mb-2">4-Digit Security PIN</Text>
              <View className="flex-row items-center rounded-2xl border border-[#E8E6DD] bg-white px-4 h-14 shadow-sm">
                <Feather name="lock" size={20} color="#8A9A86" />
                <TextInput
                  className="flex-1 ml-3 text-base text-[#2C402E] font-semibold tracking-widest"
                  placeholder="••••"
                  placeholderTextColor="#B0BDB0"
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={4}
                  value={pin}
                  onChangeText={(text) => { setPin(text); setErrorMsg(''); }}
                  editable={!loading}
                />
              </View>
            </View>

            <PrimaryButton
              label={loading ? 'Authenticating...' : 'Secure Sign In'}
              colorClass={loading ? 'bg-[#8A9A86]' : 'bg-[#4A6B4D]'}
              iconName={loading ? 'loader' : 'log-in'}
              onPress={handleLogin}
            />

            <TouchableOpacity
              onPress={() => router.push('/signup')}
              className="mt-6 py-3 items-center"
              disabled={loading}
            >
              <Text className="text-[#8A9A86] font-semibold text-sm">
                Don't have an account? <Text className="text-[#4A6B4D] font-extrabold">Sign Up</Text>
              </Text>
            </TouchableOpacity>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/authContext';
import PrimaryButton from '../components/PrimaryButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

export default function SignupScreen() {
  const { signUp } = useAuth();
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

  const handleSignup = async () => {
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
      await signUp(cleanPhone, pin);
    } catch (err: any) {
      setErrorMsg(err.message || 'Registration failed. Check your network.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-[#F5F3E9]" style={{ paddingTop: insets.top }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        
        <View className="flex-row items-center px-6 pt-4 pb-2">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-12 h-12 bg-white rounded-2xl items-center justify-center border border-[#E8E6DD] shadow-sm"
          >
            <Feather name="arrow-left" size={20} color="#2C402E" />
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <Text className="text-3xl font-extrabold text-[#2C402E] mb-2">Create Account</Text>
            <Text className="text-base font-semibold text-[#8A9A86] mb-8">
              Register your number to securely back up your offline diagnoses.
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
              <Text className="text-sm font-bold text-[#4A6B4D] mb-2">Set a 4-Digit PIN</Text>
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
              <Text className="text-[#8A9A86] text-xs mt-2 text-center">
                This PIN will lock your local data. Don't forget it!
              </Text>
            </View>

            <PrimaryButton
              label={loading ? 'Creating Account...' : 'Create Account'}
              colorClass={loading ? 'bg-[#8A9A86]' : 'bg-[#4A6B4D]'}
              iconName={loading ? 'loader' : 'check-circle'}
              onPress={handleSignup}
            />

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
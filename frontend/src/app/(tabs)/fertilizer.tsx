import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp, FadeOutDown, Layout } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// const RAG_BACKEND_URL = 'http://192.168.X.X:8000/api/v1/chat';

interface Message {
  id: string;
  text: string;
  sender: 'ai' | 'user';
}

const SUGGESTED_PROMPTS = [
  "What's the ideal NPK ratio?",
  "Suggest organic alternatives",
  "How does rain affect fertilizer?",
  "Best time of day to apply?"
];

export default function FertilizerScreen() {
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'ai',
      text: 'Hello! I am your RAG-powered Agronomy Assistant. Ask me anything about soil health, local climate adaptation, or fertilizer blends.'
    }
  ]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;

    // 1. Add User Message
    const userMessage: Message = { id: Date.now().toString(), sender: 'user', text: text.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);
    
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      // 2. Send to Backend RAG Pipeline
      const response = await fetch(RAG_BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Sending the query. You could also send the full message history here for context.
        body: JSON.stringify({ query: text.trim() }) 
      });

      if (!response.ok) throw new Error("Failed to fetch from LLM");
      
      const data = await response.json();

      // 3. Add AI Response
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: data.reply || "I couldn't generate a response based on the current context."
      }]);
    } catch (error) {
      console.error("RAG Pipeline Error:", error);
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: "⚠️ Connection error. Please ensure the backend LLM server is running."
      }]);
    } finally {
      setIsTyping(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const keyboardOffset = Platform.OS === 'ios' ? insets.top + 60 : 0;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-[#F5F3E9]" keyboardVerticalOffset={keyboardOffset}>
      <View className="absolute top-4 w-full z-10 items-center pointer-events-none">
        <Animated.View entering={FadeInDown.delay(200)} className="bg-white/90 px-4 py-2 rounded-full border border-[#E8E6DD] shadow-sm flex-row items-center">
          <View className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
          <Text className="text-xs font-extrabold text-[#8A9A86] tracking-widest uppercase">RAG Engine Active</Text>
        </Animated.View>
      </View>

      <ScrollView 
        ref={scrollViewRef} className="flex-1 px-5" 
        contentContainerStyle={{ paddingTop: 70, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      >
        {messages.map((msg) => {
          const isAi = msg.sender === 'ai';
          return (
            <Animated.View key={msg.id} entering={FadeInUp.delay(100).springify()} layout={Layout.springify()} className={`mb-8 w-full ${isAi ? 'flex-row items-start' : 'items-end'}`}>
              {isAi ? (
                <>
                  <View className="w-9 h-9 rounded-full bg-[#E0F2F1] items-center justify-center mr-4 mt-1 border border-[#B2DFDB]/50 shadow-sm">
                    <Feather name="cpu" size={18} color="#00897B" />
                  </View>
                  <View className="flex-1 pr-4">
                    <Text className="text-[16px] leading-7 text-[#2C402E] font-medium">{msg.text}</Text>
                  </View>
                </>
              ) : (
                <View className="max-w-[85%] bg-[#E2F4C5] px-5 py-3.5 rounded-[24px] rounded-tr-sm shadow-sm border border-[#D2E3C8]/50">
                  <Text className="text-[16px] leading-6 text-[#2C402E] font-semibold">{msg.text}</Text>
                </View>
              )}
            </Animated.View>
          );
        })}

        {isTyping && (
          <Animated.View entering={FadeInUp} exiting={FadeOutDown} className="flex-row items-start mb-8">
             <View className="w-9 h-9 rounded-full bg-[#E0F2F1] items-center justify-center mr-4 border border-[#B2DFDB]/50 shadow-sm">
                <Feather name="cpu" size={18} color="#00897B" />
             </View>
             <View className="bg-white px-5 py-3.5 rounded-[24px] rounded-tl-sm border border-[#E8E6DD] shadow-sm justify-center">
                <Text className="text-[#8A9A86] font-medium text-sm animate-pulse">Retrieving context...</Text>
             </View>
          </Animated.View>
        )}
      </ScrollView>

      {!isKeyboardVisible && (
        <Animated.View entering={FadeInDown.delay(400)} className="py-2">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {SUGGESTED_PROMPTS.map((prompt, i) => (
              <TouchableOpacity key={i} onPress={() => setInputText(prompt)} className="bg-[#E8E6DD]/50 border border-[#D5D3C8]/50 px-4 py-2 rounded-xl">
                <Text className="text-[#4A6B4D] text-xs font-bold">{prompt}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>
      )}

      <Animated.View entering={FadeInDown.delay(500).springify()} className="bg-transparent px-4 pt-2 border-t border-[#E8E6DD]/50" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
        <View className="flex-row items-end bg-white rounded-[32px] pl-6 pr-2 py-2 shadow-lg border border-[#E8E6DD]">
          <TextInput 
            className="flex-1 max-h-32 text-[16px] text-[#2C402E] pt-3 pb-3 font-medium"
            placeholder="Ask anything..." placeholderTextColor="#8A9A86" multiline value={inputText} onChangeText={setInputText}
          />
          <TouchableOpacity onPress={() => handleSend(inputText)} disabled={!inputText.trim()} className={`w-12 h-12 rounded-full items-center justify-center ml-3 transition-all ${inputText.trim() ? 'bg-[#2C402E] scale-100' : 'bg-[#F5F3E9] scale-95'}`}>
            <Feather name="arrow-up" size={22} color={inputText.trim() ? '#FFFFFF' : '#B0BDB0'} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
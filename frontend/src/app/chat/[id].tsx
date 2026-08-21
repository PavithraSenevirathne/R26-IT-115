import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeOutDown, Layout } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';

const MODAL_API_URL = 'https://nisithawickramarachchi--cinnamon-agent-api-chat-endpoint.modal.run';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [plantMetadata, setPlantMetadata] = useState({ name: 'Loading...', color: '#4A6B4D' });

  useEffect(() => {
    if (!id) return;

    // Load Metadata
    const plant = db.getFirstSync<{ name: string, color: string }>('SELECT name, color FROM plants WHERE id = ?', [id]);
    if (plant) setPlantMetadata(plant);

    // Load History
    const history = db.getAllSync<{ id: string, sender: 'user' | 'ai', content: string }>(
      'SELECT id, sender, content FROM messages WHERE session_id = ? ORDER BY created_at ASC', [id]
    );

    if (history.length === 0) {
      setMessages([{ id: '1', sender: 'ai', text: `Hello! I am your assistant for ${plant?.name}. I need to know the plant's age, spacing, and local rainfall to calculate fertilizer.` }]);
    } else {
      setMessages(history.map(m => ({ id: m.id, sender: m.sender, text: m.content })));
    }
  }, [id]);

  const handleSend = async (text: string) => {
    if (!text.trim() || !id) return;

    const userMessageId = Crypto.randomUUID();
    setMessages((prev) => [...prev, { id: userMessageId, sender: 'user', text: text.trim() }]);
    setInputText('');
    setIsTyping(true);
    
    db.runSync('INSERT INTO messages (id, session_id, sender, content) VALUES (?, ?, ?, ?)', [userMessageId, id, 'user', text.trim()]);
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const formattedHistory = messages
        .filter(m => m.id !== '1')
        .map(m => ({ role: m.sender === 'ai' ? 'assistant' : 'user', content: m.text }));

      const response = await fetch(MODAL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), chat_history: formattedHistory }) 
      });

      const responseText = await response.text();
      let data;
      
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(`Server crashed. Raw response: ${responseText.substring(0, 80)}...`);
      }

      if (!response.ok || data.status === 'error') {
        throw new Error(data.response || "LLM Engine Error");
      }

      const aiMessageId = Crypto.randomUUID();
      db.runSync('INSERT INTO messages (id, session_id, sender, content) VALUES (?, ?, ?, ?)', [aiMessageId, id, 'ai', data.response]);
      setMessages((prev) => [...prev, { id: aiMessageId, sender: 'ai', text: data.response }]);
      
    } catch (error: any) {
      console.error("Pipeline Error:", error);
      const errorId = Crypto.randomUUID();
      const errorMsg = `Connection Error: ${error.message}. Please check if the Modal server is running and your API keys are correct.`;
      db.runSync('INSERT INTO messages (id, session_id, sender, content) VALUES (?, ?, ?, ?)', [errorId, id, 'ai', errorMsg]);
      setMessages((prev) => [...prev, { id: errorId, sender: 'ai', text: errorMsg }]);
    } finally {
      setIsTyping(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-[#F5F3E9]">
      
      <View className="flex-row items-center px-5 pb-4 border-b border-[#E8E6DD] bg-white z-10 shadow-sm" style={{ paddingTop: insets.top + 10 }}>
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 rounded-full items-center justify-center bg-[#F5F3E9] mr-3">
          <Feather name="arrow-left" size={20} color="#2C402E" />
        </TouchableOpacity>
        <View className="w-4 h-4 rounded-full mr-2" style={{ backgroundColor: plantMetadata.color }} />
        <Text className="text-lg font-extrabold text-[#2C402E] flex-1" numberOfLines={1}>{plantMetadata.name}</Text>
      </View>

      {/* Chat Area */}
      <ScrollView ref={scrollViewRef} className="flex-1 px-5" contentContainerStyle={{ paddingTop: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {messages.map((msg) => (
          <Animated.View key={msg.id} entering={FadeInUp.springify()} layout={Layout.springify()} className={`mb-6 w-full ${msg.sender === 'ai' ? 'flex-row items-start' : 'items-end'}`}>
            {msg.sender === 'ai' ? (
              <>
                <View className="w-9 h-9 rounded-full items-center justify-center mr-3 mt-1 shadow-sm" style={{ backgroundColor: plantMetadata.color }}>
                  <Feather name="cpu" size={16} color="#FFFFFF" />
                </View>
                <View className="flex-1 pr-4">
                  <Text className="text-[15px] leading-7 text-[#2C402E] font-medium">{msg.text}</Text>
                </View>
              </>
            ) : (
              <View className="max-w-[85%] bg-[#E2F4C5] px-5 py-3 rounded-[20px] rounded-tr-sm shadow-sm border border-[#D2E3C8]/50">
                <Text className="text-[15px] leading-6 text-[#2C402E] font-semibold">{msg.text}</Text>
              </View>
            )}
          </Animated.View>
        ))}

        {isTyping && (
          <Animated.View entering={FadeInUp} exiting={FadeOutDown} className="flex-row items-start mb-6">
             <View className="w-9 h-9 rounded-full items-center justify-center mr-3 shadow-sm" style={{ backgroundColor: plantMetadata.color, opacity: 0.5 }}>
                <Feather name="cpu" size={16} color="#FFFFFF" />
             </View>
             <View className="bg-white px-5 py-3 rounded-[20px] rounded-tl-sm border border-[#E8E6DD] shadow-sm justify-center">
                <Text className="text-[#8A9A86] font-medium text-sm animate-pulse">Analyzing logic constraints...</Text>
             </View>
          </Animated.View>
        )}
      </ScrollView>

      <View className="bg-white px-4 pt-2 border-t border-[#E8E6DD]/50 shadow-lg" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
        <View className="flex-row items-end bg-[#F5F3E9] rounded-[28px] pl-5 pr-2 py-2 border border-[#E8E6DD]">
          <TextInput 
            className="flex-1 max-h-32 text-[15px] text-[#2C402E] pt-3 pb-3 font-medium"
            placeholder="Age? pH level? Rainfall?" placeholderTextColor="#8A9A86" multiline value={inputText} onChangeText={setInputText}
          />
          <TouchableOpacity onPress={() => handleSend(inputText)} disabled={!inputText.trim() || isTyping} className={`w-11 h-11 rounded-full items-center justify-center ml-2 transition-all ${inputText.trim() ? 'bg-[#2C402E]' : 'bg-[#E8E6DD]'}`}>
            <Feather name="arrow-up" size={20} color={inputText.trim() ? '#FFFFFF' : '#B0BDB0'} />
          </TouchableOpacity>
        </View>
      </View>

    </KeyboardAvoidingView>
  );
}
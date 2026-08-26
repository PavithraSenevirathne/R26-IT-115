import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  KeyboardAvoidingView, 
  Platform, 
  Keyboard, 
  Alert 
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeOutDown, Layout } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import * as Crypto from 'expo-crypto';
import Markdown from 'react-native-markdown-display';

const MODAL_API_URL = 'https://nisithawickramarachchi--cinnamon-agent-api-chat-endpoint.modal.run';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
}

const markdownStyles = {
  body: {
    fontSize: 15,
    lineHeight: 24,
    color: '#2C402E',
    fontWeight: '500' as const,
  },
  heading1: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: '#1A291B',
    marginTop: 12,
    marginBottom: 8,
  },
  heading2: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#1A291B',
    marginTop: 10,
    marginBottom: 6,
  },
  heading3: {
    fontSize: 16,
    fontWeight: 'bold' as const,
    color: '#1A291B',
    marginTop: 8,
    marginBottom: 4,
  },
  strong: {
    fontWeight: 'bold' as const,
    color: '#1A291B',
  },
  em: {
    fontStyle: 'italic' as const,
  },
  bullet_list: {
    marginTop: 4,
    marginBottom: 4,
  },
  list_item: {
    marginTop: 2,
    marginBottom: 2,
  },
  code_inline: {
    backgroundColor: '#E8E6DD',
    color: '#2C402E',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  code_block: {
    backgroundColor: '#E8E6DD',
    color: '#2C402E',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  paragraph: {
    marginTop: 4,
    marginBottom: 4,
  }
};

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

    const plant = db.getFirstSync<{ name: string; color: string }>(
      'SELECT name, color FROM plants WHERE id = ?', 
      [id]
    );
    if (plant) setPlantMetadata(plant);

    const history = db.getAllSync<{ id: string; sender: 'user' | 'ai'; content: string }>(
      'SELECT id, sender, content FROM messages WHERE session_id = ? ORDER BY created_at ASC', 
      [id]
    );

    if (history.length === 0) {
      setMessages([
        { 
          id: '1', 
          sender: 'ai', 
          text: `Hello! I am your assistant for ${plant?.name || 'this plot'}. Ask me about pests, diseases, harvesting, or fertilizer dosages.` 
        }
      ]);
    } else {
      setMessages(history.map(m => ({ id: m.id, sender: m.sender, text: m.content })));
    }

    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', 
      () => {
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
      }
    );

    return () => showSub.remove();
  }, [id]);

  const confirmDelete = () => {
    Alert.alert(
      'Delete Chat',
      `Are you sure you want to permanently delete "${plantMetadata.name}" and all of its conversation history?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: () => {
            if (!id) return;
            db.runSync('DELETE FROM messages WHERE session_id = ?', [id]);
            db.runSync('DELETE FROM plants WHERE id = ?', [id]);
            router.back();
          } 
        }
      ]
    );
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || !id) return;

    const userMessageId = Crypto.randomUUID();
    const cleanText = text.trim();
    
    setMessages(prev => [...prev, { id: userMessageId, sender: 'user', text: cleanText }]);
    setInputText('');
    setIsTyping(true);
    
    db.runSync(
      'INSERT INTO messages (id, session_id, sender, content) VALUES (?, ?, ?, ?)', 
      [userMessageId, id, 'user', cleanText]
    );
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const formattedHistory = messages
        .filter(m => m.id !== '1')
        .map(m => ({ role: m.sender === 'ai' ? 'assistant' : 'user', content: m.text }));

      const response = await fetch(MODAL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: cleanText, chat_history: formattedHistory }) 
      });

      const responseText = await response.text();
      let data;
      
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`Server response error: ${responseText.substring(0, 80)}`);
      }

      if (!response.ok || data.status === 'error') {
        throw new Error(data.response || 'LLM Engine Error');
      }

      const aiMessageId = Crypto.randomUUID();
      db.runSync(
        'INSERT INTO messages (id, session_id, sender, content) VALUES (?, ?, ?, ?)', 
        [aiMessageId, id, 'ai', data.response]
      );
      setMessages(prev => [...prev, { id: aiMessageId, sender: 'ai', text: data.response }]);
      
    } catch (error: any) {
      console.error('Pipeline Error:', error);
      const errorId = Crypto.randomUUID();
      const errorMsg = `Connection Error: ${error.message}`;
      db.runSync(
        'INSERT INTO messages (id, session_id, sender, content) VALUES (?, ?, ?, ?)', 
        [errorId, id, 'ai', errorMsg]
      );
      setMessages(prev => [...prev, { id: errorId, sender: 'ai', text: errorMsg }]);
    } finally {
      setIsTyping(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <View className="flex-1 bg-[#F0F4F1]">
      <Stack.Screen options={{ headerShown: false }} />
      <View 
        className="flex-row items-center justify-between px-5 pb-3 border-b border-[#E8E6DD] bg-white shadow-sm z-10"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-row items-center flex-1 mr-3">
          <TouchableOpacity 
            onPress={() => router.back()} 
            className="w-10 h-10 rounded-xl items-center justify-center bg-[#F5F3E9] mr-3 border border-[#E8E6DD]"
          >
            <Feather name="arrow-left" size={18} color="#2C402E" />
          </TouchableOpacity>
          <View className="w-3.5 h-3.5 rounded-full mr-2" style={{ backgroundColor: plantMetadata.color }} />
          <Text className="text-base font-extrabold text-[#2C402E] flex-1" numberOfLines={1}>
            {plantMetadata.name}
          </Text>
        </View>

        <TouchableOpacity 
          onPress={confirmDelete}
          className="w-10 h-10 rounded-xl items-center justify-center bg-rose-50 border border-rose-100"
        >
          <Feather name="trash-2" size={18} color="#E11D48" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView 
          ref={scrollViewRef} 
          className="flex-1 px-5" 
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {messages.map((msg) => (
            <Animated.View 
              key={msg.id} 
              entering={FadeInUp.springify()} 
              layout={Layout.springify()} 
              className={`mb-5 w-full ${msg.sender === 'ai' ? 'flex-row items-start' : 'items-end'}`}
            >
              {msg.sender === 'ai' ? (
                  <>
                    <View 
                      className="w-8 h-8 rounded-full items-center justify-center mr-3 mt-1 shadow-sm" 
                      style={{ backgroundColor: plantMetadata.color }}
                    >
                      <Feather name="cpu" size={14} color="#FFFFFF" />
                    </View>
                    <View className="flex-1 pr-3">
                      <Markdown style={markdownStyles}>
                        {msg.text}
                      </Markdown>
                    </View>
                  </>
                ) : (
                <View className="max-w-[85%] bg-[#E2F4C5] px-4 py-3 rounded-[20px] rounded-tr-sm border border-[#D2E3C8]/60 shadow-sm">
                  <Markdown style={{
                    ...markdownStyles,
                    body: { ...markdownStyles.body, fontWeight: '600' }
                  }}>
                    {msg.text}
                  </Markdown>
                </View>
              )}
            </Animated.View>
          ))}

          {isTyping && (
            <Animated.View entering={FadeInUp} exiting={FadeOutDown} className="flex-row items-start mb-4">
              <View 
                className="w-8 h-8 rounded-full items-center justify-center mr-3 opacity-60" 
                style={{ backgroundColor: plantMetadata.color }}
              >
                <Feather name="cpu" size={14} color="#FFFFFF" />
              </View>
              <View className="bg-white px-4 py-2.5 rounded-[18px] rounded-tl-sm border border-[#E8E6DD] shadow-sm">
                <Text className="text-[#8A9A86] text-xs font-semibold">CInnLLM is thinking...</Text>
              </View>
            </Animated.View>
          )}
        </ScrollView>

        <View 
          className="bg-white px-4 pt-3 border-t border-[#E8E6DD] shadow-lg" 
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <View className="flex-row items-end bg-[#F5F3E9] rounded-[24px] pl-4 pr-2 py-1.5 border border-[#E8E6DD]">
            <TextInput 
              className="flex-1 max-h-28 text-[15px] text-[#2C402E] pt-2 pb-2 font-medium"
              placeholder="Ask about fertilizer, pests, pruning..." 
              placeholderTextColor="#8A9A86" 
              multiline 
              value={inputText} 
              onChangeText={setInputText}
            />
            <TouchableOpacity 
              onPress={() => handleSend(inputText)} 
              disabled={!inputText.trim() || isTyping} 
              className={`w-10 h-10 rounded-full items-center justify-center ml-2 transition-all ${
                inputText.trim() && !isTyping ? 'bg-[#2C402E]' : 'bg-[#E8E6DD]'
              }`}
            >
              <Feather name="arrow-up" size={18} color={inputText.trim() && !isTyping ? '#FFFFFF' : '#B0BDB0'} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
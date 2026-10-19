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
  Alert,
  Modal,
  Pressable,
  ImageBackground,
  Image
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeOutDown, Layout } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import * as Crypto from 'expo-crypto';
import Markdown from 'react-native-markdown-display';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

const MODAL_API_URL = 'https://nisithawickramarachchi--cinnamon-agent-api-chat-endpoint.modal.run';

const SUBTLE_PATTERN_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAAXNSR0IArs4c6QAAACVJREFUKFNjZCASMDKgAhgZGP/zEQ3Qw5Rk4DGGRxVDBTzCgZ4AAwMDAQJb4jMAAAAASUVORK5CYII=';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
}

const markdownStyles = {
  body: { fontSize: 15, lineHeight: 24, color: '#2C402E', fontWeight: '500' as const },
  heading1: { fontSize: 22, fontWeight: 'bold' as const, color: '#1A291B', marginTop: 12, marginBottom: 8 },
  heading2: { fontSize: 18, fontWeight: 'bold' as const, color: '#1A291B', marginTop: 10, marginBottom: 6 },
  heading3: { fontSize: 16, fontWeight: 'bold' as const, color: '#1A291B', marginTop: 8, marginBottom: 4 },
  strong: { fontWeight: 'bold' as const, color: '#1A291B' },
  em: { fontStyle: 'italic' as const },
  bullet_list: { marginTop: 4, marginBottom: 4 },
  list_item: { marginTop: 2, marginBottom: 2 },
  code_inline: { backgroundColor: '#E8E6DD', color: '#2C402E', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  code_block: { backgroundColor: '#E8E6DD', color: '#2C402E', borderRadius: 8, padding: 12, marginTop: 8, marginBottom: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  paragraph: { marginTop: 4, marginBottom: 4 }
};

export default function ChatScreen() {
  const { id, autoPrompt } = useLocalSearchParams<{ id: string; autoPrompt: string }>();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [plantMetadata, setPlantMetadata] = useState({ name: 'Loading...', color: '#4A6B4D' });
  const [androidKeyboardOffset, setAndroidKeyboardOffset] = useState(0);
  const [hasProcessedAutoPrompt, setHasProcessedAutoPrompt] = useState(false);

  // New Image States
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [base64Image, setBase64Image] = useState<string | null>(null);

  const [showDataForm, setShowDataForm] = useState(false);
  const [cultivationData, setCultivationData] = useState({ 
    age: '', 
    spacing: '', 
    season: '', 
    rainfall: '',
    elevation: '',
    ph: ''
  });

  useEffect(() => {
    if (autoPrompt && !hasProcessedAutoPrompt && messages.length > 0) {
      setHasProcessedAutoPrompt(true);
      const promptString = Array.isArray(autoPrompt) ? autoPrompt[0] : autoPrompt;
      handleSend(promptString);
    }
  }, [autoPrompt, messages.length]);

  useEffect(() => {
    if (!id) return;

    const plant = db.getFirstSync<{ name: string; color: string }>(
      'SELECT name, color FROM plants WHERE id = ?', [id]
    );
    if (plant) setPlantMetadata(plant);

    const history = db.getAllSync<{ id: string; sender: 'user' | 'ai'; content: string }>(
      'SELECT id, sender, content FROM messages WHERE session_id = ? ORDER BY created_at ASC', [id]
    );

    if (history.length === 0) {
      setMessages([{ id: '1', sender: 'ai', text: `Hello! I am your assistant for ${plant?.name || 'this plot'}. Ask me about pests, diseases, harvesting, or fertilizer dosages.` }]);
    } else {
      setMessages(history.map(m => ({ id: m.id, sender: m.sender, text: m.content })));
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      if (Platform.OS === 'android') {
        setAndroidKeyboardOffset(e.endCoordinates.height);
      }
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      if (Platform.OS === 'android') {
        setAndroidKeyboardOffset(0);
      }
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [id]);

  const confirmDelete = () => {
    Alert.alert(
      'Delete Chat',
      `Are you sure you want to permanently delete "${plantMetadata.name}" and all of its conversation history?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', style: 'destructive', 
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

  // Image Picking and Compression Logic
  const handleAttachImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'We need camera roll permissions to upload reports.');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setSelectedImage(uri);

      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }], 
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      
      setBase64Image(manipulated.base64 || null);
    }
  };

  const handleSend = async (text: string) => {
    // Check if there is text OR an image attached
    if ((!text.trim() && !base64Image) || !id) return;

    const userMessageId = Crypto.randomUUID();
    // If user attaches an image but types nothing, provide a default message
    const cleanText = text.trim() || "Please analyze this report and update my agronomy profile.";
    
    setMessages(prev => [...prev, { id: userMessageId, sender: 'user', text: cleanText }]);
    setInputText('');
    setIsTyping(true);
    
    db.runSync('INSERT INTO messages (id, session_id, sender, content) VALUES (?, ?, ?, ?)', [userMessageId, id, 'user', cleanText]);
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const formattedHistory = messages.filter(m => m.id !== '1').map(m => ({ role: m.sender === 'ai' ? 'assistant' : 'user', content: m.text }));
      console.log("Sending payload. Image base64 length:", base64Image ? base64Image.length : "NO IMAGE");

      const response = await fetch(MODAL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: cleanText, 
          chat_history: formattedHistory,
          image_base64: base64Image 
        }) 
      });

      const responseText = await response.text();
      let data;
      try { data = JSON.parse(responseText); } 
      catch { throw new Error(`Server response error: ${responseText.substring(0, 80)}`); }

      if (!response.ok || data.status === 'error') throw new Error(data.response || 'LLM Engine Error');

      const aiMessageId = Crypto.randomUUID();
      db.runSync('INSERT INTO messages (id, session_id, sender, content) VALUES (?, ?, ?, ?)', [aiMessageId, id, 'ai', data.response]);
      setMessages(prev => [...prev, { id: aiMessageId, sender: 'ai', text: data.response }]);
      
    } catch (error: any) {
      const errorId = Crypto.randomUUID();
      const errorMsg = `Connection Error: ${error.message}`;
      db.runSync('INSERT INTO messages (id, session_id, sender, content) VALUES (?, ?, ?, ?)', [errorId, id, 'ai', errorMsg]);
      setMessages(prev => [...prev, { id: errorId, sender: 'ai', text: errorMsg }]);
    } finally {
      setIsTyping(false);
      setSelectedImage(null);
      setBase64Image(null);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleDataSubmit = () => {
    if (!cultivationData.age && !cultivationData.spacing && !cultivationData.season && !cultivationData.rainfall && !cultivationData.elevation && !cultivationData.ph) {
      Alert.alert("Empty Form", "Please enter at least one piece of data.");
      return;
    }

    const prompt = `Here is the current cultivation data for this cinnamon plot:
- Crop Age: 
${cultivationData.age ? `${cultivationData.age} years` : 'Not provided'}
- Plant Spacing: 
${cultivationData.spacing || 'Not provided'}
- Current Season: 
${cultivationData.season || 'Not provided'}
- Annual Rainfall: 
${cultivationData.rainfall ? `${cultivationData.rainfall} mm` : 'Not provided'}
- Elevation: 
${cultivationData.elevation ? `${cultivationData.elevation} m` : 'Not provided'}
- Soil pH: 
${cultivationData.ph || 'Not provided'}

Based on this specific environment and crop data, what fertilizer dosages, amendments, or tailored agronomic treatments do you recommend?`;

    setShowDataForm(false);
    setCultivationData({ age: '', spacing: '', season: '', rainfall: '', elevation: '', ph: '' }); 
    handleSend(prompt);
  };

  const isSendActive = (inputText.trim().length > 0 || selectedImage !== null) && !isTyping;

  return (
    <ImageBackground 
      source={{ uri: SUBTLE_PATTERN_BASE64 }}
      resizeMode="repeat"
      imageStyle={{ resizeMode: 'repeat', opacity: 0.3 }}
      className="flex-1 bg-[#F5F0E6]"
    >
      <Stack.Screen options={{ headerShown: false }} />      
      <View 
        className="flex-row items-center justify-between px-5 pb-3 border-b border-[#E8E6DD] bg-white shadow-sm z-10"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-row items-center flex-1 mr-3">
          <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 rounded-xl items-center justify-center bg-[#F5F3E9] mr-3 border border-[#E8E6DD]">
            <Feather name="arrow-left" size={18} color="#2C402E" />
          </TouchableOpacity>
          <View className="w-3.5 h-3.5 rounded-full mr-2" style={{ backgroundColor: plantMetadata.color }} />
          <Text className="text-base font-extrabold text-[#2C402E] flex-1" numberOfLines={1}>{plantMetadata.name}</Text>
        </View>

        <TouchableOpacity onPress={confirmDelete} className="w-10 h-10 rounded-xl items-center justify-center bg-rose-50 border border-rose-100">
          <Feather name="trash-2" size={18} color="#E11D48" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ paddingBottom: androidKeyboardOffset }}
      >
        <ScrollView 
          ref={scrollViewRef} 
          className="flex-1 px-5" 
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {messages.map((msg) => (
            <Animated.View key={msg.id} entering={FadeInUp.springify()} layout={Layout.springify()} className={`mb-5 w-full ${msg.sender === 'ai' ? 'flex-row items-start' : 'items-end'}`}>
              {msg.sender === 'ai' ? (
                  <>
                    <View className="w-8 h-8 rounded-full items-center justify-center mr-3 mt-1 shadow-sm" style={{ backgroundColor: plantMetadata.color }}>
                      <Feather name="cpu" size={14} color="#FFFFFF" />
                    </View>
                    <View className="flex-1 pr-3 bg-white/80 px-4 py-3 rounded-[20px] rounded-tl-sm border border-white/50 shadow-sm">
                      <Markdown style={markdownStyles}>{msg.text}</Markdown>
                    </View>
                  </>
                ) : (
                <View className="max-w-[85%] bg-[#E2F4C5] px-4 py-3 rounded-[20px] rounded-tr-sm border border-[#D2E3C8]/60 shadow-sm">
                  <Markdown style={{ ...markdownStyles, body: { ...markdownStyles.body, fontWeight: '600' } }}>{msg.text}</Markdown>
                </View>
              )}
            </Animated.View>
          ))}

          {isTyping && (
            <Animated.View entering={FadeInUp} exiting={FadeOutDown} className="flex-row items-start mb-4">
              <View className="w-8 h-8 rounded-full items-center justify-center mr-3 opacity-60" style={{ backgroundColor: plantMetadata.color }}>
                <Feather name="cpu" size={14} color="#FFFFFF" />
              </View>
              <View className="bg-white/90 px-4 py-2.5 rounded-[18px] rounded-tl-sm border border-white/50 shadow-sm">
                <Text className="text-[#8A9A86] text-xs font-semibold">CinnLLM is thinking...</Text>
              </View>
            </Animated.View>
          )}
        </ScrollView>

        <View className="bg-white px-4 pt-3 border-t border-[#E8E6DD] shadow-lg" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          
          {selectedImage && (
            <View className="flex-row items-center mb-3 bg-[#F5F3E9] p-2 rounded-2xl border border-[#E8E6DD] self-start">
              <Image source={{ uri: selectedImage }} className="w-12 h-12 rounded-xl bg-gray-200 mr-3" />
              <View className="flex-1 mr-4">
                <Text className="text-xs font-bold text-[#2C402E]">Report attached</Text>
                <Text className="text-[10px] text-[#768C73]">Ready to send</Text>
              </View>
              <TouchableOpacity 
                onPress={() => { setSelectedImage(null); setBase64Image(null); }}
                className="w-8 h-8 rounded-full bg-white items-center justify-center border border-[#E8E6DD]"
              >
                <Feather name="x" size={14} color="#E11D48" />
              </TouchableOpacity>
            </View>
          )}

          <View className="flex-row items-end bg-[#F5F3E9] rounded-[24px] pl-2 pr-2 py-1.5 border border-[#E8E6DD]">
            
            <TouchableOpacity 
              onPress={() => setShowDataForm(true)} 
              disabled={isTyping}
              className="w-10 h-10 rounded-full items-center justify-center bg-white border border-[#E8E6DD] mr-2 mb-0.5"
            >
              <MaterialCommunityIcons name="leaf-circle-outline" size={20} color="#768C73" />
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={handleAttachImage} 
              disabled={isTyping}
              className="w-10 h-10 rounded-full items-center justify-center bg-white border border-[#E8E6DD] mr-2 mb-0.5"
            >
              <Feather name="camera" size={18} color="#768C73" />
            </TouchableOpacity>

            <TextInput 
              className="flex-1 max-h-28 text-[15px] text-[#2C402E] pt-2 pb-2 font-medium"
              placeholder="Ask or attach report..." 
              placeholderTextColor="#8A9A86" 
              multiline 
              value={inputText} 
              onChangeText={setInputText}
            />
            
            <TouchableOpacity 
              onPress={() => handleSend(inputText)} 
              disabled={!isSendActive} 
              className={`w-10 h-10 rounded-full items-center justify-center ml-2 transition-all ${isSendActive ? 'bg-[#2C402E]' : 'bg-[#E8E6DD]'}`}
            >
              <Feather name="arrow-up" size={18} color={isSendActive ? '#FFFFFF' : '#B0BDB0'} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showDataForm} transparent animationType="slide">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          className="flex-1 justify-end bg-black/60"
        >
          <View className="bg-white rounded-t-[32px] overflow-hidden max-h-[90%] shadow-lg">
            <View className="flex-row justify-between items-center p-6 border-b border-[#E8E6DD] bg-white">
              <View className="flex-row items-center">
                <View className="w-10 h-10 bg-[#F5F3E9] rounded-full items-center justify-center mr-3 border border-[#E8E6DD]">
                  <MaterialCommunityIcons name="clipboard-text-outline" size={20} color="#3E5C41" />
                </View>
                <Text className="text-xl font-extrabold text-[#1F3021]">Plot Details</Text>
              </View>
              <Pressable onPress={() => setShowDataForm(false)} className="p-2 bg-gray-100 rounded-full">
                <Feather name="x" size={20} color="#4F6851" />
              </Pressable>
            </View>

            <ScrollView 
              contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View className="flex-row justify-between mb-4">
                <View className="w-[48%]">
                  <Text className="text-xs font-bold text-[#768C73] uppercase tracking-wider mb-2">Age of Crop</Text>
                  <TextInput 
                    value={cultivationData.age}
                    onChangeText={(val) => setCultivationData({...cultivationData, age: val})}
                    keyboardType="numeric"
                    placeholder="Years (e.g. 3)"
                    placeholderTextColor="#000000"
                    className="bg-[#F5F3E9] p-4 rounded-2xl border border-[#E8E6DD] text-[#1F3021] font-semibold"
                  />
                </View>
                <View className="w-[48%]">
                  <Text className="text-xs font-bold text-[#768C73] uppercase tracking-wider mb-2">Spacing</Text>
                  <TextInput 
                    value={cultivationData.spacing}
                    onChangeText={(val) => setCultivationData({...cultivationData, spacing: val})}
                    placeholder="e.g. 1.2m x 1.2m"
                    placeholderTextColor="#000000"
                    className="bg-[#F5F3E9] p-4 rounded-2xl border border-[#E8E6DD] text-[#1F3021] font-semibold"
                  />
                </View>
              </View>

              <View className="flex-row justify-between mb-4">
                <View className="w-[48%]">
                  <Text className="text-xs font-bold text-[#768C73] uppercase tracking-wider mb-2">Season</Text>
                  <TextInput 
                    value={cultivationData.season}
                    onChangeText={(val) => setCultivationData({...cultivationData, season: val})}
                    placeholder="Yala or Maha"
                    placeholderTextColor="#000000"
                    className="bg-[#F5F3E9] p-4 rounded-2xl border border-[#E8E6DD] text-[#1F3021] font-semibold"
                  />
                </View>
                <View className="w-[48%]">
                  <Text className="text-xs font-bold text-[#768C73] uppercase tracking-wider mb-2">Rainfall</Text>
                  <TextInput 
                    value={cultivationData.rainfall}
                    onChangeText={(val) => setCultivationData({...cultivationData, rainfall: val})}
                    keyboardType="numeric"
                    placeholder="mm/year"
                    placeholderTextColor="#000000"
                    className="bg-[#F5F3E9] p-4 rounded-2xl border border-[#E8E6DD] text-[#1F3021] font-semibold"
                  />
                </View>
              </View>

              <View className="flex-row justify-between mb-8">
                <View className="w-[48%]">
                  <Text className="text-xs font-bold text-[#768C73] uppercase tracking-wider mb-2">Elevation</Text>
                  <TextInput 
                    value={cultivationData.elevation}
                    onChangeText={(val) => setCultivationData({...cultivationData, elevation: val})}
                    keyboardType="numeric"
                    placeholder="m (above sea)"
                    placeholderTextColor="#000000"
                    className="bg-[#F5F3E9] p-4 rounded-2xl border border-[#E8E6DD] text-[#1F3021] font-semibold"
                  />
                </View>
                <View className="w-[48%]">
                  <Text className="text-xs font-bold text-[#768C73] uppercase tracking-wider mb-2">Soil pH</Text>
                  <TextInput 
                    value={cultivationData.ph}
                    onChangeText={(val) => setCultivationData({...cultivationData, ph: val})}
                    keyboardType="numeric"
                    placeholder="e.g. 5.5"
                    placeholderTextColor="#000000"
                    className="bg-[#F5F3E9] p-4 rounded-2xl border border-[#E8E6DD] text-[#1F3021] font-semibold"
                  />
                </View>
              </View>

              <TouchableOpacity 
                onPress={handleDataSubmit}
                activeOpacity={0.8}
                className="bg-[#2D4530] w-full py-4 rounded-2xl items-center border border-[#3E5C41]"
              >
                <Text className="text-white font-bold text-base tracking-wide">Get Recommendations</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ImageBackground>
  );
}
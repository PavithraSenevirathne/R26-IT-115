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
import Animated, { 
  FadeInUp, 
  FadeOutDown, 
  Layout, 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withSequence, 
  withTiming, 
  withDelay,
  Easing
} from 'react-native-reanimated';
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
  body: { fontSize: 16, lineHeight: 26, color: '#334155', fontWeight: '400' as const },
  heading1: { fontSize: 24, fontWeight: '800' as const, color: '#0F172A', marginTop: 16, marginBottom: 8 },
  heading2: { fontSize: 20, fontWeight: '700' as const, color: '#1E293B', marginTop: 14, marginBottom: 6 },
  heading3: { fontSize: 18, fontWeight: '600' as const, color: '#334155', marginTop: 10, marginBottom: 4 },
  strong: { fontWeight: '700' as const, color: '#0F172A' },
  em: { fontStyle: 'italic' as const, color: '#475569' },
  bullet_list: { marginTop: 6, marginBottom: 6 },
  list_item: { marginTop: 4, marginBottom: 4, lineHeight: 24 },
  code_inline: { backgroundColor: '#F1F5F9', color: '#0F172A', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14 },
  code_block: { backgroundColor: '#F8FAFC', color: '#334155', borderRadius: 12, padding: 16, marginTop: 8, marginBottom: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  paragraph: { marginTop: 6, marginBottom: 6 }
};

const userMarkdownStyles = {
  ...markdownStyles,
  body: { ...markdownStyles.body, color: '#FFFFFF', fontWeight: '500' as const },
  strong: { fontWeight: '700' as const, color: '#FFFFFF' },
  paragraph: { marginTop: 0, marginBottom: 0 }
};

const TypingDots = ({ color }: { color: string }) => {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  useEffect(() => {
    const sequence = (dot: any, delay: number) => {
      dot.value = withDelay(delay, withRepeat(
        withSequence(
          withTiming(-6, { duration: 300, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 300, easing: Easing.inOut(Easing.ease) })
        ), -1, true
      ));
    };
    sequence(dot1, 0);
    sequence(dot2, 150);
    sequence(dot3, 300);
  }, []);

  const s1 = useAnimatedStyle(() => ({ transform: [{ translateY: dot1.value }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ translateY: dot2.value }] }));
  const s3 = useAnimatedStyle(() => ({ transform: [{ translateY: dot3.value }] }));

  return (
    <View className="flex-row items-center justify-center h-6 px-2 space-x-1.5">
      <Animated.View className="w-2 h-2 rounded-full" style={[{ backgroundColor: color }, s1]} />
      <Animated.View className="w-2 h-2 rounded-full ml-1.5" style={[{ backgroundColor: color }, s2]} />
      <Animated.View className="w-2 h-2 rounded-full ml-1.5" style={[{ backgroundColor: color }, s3]} />
    </View>
  );
};

const AnimatedBotAvatar = ({ color, isTyping }: { color: string, isTyping: boolean }) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (isTyping) {
      scale.value = withRepeat(withSequence(
        withTiming(1.15, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
      ), -1, true);
      opacity.value = withRepeat(withSequence(
        withTiming(0.7, { duration: 600 }),
        withTiming(1, { duration: 600 })
      ), -1, true);
    } else {
      scale.value = withTiming(1, { duration: 300 });
      opacity.value = withTiming(1, { duration: 300 });
    }
  }, [isTyping]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value
  }));

  return (
    <Animated.View 
      className="w-8 h-8 rounded-full items-center justify-center mr-3 mt-1 shadow-sm" 
      style={[{ backgroundColor: color }, animatedStyle]}
    >
      <Feather name="cpu" size={14} color="#FFFFFF" />
    </Animated.View>
  );
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

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [base64Image, setBase64Image] = useState<string | null>(null);

  const [showDataForm, setShowDataForm] = useState(false);
  const [cultivationData, setCultivationData] = useState({ 
    age: '', spacing: '', season: '', rainfall: '', elevation: '', ph: ''
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
    const plant = db.getFirstSync<{ name: string; color: string }>('SELECT name, color FROM plants WHERE id = ?', [id]);
    if (plant) setPlantMetadata(plant);

    const history = db.getAllSync<{ id: string; sender: 'user' | 'ai'; content: string }>(
      'SELECT id, sender, content FROM messages WHERE session_id = ? ORDER BY created_at ASC', [id]
    );

    if (history.length === 0) {
      setMessages([{ id: '1', sender: 'ai', text: `Hello! I am your CInnLLM assistant for **${plant?.name || 'this plot'}**. Ask me about agronomy, pests, diseases, or provide your field data for a fertilizer calculation.` }]);
    } else {
      setMessages(history.map(m => ({ id: m.id, sender: m.sender, text: m.content })));
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      if (Platform.OS === 'android' && e?.endCoordinates?.height) {
        setAndroidKeyboardOffset(e.endCoordinates.height);
      }
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      if (Platform.OS === 'android') setAndroidKeyboardOffset(0);
    });

    return () => { showSub.remove(); hideSub.remove(); };
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
        uri, [{ resize: { width: 1024 } }], 
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      setBase64Image(manipulated.base64 || null);
    }
  };

  const handleSend = async (text: string) => {
    if ((!text.trim() && !base64Image) || !id) return;

    const userMessageId = Crypto.randomUUID();
    const cleanText = text.trim() || "Please analyze this attached report and update my agronomy profile.";
    
    setMessages(prev => [...prev, { id: userMessageId, sender: 'user', text: cleanText }]);
    setInputText('');
    setIsTyping(true);
    
    db.runSync('INSERT INTO messages (id, session_id, sender, content) VALUES (?, ?, ?, ?)', [userMessageId, id, 'user', cleanText]);
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const formattedHistory = messages.filter(m => m.id !== '1').map(m => ({ role: m.sender === 'ai' ? 'assistant' : 'user', content: m.text }));

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
- Crop Age: ${cultivationData.age ? `${cultivationData.age} years` : 'Not provided'}
- Plant Spacing: ${cultivationData.spacing || 'Not provided'}
- Current Season: ${cultivationData.season || 'Not provided'}
- Annual Rainfall: ${cultivationData.rainfall ? `${cultivationData.rainfall} mm` : 'Not provided'}
- Elevation: ${cultivationData.elevation ? `${cultivationData.elevation} m` : 'Not provided'}
- Soil pH: ${cultivationData.ph || 'Not provided'}

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
      className="flex-1 bg-[#F5F1E7]" 
    >
      <Stack.Screen options={{ headerShown: false }} />      
      
      <View 
        className="flex-row items-center justify-between px-5 pb-4 bg-white shadow-sm z-10 border-b border-gray-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center flex-1 mr-3">
          <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 rounded-full items-center justify-center bg-gray-50 mr-3 border border-gray-100 active:bg-gray-100">
            <Feather name="arrow-left" size={18} color="#0F172A" />
          </TouchableOpacity>
          <View className="w-3 h-3 rounded-full mr-2.5 shadow-sm" style={{ backgroundColor: plantMetadata.color }} />
          <Text className="text-[17px] font-extrabold text-[#0F172A] flex-1 tracking-tight" numberOfLines={1}>
            {plantMetadata.name}
          </Text>
        </View>

        <TouchableOpacity onPress={confirmDelete} className="w-10 h-10 rounded-full items-center justify-center bg-rose-50 border border-rose-100 active:bg-rose-100">
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
          className="flex-1 px-4" 
          contentContainerStyle={{ paddingTop: 20, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {messages.map((msg) => (
            <Animated.View key={msg.id} entering={FadeInUp.springify().damping(20)} layout={Layout.springify()} className={`mb-6 w-full ${msg.sender === 'ai' ? 'flex-row items-start' : 'items-end'}`}>
              {msg.sender === 'ai' ? (
                  <>
                    <AnimatedBotAvatar color={plantMetadata.color} isTyping={false} />
                    <View className="flex-1 bg-white px-5 py-3.5 rounded-[24px] rounded-tl-sm shadow-sm border border-gray-100 ml-1">
                      <Markdown style={markdownStyles}>{msg.text}</Markdown>
                    </View>
                  </>
                ) : (
                <View className="max-w-[82%] bg-[#2D4530] px-5 py-3.5 rounded-[24px] rounded-tr-sm shadow-sm shadow-black/10">
                  <Markdown style={userMarkdownStyles}>{msg.text}</Markdown>
                </View>
              )}
            </Animated.View>
          ))}

          {/* Typing Indicator */}
          {isTyping && (
            <Animated.View entering={FadeInUp.duration(300)} exiting={FadeOutDown.duration(300)} className="flex-row items-start mb-6">
              <AnimatedBotAvatar color={plantMetadata.color} isTyping={true} />
              <View className="bg-white px-4 py-3.5 rounded-[20px] rounded-tl-sm shadow-sm border border-gray-100 ml-1 justify-center">
                <TypingDots color="#94A3B8" />
              </View>
            </Animated.View>
          )}
        </ScrollView>

        <View className="px-4 pt-2 bg-transparent" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
          
          {selectedImage && (
            <Animated.View entering={FadeInUp.duration(200)} className="flex-row items-center mb-3 bg-white p-2.5 rounded-2xl shadow-md border border-gray-100 self-start ml-2">
              <Image source={{ uri: selectedImage }} className="w-10 h-10 rounded-lg bg-gray-100 mr-3" />
              <View className="mr-5">
                <Text className="text-[13px] font-bold text-[#1E293B]">Report Attached</Text>
                <Text className="text-[11px] text-[#64748B]">Ready to analyze</Text>
              </View>
              <TouchableOpacity 
                onPress={() => { setSelectedImage(null); setBase64Image(null); }}
                className="w-7 h-7 rounded-full bg-rose-50 items-center justify-center border border-rose-100"
              >
                <Feather name="x" size={14} color="#E11D48" />
              </TouchableOpacity>
            </Animated.View>
          )}

          <View className="flex-row items-end bg-white rounded-[32px] pl-3 pr-2 py-2 shadow-xl shadow-black/10 border border-gray-200/50 mb-2">
            
            <TouchableOpacity 
              onPress={() => setShowDataForm(true)} 
              disabled={isTyping}
              className="w-10 h-10 rounded-full items-center justify-center bg-gray-50 mr-1 active:bg-gray-100 mb-0.5"
            >
              <MaterialCommunityIcons name="leaf-circle-outline" size={22} color="#64748B" />
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={handleAttachImage} 
              disabled={isTyping}
              className="w-10 h-10 rounded-full items-center justify-center bg-gray-50 mr-2 active:bg-gray-100 mb-0.5"
            >
              <Feather name="camera" size={19} color="#64748B" />
            </TouchableOpacity>

            <TextInput 
              className="flex-1 max-h-32 text-[16px] text-[#0F172A] pt-3 pb-3 font-medium"
              placeholder="Message CinnLLM..." 
              placeholderTextColor="#94A3B8" 
              multiline 
              value={inputText} 
              onChangeText={setInputText}
            />
            
            <TouchableOpacity 
              onPress={() => handleSend(inputText)} 
              disabled={!isSendActive} 
              className="w-11 h-11 rounded-full items-center justify-center ml-2 mb-0.5"
              style={{
                backgroundColor: isSendActive ? '#2D4530' : '#F3F4F6',
                shadowColor: isSendActive ? '#2D4530' : 'transparent',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isSendActive ? 0.3 : 0,
                shadowRadius: 4,
                elevation: isSendActive ? 4 : 0,
              }}
            >
              <Feather name="arrow-up" size={20} color={isSendActive ? '#FFFFFF' : '#94A3B8'} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showDataForm} transparent animationType="slide">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          className="flex-1 justify-end bg-slate-900/40"
        >
          <View className="bg-white rounded-t-[36px] overflow-hidden max-h-[90%] shadow-2xl">
            <View className="flex-row justify-between items-center p-6 border-b border-gray-100">
              <View className="flex-row items-center">
                <View className="w-10 h-10 bg-green-50 rounded-full items-center justify-center mr-3 border border-green-100">
                  <MaterialCommunityIcons name="clipboard-text-outline" size={20} color="#2D4530" />
                </View>
                <Text className="text-[20px] font-extrabold text-[#0F172A]">Field Data</Text>
              </View>
              <Pressable onPress={() => setShowDataForm(false)} className="w-10 h-10 items-center justify-center bg-gray-50 rounded-full active:bg-gray-100">
                <Feather name="x" size={20} color="#64748B" />
              </Pressable>
            </View>

            <ScrollView 
              contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View className="flex-row justify-between mb-5">
                <View className="w-[48%]">
                  <Text className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2 ml-1">Age of Crop</Text>
                  <TextInput 
                    value={cultivationData.age}
                    onChangeText={(val) => setCultivationData({...cultivationData, age: val})}
                    keyboardType="numeric"
                    placeholder="e.g. 3"
                    placeholderTextColor="#CBD5E1"
                    className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-[#0F172A] font-semibold text-base"
                  />
                </View>
                <View className="w-[48%]">
                  <Text className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2 ml-1">Spacing</Text>
                  <TextInput 
                    value={cultivationData.spacing}
                    onChangeText={(val) => setCultivationData({...cultivationData, spacing: val})}
                    placeholder="e.g. 4x3_ft"
                    placeholderTextColor="#CBD5E1"
                    className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-[#0F172A] font-semibold text-base"
                  />
                </View>
              </View>

              <View className="flex-row justify-between mb-5">
                <View className="w-[48%]">
                  <Text className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2 ml-1">Season</Text>
                  <TextInput 
                    value={cultivationData.season}
                    onChangeText={(val) => setCultivationData({...cultivationData, season: val})}
                    placeholder="Yala/Maha"
                    placeholderTextColor="#CBD5E1"
                    className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-[#0F172A] font-semibold text-base"
                  />
                </View>
                <View className="w-[48%]">
                  <Text className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2 ml-1">Rainfall</Text>
                  <TextInput 
                    value={cultivationData.rainfall}
                    onChangeText={(val) => setCultivationData({...cultivationData, rainfall: val})}
                    keyboardType="numeric"
                    placeholder="mm/year"
                    placeholderTextColor="#CBD5E1"
                    className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-[#0F172A] font-semibold text-base"
                  />
                </View>
              </View>

              <View className="flex-row justify-between mb-8">
                <View className="w-[48%]">
                  <Text className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2 ml-1">Elevation</Text>
                  <TextInput 
                    value={cultivationData.elevation}
                    onChangeText={(val) => setCultivationData({...cultivationData, elevation: val})}
                    keyboardType="numeric"
                    placeholder="meters"
                    placeholderTextColor="#CBD5E1"
                    className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-[#0F172A] font-semibold text-base"
                  />
                </View>
                <View className="w-[48%]">
                  <Text className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2 ml-1">Soil pH</Text>
                  <TextInput 
                    value={cultivationData.ph}
                    onChangeText={(val) => setCultivationData({...cultivationData, ph: val})}
                    keyboardType="numeric"
                    placeholder="e.g. 5.5"
                    placeholderTextColor="#CBD5E1"
                    className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-[#0F172A] font-semibold text-base"
                  />
                </View>
              </View>

              <TouchableOpacity 
                onPress={handleDataSubmit}
                activeOpacity={0.8}
                className="bg-[#2D4530] w-full py-4 rounded-2xl items-center shadow-lg shadow-[#2D4530]/30"
              >
                <Text className="text-white font-bold text-[16px] tracking-wide">Generate Plan</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ImageBackground>
  );
}
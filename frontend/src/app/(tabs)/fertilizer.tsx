import React, { useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  Alert, 
  StyleSheet 
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { router, useFocusEffect } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface PlantChat {
  id: string;
  name: string;
  color: string;
}

const safeShadow = {
  elevation: 2,
  shadowColor: '#2C402E',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
};

export default function FertilizerTab() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [chats, setChats] = useState<PlantChat[]>([]);

  const loadChats = useCallback(() => {
    const data = db.getAllSync<PlantChat>(
      'SELECT id, name, color FROM plants ORDER BY created_at DESC'
    );
    setChats(data);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      loadChats();
    }, [loadChats])
  );

  const handleDeleteChat = (chatId: string, chatName: string) => {
    Alert.alert(
      'Delete Plot Chat',
      `Delete "${chatName}" and all saved messages?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            db.runSync('DELETE FROM messages WHERE session_id = ?', [chatId]);
            db.runSync('DELETE FROM plants WHERE id = ?', [chatId]);
            loadChats();
          },
        },
      ]
    );
  };

  return (
    <View className="flex-1 bg-[#F0F4F1]" style={{ paddingTop: insets.top + 16 }}>
      
      <View className="px-6 mb-5 flex-row justify-between items-center">
        <View>
          <View className="flex-row items-center space-x-1.5 mb-1">
            <MaterialCommunityIcons name="sprout" size={20} color="#3E5C41" />
            <Text className="text-xs font-bold uppercase tracking-wider text-[#3E5C41]">
              Plot Agronomist
            </Text>
          </View>
          <Text className="text-3xl font-extrabold text-[#1F3021] tracking-tight">
            CinnLLM Advisor
          </Text>
        </View>

        <TouchableOpacity 
          onPress={() => router.push('/new-chat')}
          activeOpacity={0.8}
          style={safeShadow}
          className="bg-[#2D4530] px-4 py-3 rounded-2xl flex-row items-center border border-[#3E5C41]/30"
        >
          <Feather name="plus" size={18} color="#FFFFFF" />
          <Text className="text-white font-bold ml-1.5 text-sm">New Plot</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        className="flex-1 px-6" 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <View 
          style={safeShadow}
          className="bg-[#E4ECE1] p-5 rounded-3xl border border-[#CBDBC7] mb-6 relative overflow-hidden"
        >
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center bg-[#D3E3CE] px-3 py-1 rounded-full">
              <MaterialCommunityIcons name="leaf" size={14} color="#2D4530" />
              <Text className="text-[#2D4530] text-xs font-bold ml-1">Cultivation Assistant</Text>
            </View>
            <Text className="text-xs font-semibold text-[#577259]">
              {chats.length} {chats.length === 1 ? 'Plot' : 'Plots'} Tracked
            </Text>
          </View>

          <Text className="text-lg font-extrabold text-[#1F3021] mt-1 mb-1">
            Real-Time Crop Advisory
          </Text>
          <Text className="text-[#4F6851] text-xs leading-5">
            Query fertilizer split-dosages, cinnamon pest management, stem canker protocols, and harvesting maturity indicators.
          </Text>
        </View>

        <View className="flex-row items-center justify-between mb-3 px-1">
          <Text className="text-xs font-bold text-[#768C73] uppercase tracking-wider">
            Your Plot Sessions
          </Text>
        </View>

        {chats.length === 0 ? (
          <View 
            style={safeShadow}
            className="bg-white rounded-3xl p-8 items-center border border-[#E8E6DD] mt-2 text-center"
          >
            <View className="w-16 h-16 rounded-full bg-[#EBF3E8] items-center justify-center mb-4">
              <MaterialCommunityIcons name="tree-outline" size={32} color="#3E5C41" />
            </View>
            
            <Text className="text-lg font-bold text-[#1F3021] text-center">
              No Plots Configured Yet
            </Text>
            
            <Text className="text-[#768C73] text-center mt-1.5 text-xs leading-5 max-w-[240px]">
              Set up your first cinnamon plot or nursery to get customized AI agronomic advice.
            </Text>

            <TouchableOpacity
              onPress={() => router.push('/new-chat')}
              activeOpacity={0.8}
              className="mt-5 bg-[#3E5C41] px-5 py-3 rounded-xl flex-row items-center"
            >
              <Feather name="plus-circle" size={16} color="#FFFFFF" />
              <Text className="text-white text-xs font-bold ml-2">Start First Plot Chat</Text>
            </TouchableOpacity>
          </View>
        ) : (
          chats.map((chat, index) => (
            <Animated.View 
              key={chat.id} 
              entering={FadeInDown.delay(index * 60).springify()}
            >
              <View 
                style={safeShadow}
                className="bg-white rounded-2xl mb-3.5 border border-[#E8E6DD] overflow-hidden flex-row"
              >
                <View style={{ width: 6, backgroundColor: chat.color || '#3E5C41' }} />

                <TouchableOpacity 
                  onPress={() => router.push(`/chat/${chat.id}`)}
                  activeOpacity={0.7}
                  className="flex-row items-center flex-1 p-4"
                >
                  <View 
                    className="w-12 h-12 rounded-xl items-center justify-center mr-3.5"
                    style={{ backgroundColor: `${chat.color}15` || '#EBF3E8' }}
                  >
                    <MaterialCommunityIcons 
                      name="sprout" 
                      size={24} 
                      color={chat.color || '#3E5C41'} 
                    />
                  </View>

                  <View className="flex-1 mr-2">
                    <Text className="text-[16px] font-extrabold text-[#1F3021]" numberOfLines={1}>
                      {chat.name}
                    </Text>
                    
                    <View className="flex-row items-center mt-1">
                      <View className="w-2 h-2 rounded-full bg-[#10B981] mr-1.5" />
                      <Text className="text-[#768C73] text-xs font-medium">
                        Active Plot Advisory
                      </Text>
                    </View>
                  </View>

                  <Feather name="chevron-right" size={20} color="#A3B5A0" />
                </TouchableOpacity>

                <TouchableOpacity 
                  onPress={() => handleDeleteChat(chat.id, chat.name)}
                  activeOpacity={0.6}
                  className="px-3.5 items-center justify-center border-l border-[#F0EFE8] bg-[#FAF9F5]"
                >
                  <Feather name="trash-2" size={16} color="#B0A8A0" />
                </TouchableOpacity>
              </View>
            </Animated.View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
import React, { useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  Modal,
  Pressable
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

const premiumShadow = {
  elevation: 6,
  shadowColor: '#047857', 
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.15,
  shadowRadius: 12,
};

const softShadow = {
  elevation: 2,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 4,
};

export default function FertilizerTab() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [chats, setChats] = useState<PlantChat[]>([]);  
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<{id: string, name: string} | null>(null);

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

  const promptDeleteChat = (chatId: string, chatName: string) => {
    setChatToDelete({ id: chatId, name: chatName });
    setDeleteModalVisible(true);
  };

  const confirmDelete = () => {
    if (chatToDelete) {
      db.runSync('DELETE FROM messages WHERE session_id = ?', [chatToDelete.id]);
      db.runSync('DELETE FROM plants WHERE id = ?', [chatToDelete.id]);
      loadChats();
    }
    setDeleteModalVisible(false);
    setChatToDelete(null);
  };

  return (
    <View className="flex-1 bg-[#F8FAFC]" style={{ paddingTop: insets.top + 16 }}>
      
      <ScrollView 
        className="flex-1 px-5" 
        showsVerticalScrollIndicator={true}
        indicatorStyle="default"
        contentContainerStyle={{ paddingBottom: 50 }}
      >
        <View style={premiumShadow} className="bg-emerald-600 rounded-3xl p-6 mb-6 overflow-hidden relative">
          <MaterialCommunityIcons 
            name="sprout" 
            size={160} 
            color="#FFFFFF" 
            style={{ position: 'absolute', right: -30, top: -20, opacity: 0.15, zIndex: 0, transform: [{ rotate: '15deg' }] }} 
          />
          
          <View className="relative z-10">
            <View className="flex-row items-center mb-3">
              <View className="bg-white/20 px-3 py-1.5 rounded-lg flex-row items-center">
                <MaterialCommunityIcons name="leaf" size={14} color="white" />
                <Text className="text-white text-xs font-bold uppercase tracking-widest ml-1.5">Plot Agronomist</Text>
              </View>
            </View>
            <Text className="text-white text-3xl font-bold mb-1 tracking-tight">CinnLLM Advisor</Text>
            <Text className="text-emerald-100 text-sm font-medium leading-relaxed" style={{ width: '90%' }}>
              Your AI assistant for fertilizer dosages, pest management, disease, harvest protocols and all things cinnamon related.
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          onPress={() => router.push('/new-chat')}
          activeOpacity={0.8}
          style={premiumShadow}
          className="bg-emerald-500 rounded-2xl p-4 flex-row items-center mb-8"
        >
          <View className="bg-white/20 p-3 rounded-xl mr-4">
            <Feather name="plus" size={28} color="white" />
          </View>
          <View className="flex-1">
            <Text className="text-white font-extrabold text-lg">Create New Plot</Text>
            <Text className="text-emerald-100 text-xs font-medium mt-0.5">Start a fresh advisory session</Text>
          </View>
          <Feather name="chevron-right" size={24} color="white" opacity={0.6} />
        </TouchableOpacity>

        <View className="flex-row justify-between items-end mb-4 mx-1">
          <Text className="text-lg font-extrabold text-slate-800">Active Sessions</Text>
          {chats.length > 0 && (
            <Text className="text-slate-500 font-bold text-sm">
              {chats.length} {chats.length === 1 ? 'Plot' : 'Plots'}
            </Text>
          )}
        </View>

        {chats.length === 0 ? (
          <View style={softShadow} className="bg-white rounded-3xl p-8 items-center border border-slate-100 mt-2 text-center">
            <View className="w-20 h-20 rounded-full bg-slate-50 items-center justify-center mb-5">
              <MaterialCommunityIcons name="tree-outline" size={40} color="#94A3B8" />
            </View>
            
            <Text className="text-xl font-extrabold text-slate-800 text-center mb-2">
              No Plots Configured
            </Text>
            
            <Text className="text-slate-500 text-center text-sm font-medium leading-relaxed max-w-[260px]">
              Set up your first cinnamon plot or nursery to start receiving customized AI agronomic advice.
            </Text>
          </View>
        ) : (
          chats.map((chat, index) => (
            <Animated.View 
              key={chat.id} 
              entering={FadeInDown.delay(index * 60).springify()}
            >
              <View 
                style={softShadow}
                className="bg-white rounded-2xl mb-4 border border-slate-100 overflow-hidden flex-row"
              >
                <View style={{ width: 6, backgroundColor: chat.color || '#10B981' }} />

                <TouchableOpacity 
                  onPress={() => router.push(`/chat/${chat.id}`)}
                  activeOpacity={0.7}
                  className="flex-row items-center flex-1 p-4"
                >
                  <View 
                    className="w-14 h-14 rounded-xl items-center justify-center mr-4"
                    style={{ backgroundColor: `${chat.color}15` || '#ECFDF5' }}
                  >
                    <MaterialCommunityIcons 
                      name="sprout" 
                      size={28} 
                      color={chat.color || '#10B981'} 
                    />
                  </View>

                  <View className="flex-1 mr-2">
                    <Text className="text-[17px] font-extrabold text-slate-800 mb-0.5" numberOfLines={1}>
                      {chat.name}
                    </Text>
                    
                    <View className="flex-row items-center">
                      <View className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
                      <Text className="text-slate-500 text-xs font-bold">
                        Active Plot Advisory
                      </Text>
                    </View>
                  </View>

                  <Feather name="chevron-right" size={24} color="#CBD5E1" />
                </TouchableOpacity>

                <TouchableOpacity 
                  onPress={() => promptDeleteChat(chat.id, chat.name)}
                  activeOpacity={0.6}
                  className="px-4 items-center justify-center border-l border-slate-100 bg-slate-50"
                >
                  <Feather name="trash-2" size={20} color="#F43F5E" />
                </TouchableOpacity>
              </View>
            </Animated.View>
          ))
        )}
      </ScrollView>

      <Modal 
        transparent 
        visible={deleteModalVisible} 
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View className="flex-1 bg-slate-900/60 items-center justify-center px-6 backdrop-blur-sm">
          <View className="bg-white rounded-3xl p-6 w-full items-center" style={premiumShadow}>
            
            <View className="bg-rose-50 w-20 h-20 rounded-full items-center justify-center mb-4">
              <Feather name="trash-2" size={36} color="#F43F5E" />
            </View>
            
            <Text className="text-2xl font-extrabold text-slate-800 mb-2 text-center">
              Delete Plot?
            </Text>
            
            <Text className="text-slate-500 text-center leading-relaxed mb-8 text-sm font-medium px-2">
              Are you sure you want to delete <Text className="text-slate-700 font-bold">"{chatToDelete?.name}"</Text>? All chat history and recommendations will be permanently lost.
            </Text>
            
            <View className="flex-row w-full space-x-3">
              <TouchableOpacity
                onPress={() => setDeleteModalVisible(false)}
                activeOpacity={0.7}
                className="flex-1 bg-slate-100 py-4 rounded-xl items-center"
              >
                <Text className="text-slate-600 font-extrabold text-base">Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={confirmDelete}
                activeOpacity={0.8}
                className="flex-1 bg-rose-500 py-4 rounded-xl items-center shadow-sm"
              >
                <Text className="text-white font-extrabold text-base">Delete</Text>
              </TouchableOpacity>
            </View>
            
          </View>
        </View>
      </Modal>

    </View>
  );
}
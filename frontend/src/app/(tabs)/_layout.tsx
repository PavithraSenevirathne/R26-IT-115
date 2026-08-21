import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs 
      screenOptions={{ 
        headerShown: false, 
        tabBarActiveTintColor: '#047857', 
        tabBarInactiveTintColor: '#8A9A86', 
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E8E6DD',
          // Dynamically adjust height and padding based on the phone's bottom bar
          height: 60 + insets.bottom, 
          paddingBottom: Math.max(insets.bottom, 10), 
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontWeight: 'bold',
          fontSize: 10,
        }
      }}
    >
      <Tabs.Screen 
        name="index" 
        options={{ 
          title: 'Disease',
          tabBarIcon: ({ color }) => <Feather name="shield" size={24} color={color} />
        }} 
      />
      <Tabs.Screen 
        name="pest" 
        options={{ 
          title: 'Pests',
          tabBarIcon: ({ color }) => <Feather name="target" size={24} color={color} />
        }} 
      />
      <Tabs.Screen 
        name="fertilizer" 
        options={{ 
          title: 'Fertilizer',
          tabBarIcon: ({ color }) => <Feather name="message-circle" size={24} color={color} />
        }} 
      />
      <Tabs.Screen 
        name="harvest" 
        options={{ 
          title: 'Harvest',
          tabBarIcon: ({ color }) => <Feather name="scissors" size={24} color={color} />
        }} 
      />
    </Tabs>
  );
}
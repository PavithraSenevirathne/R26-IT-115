import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs 
      screenOptions={{ 
        headerShown: false, 
        tabBarActiveTintColor: '#10B981',
        tabBarInactiveTintColor: '#64748B',
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: '#0F172A',
          borderTopWidth: 0,
          elevation: 16,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -4 },
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          shadowOpacity: 0.2,
          shadowRadius: 10,
          height: 65 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 10),
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontWeight: '800',
          fontSize: 10,
          marginTop: 3,
          letterSpacing: 0.3,
        }
      }}
    >
      <Tabs.Screen 
        name="index" 
        options={{ 
          title: 'Disease',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons name={focused ? "shield" : "shield-outline"} size={26} color={color} />
          )
        }} 
      />
      <Tabs.Screen 
        name="pest" 
        options={{ 
          title: 'Pests',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons name={focused ? "bug" : "bug-outline"} size={26} color={color} />
          )
        }} 
      />
      <Tabs.Screen 
        name="fertilizer" 
        options={{ 
          title: 'Fertilizer',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons name={focused ? "sprout" : "sprout-outline"} size={26} color={color} />
          )
        }} 
      />
      <Tabs.Screen 
        name="harvest" 
        options={{ 
          title: 'Harvest',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons name={focused ? "tree" : "tree-outline"} size={26} color={color} />
          )
        }} 
      />
    </Tabs>
  );
}
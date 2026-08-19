import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#047857' }}>
      <Tabs.Screen name="index" options={{ title: 'Disease' }} />
      <Tabs.Screen name="pests" options={{ title: 'Pests' }} />
      <Tabs.Screen name="fertilizer" options={{ title: 'Fertilizer' }} />
      <Tabs.Screen name="harvest" options={{ title: 'Harvest' }} />
    </Tabs>
  );
}
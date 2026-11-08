import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/lib/theme';

const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: any; size: number }) => <Ionicons name={name} color={color ?? undefined} size={size} />;

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.subtle,
      tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
      headerStyle: { backgroundColor: c.surface }, headerTintColor: c.text, headerShadowVisible: false,
    }}>
      <Tabs.Screen name="index" options={{ title: 'Map', headerShown: false, tabBarIcon: icon('map-outline') }} />
      <Tabs.Screen name="nearby" options={{ title: 'Nearby', tabBarIcon: icon('list-outline') }} />
      <Tabs.Screen name="route" options={{ title: 'Route', tabBarIcon: icon('git-branch-outline') }} />
      <Tabs.Screen name="saved" options={{ title: 'Saved', tabBarIcon: icon('heart-outline') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person-circle-outline') }} />
    </Tabs>
  );
}

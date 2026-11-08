import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/lib/auth';
import { RealtimeProvider } from '@/lib/realtime';
import { useColors, useIsDark } from '@/lib/theme';

function Root() {
  const c = useColors();
  const dark = useIsDark();
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerStyle: { backgroundColor: c.surface }, headerTintColor: c.text, headerShadowVisible: false, contentStyle: { backgroundColor: c.bg }, headerBackTitle: 'Back' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="station/[id]" options={{ title: 'Station' }} />
        <Stack.Screen name="checkin/[id]" options={{ title: 'Check in', presentation: 'modal' }} />
        <Stack.Screen name="session/[id]" options={{ title: 'Charging session' }} />
        <Stack.Screen name="login" options={{ title: 'Sign in', presentation: 'modal' }} />
        <Stack.Screen name="history" options={{ title: 'Charging history' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="add-station" options={{ title: 'Add a station' }} />
        <Stack.Screen name="vehicle" options={{ title: 'My vehicle' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RealtimeProvider>
          <Root />
        </RealtimeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

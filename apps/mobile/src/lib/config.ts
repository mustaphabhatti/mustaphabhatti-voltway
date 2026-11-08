import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Voltway API base URL. Set EXPO_PUBLIC_API_URL; falls back to the dev machine for emulators. */
export const API_URL: string = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as any)?.apiUrl ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000')
).replace(/\/$/, '');

export const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';

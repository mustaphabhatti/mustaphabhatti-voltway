import type { ExpoConfig } from 'expo/config';

// Values come from environment variables so no secrets are committed.
//   EXPO_PUBLIC_API_URL            Wattly API base (e.g. https://api.wattly.example). Android emulator: http://10.0.2.2:4000
//   GOOGLE_MAPS_ANDROID_API_KEY    Google Maps SDK for Android key (required for maps in Android builds)
//   GOOGLE_MAPS_IOS_API_KEY        Optional — iOS uses Apple Maps by default
const config: ExpoConfig = {
  name: 'Wattly Drive',
  slug: 'wattly-drive',
  scheme: 'wattly',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.wattly.drive',
    supportsTablet: true,
    config: process.env.GOOGLE_MAPS_IOS_API_KEY ? { googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY } : undefined,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'Wattly Drive uses your location to show nearby chargers, distances and drive times.',
      NSCameraUsageDescription: 'Take photos of charging stations for other drivers.',
      NSPhotoLibraryUsageDescription: 'Attach photos of charging stations to your check-ins.',
    },
  },
  android: {
    package: 'com.wattly.drive',
    adaptiveIcon: { foregroundImage: './assets/android-icon-foreground.png', monochromeImage: './assets/android-icon-monochrome.png', backgroundColor: '#0fa968' },
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'POST_NOTIFICATIONS'],
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '' } },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    ['expo-location', { locationWhenInUsePermission: 'Wattly Drive uses your location to show nearby chargers, distances and drive times.' }],
    ['expo-notifications', { color: '#0fa968' }],
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 200, backgroundColor: '#ffffff', dark: { image: './assets/splash-icon.png', backgroundColor: '#0b0e12' } }],
  ],
  experiments: { typedRoutes: true },
  extra: { apiUrl: process.env.EXPO_PUBLIC_API_URL ?? null },
};

export default config;

import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';

/** Hand off turn-by-turn navigation to the driver's preferred app. */
export function openDirections(lat: number, lng: number, label: string) {
  const google = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  const apple = `maps://?daddr=${lat},${lng}&q=${encodeURIComponent(label)}`;
  const waze = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Apple Maps', 'Google Maps', 'Waze', 'Cancel'], cancelButtonIndex: 3, title: `Directions to ${label}` },
      (i) => { const url = [apple, google, waze][i]; if (url) Linking.openURL(url); },
    );
  } else {
    Alert.alert(`Directions to ${label}`, undefined, [
      { text: 'Google Maps', onPress: () => Linking.openURL(`google.navigation:q=${lat},${lng}`).catch(() => Linking.openURL(google)) },
      { text: 'Waze', onPress: () => Linking.openURL(waze) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
}

export function openRouteInGoogleMaps(from: { lat: number; lng: number }, to: { lat: number; lng: number }, stops: { lat: number; lng: number }[]) {
  const wp = stops.length ? `&waypoints=${stops.map((s) => `${s.lat},${s.lng}`).join('|')}` : '';
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving${wp}`);
}

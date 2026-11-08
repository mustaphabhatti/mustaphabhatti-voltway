import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

export const DEFAULT_CENTER = { lat: 31.5204, lng: 74.3587 }; // Lahore (demo region)

export function useLocation() {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'granted' | 'denied' | 'loading'>('idle');
  const request = useCallback(async () => {
    setStatus('loading');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { setStatus('denied'); return; }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
      setStatus('granted');
    } catch {
      setStatus('denied');
    }
  }, []);
  useEffect(() => { request(); }, [request]);
  return { position, status, request, center: position ?? DEFAULT_CENTER, isFallback: !position };
}

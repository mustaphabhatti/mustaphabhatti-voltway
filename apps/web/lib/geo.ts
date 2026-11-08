'use client';
import { useCallback, useEffect, useState } from 'react';

export interface GeoState {
  position: { lat: number; lng: number } | null;
  status: 'idle' | 'prompt' | 'granted' | 'denied' | 'unavailable' | 'loading';
  accuracy: number | null;
  isFallback: boolean;
}

export const DEFAULT_CENTER = { lat: 31.5204, lng: 74.3587 }; // Lahore (demo region)

/** Browser geolocation with explicit permission handling and a demo-city fallback. */
export function useGeolocation(auto = true) {
  const [state, setState] = useState<GeoState>({ position: null, status: 'idle', accuracy: null, isFallback: false });

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ position: DEFAULT_CENTER, status: 'unavailable', accuracy: null, isFallback: true });
      return;
    }
    setState((s) => ({ ...s, status: 'loading' }));
    navigator.geolocation.getCurrentPosition(
      (p) => setState({ position: { lat: p.coords.latitude, lng: p.coords.longitude }, status: 'granted', accuracy: p.coords.accuracy, isFallback: false }),
      (err) => setState({ position: DEFAULT_CENTER, status: err.code === 1 ? 'denied' : 'unavailable', accuracy: null, isFallback: true }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }, []);

  useEffect(() => {
    if (!auto) return;
    let cancelled = false;
    (async () => {
      try {
        const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
        if (cancelled) return;
        if (perm?.state === 'granted') return request();
        if (perm?.state === 'denied') return setState({ position: DEFAULT_CENTER, status: 'denied', accuracy: null, isFallback: true });
        setState({ position: DEFAULT_CENTER, status: 'prompt', accuracy: null, isFallback: true });
      } catch {
        request();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auto, request]);

  return { ...state, request };
}

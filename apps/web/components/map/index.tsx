'use client';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui';

/** Leaflet touches `window`, so the map is client-only. */
export const Map = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});
export type { MapRoute, MapStop } from './MapView';

import type { LatLng } from '@wattly/shared';

export type TrafficLevel = 'light' | 'moderate' | 'heavy' | 'unknown';

export interface RouteStep {
  instruction: string;
  distanceKm: number;
  durationMin: number;
}

export interface RouteResult {
  provider: 'mapbox' | 'osrm' | 'offline';
  distanceKm: number;
  /** Duration including traffic when the provider supports it. */
  durationMin: number;
  /** Duration without traffic (free-flow / typical). */
  baseDurationMin: number;
  geometry: LatLng[];
  steps: RouteStep[];
  summary: string;
  traffic: { level: TrafficLevel; delayMin: number; source: 'live' | 'estimated' | 'none' };
  /** true when the geometry is an approximation (offline fallback). */
  approximate: boolean;
}

export interface RouteRequest {
  from: LatLng;
  to: LatLng;
  alternatives?: boolean;
  departAt?: Date;
}

export interface RoutingProvider {
  name: RouteResult['provider'];
  route(req: RouteRequest): Promise<RouteResult[]>;
}

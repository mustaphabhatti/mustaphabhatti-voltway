import { decodePolyline } from '@voltway/shared';
import { config } from '../../config';
import { fetchJson } from '../health';
import { levelFromDelay } from './traffic';
import type { RouteRequest, RouteResult, RoutingProvider } from './types';

/** Mapbox Directions API with the `driving-traffic` profile → live traffic. */
export const mapboxProvider: RoutingProvider = {
  name: 'mapbox',
  async route(req: RouteRequest): Promise<RouteResult[]> {
    const coords = `${req.from.lng},${req.from.lat};${req.to.lng},${req.to.lat}`;
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}` +
      `?alternatives=${req.alternatives ? 'true' : 'false'}&geometries=polyline&overview=full&steps=true&access_token=${config.mapboxToken}`;
    const data = await fetchJson<any>(url, { timeoutMs: config.externalTimeoutMs });
    if (data.code !== 'Ok') throw new Error(`Mapbox: ${data.code} ${data.message ?? ''}`);
    return data.routes.map((r: any): RouteResult => {
      const typical = (r.duration_typical ?? r.duration) / 60;
      const dur = r.duration / 60;
      return {
        provider: 'mapbox',
        distanceKm: r.distance / 1000,
        durationMin: dur,
        baseDurationMin: typical,
        geometry: decodePolyline(r.geometry),
        steps: r.legs.flatMap((l: any) =>
          l.steps.map((s: any) => ({ instruction: s.maneuver?.instruction ?? '', distanceKm: s.distance / 1000, durationMin: s.duration / 60 })),
        ),
        summary: r.legs.map((l: any) => l.summary).filter(Boolean).join(', ') || 'Fastest route',
        traffic: { level: levelFromDelay(typical, dur), delayMin: Math.max(0, dur - typical), source: 'live' },
        approximate: false,
      };
    });
  },
};

import { config } from '../../config';
import { reportError, reportOk } from '../health';
import { mapboxProvider } from './mapbox';
import { offlineProvider } from './offline';
import { osrmProvider } from './osrm';
import type { RouteRequest, RouteResult, RoutingProvider } from './types';

export * from './types';

function chain(): RoutingProvider[] {
  switch (config.routingProvider) {
    case 'mapbox': return [mapboxProvider, offlineProvider];
    case 'osrm': return [osrmProvider, offlineProvider];
    case 'offline': return [offlineProvider];
    default: return [...(config.mapboxToken ? [mapboxProvider] : []), osrmProvider, offlineProvider];
  }
}

const cache = new Map<string, { at: number; value: RouteResult[] }>();
// Skip providers that just failed, so a blocked network does not slow every request.
const cooldown = new Map<string, number>();

export async function getRoutes(req: RouteRequest): Promise<RouteResult[]> {
  const key = [req.from.lat, req.from.lng, req.to.lat, req.to.lng].map((n) => n.toFixed(4)).join(',') + (req.alternatives ? 'a' : '');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value;
  let lastErr: unknown;
  for (const p of chain()) {
    if ((cooldown.get(p.name) ?? 0) > Date.now()) continue;
    try {
      const value = await p.route(req);
      if (!value.length) throw new Error('no route');
      reportOk(`routing:${p.name}`);
      cache.set(key, { at: Date.now(), value });
      if (cache.size > 500) cache.delete(cache.keys().next().value!);
      return value;
    } catch (e) {
      lastErr = e;
      reportError(`routing:${p.name}`, e);
      if (p.name !== 'offline') cooldown.set(p.name, Date.now() + 2 * 60_000);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Routing failed');
}

export function routingChainNames() {
  return chain().map((p) => p.name);
}

import { decodePolyline } from '@voltway/shared';
import { config } from '../../config';
import { fetchJson } from '../health';
import type { RouteRequest, RouteResult, RoutingProvider, RouteStep } from './types';

function instruction(step: any): string {
  const m = step.maneuver ?? {};
  const name = step.name ? ` onto ${step.name}` : '';
  switch (m.type) {
    case 'depart': return `Head ${m.modifier ?? 'out'}${step.name ? ` on ${step.name}` : ''}`;
    case 'arrive': return 'Arrive at destination';
    case 'roundabout':
    case 'rotary': return `At the roundabout, take exit ${m.exit ?? ''}${name}`.trim();
    case 'merge': return `Merge${name}`;
    case 'on ramp': return `Take the ramp${name}`;
    case 'off ramp': return `Take the exit${name}`;
    case 'fork': return `Keep ${m.modifier ?? 'straight'} at the fork${name}`;
    case 'end of road':
    case 'turn': return `Turn ${m.modifier ?? ''}${name}`.replace(/\s+/g, ' ');
    case 'continue':
    case 'new name': return `Continue${name}`;
    default: return `${m.type ?? 'Continue'} ${m.modifier ?? ''}${name}`.trim();
  }
}

export const osrmProvider: RoutingProvider = {
  name: 'osrm',
  async route(req: RouteRequest): Promise<RouteResult[]> {
    const coords = `${req.from.lng},${req.from.lat};${req.to.lng},${req.to.lat}`;
    const url = `${config.osrmUrl}/route/v1/driving/${coords}?overview=full&geometries=polyline&steps=true&alternatives=${req.alternatives ? 'true' : 'false'}`;
    const data = await fetchJson<any>(url, { timeoutMs: config.externalTimeoutMs });
    if (data.code !== 'Ok') throw new Error(`OSRM: ${data.code}`);
    return data.routes.map((r: any): RouteResult => {
      const steps: RouteStep[] = r.legs.flatMap((l: any) =>
        l.steps.map((s: any) => ({ instruction: instruction(s), distanceKm: s.distance / 1000, durationMin: s.duration / 60 })),
      );
      const names = r.legs.map((l: any) => l.summary).filter(Boolean).join(', ');
      return {
        provider: 'osrm',
        distanceKm: r.distance / 1000,
        durationMin: r.duration / 60,
        baseDurationMin: r.duration / 60,
        geometry: decodePolyline(r.geometry),
        steps,
        summary: names || 'Fastest route',
        traffic: { level: 'unknown', delayMin: 0, source: 'none' },
        approximate: false,
      };
    });
  },
};

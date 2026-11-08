// ─────────────────────────────────────────────────────────────────────────────
// Smart station recommendations: multi-criteria scoring.
// ─────────────────────────────────────────────────────────────────────────────

import type { CurrentType } from './types';

export type RecommendationMode = 'balanced' | 'closest' | 'fastest' | 'cheapest' | 'least_wait' | 'route';

export const RECOMMENDATION_MODES: Record<RecommendationMode, { label: string; description: string }> = {
  balanced: { label: 'Best overall', description: 'Balances total time, price, distance and reliability' },
  closest: { label: 'Closest', description: 'Shortest drive' },
  fastest: { label: 'Fastest to full', description: 'Lowest drive + wait + charge time' },
  cheapest: { label: 'Cheapest', description: 'Lowest estimated session cost' },
  least_wait: { label: 'Shortest wait', description: 'Most likely to have a free compatible port' },
  route: { label: 'On my route', description: 'Smallest detour from your route' },
};

export interface RecommendationCandidate {
  stationId: string;
  name: string;
  distanceKm: number;
  travelMinutes: number;
  compatiblePorts: number;
  availableCompatiblePorts: number;
  bestPowerKw: number;
  currentType: CurrentType;
  pricePerKwh: number;
  currency: string;
  estimatedWaitMinutes: number;
  chargeMinutes: number;
  chargeCost: number;
  detourKm?: number;
  /** true when availability data is live or recently reported */
  statusFresh: boolean;
  rating?: number | null;
  trafficLevel?: 'light' | 'moderate' | 'heavy' | 'unknown';
}

export interface ScoredRecommendation extends RecommendationCandidate {
  score: number;
  rank: number;
  totalMinutes: number;
  badges: string[];
  reasons: string[];
}

const WEIGHTS: Record<RecommendationMode, Partial<Record<Metric, number>>> = {
  balanced: { total: 0.35, cost: 0.25, distance: 0.15, wait: 0.1, reliability: 0.1, rating: 0.05 },
  closest: { distance: 0.7, total: 0.15, reliability: 0.15 },
  fastest: { total: 0.7, wait: 0.15, reliability: 0.15 },
  cheapest: { cost: 0.7, distance: 0.15, reliability: 0.15 },
  least_wait: { wait: 0.6, distance: 0.2, reliability: 0.2 },
  route: { detour: 0.45, total: 0.3, cost: 0.15, reliability: 0.1 },
};

type Metric = 'total' | 'cost' | 'distance' | 'wait' | 'reliability' | 'rating' | 'detour';

export function scoreRecommendations(candidates: RecommendationCandidate[], mode: RecommendationMode = 'balanced'): ScoredRecommendation[] {
  const usable = candidates.filter((c) => c.compatiblePorts > 0);
  if (!usable.length) return [];
  const metrics = usable.map((c) => ({
    total: c.travelMinutes + c.estimatedWaitMinutes + c.chargeMinutes,
    cost: c.chargeCost,
    distance: c.distanceKm,
    wait: c.estimatedWaitMinutes,
    reliability: (c.statusFresh ? 0.6 : 0.2) + (c.availableCompatiblePorts > 0 ? 0.4 : 0),
    rating: c.rating ?? 3.5,
    detour: c.detourKm ?? c.distanceKm,
  }));
  const higherIsBetter: Record<Metric, boolean> = {
    total: false, cost: false, distance: false, wait: false, reliability: true, rating: true, detour: false,
  };
  const range = (k: Metric) => {
    const vals = metrics.map((m) => m[k]);
    return [Math.min(...vals), Math.max(...vals)] as const;
  };
  const weights = WEIGHTS[mode];
  const scored = usable.map((c, i) => {
    let s = 0;
    for (const [k, w] of Object.entries(weights) as [Metric, number][]) {
      const [lo, hi] = range(k);
      const v = metrics[i][k];
      let n = hi === lo ? 1 : (v - lo) / (hi - lo);
      if (!higherIsBetter[k]) n = 1 - n;
      s += n * w;
    }
    return { ...c, score: Math.round(s * 100), rank: 0, totalMinutes: Math.round(metrics[i].total), badges: [] as string[], reasons: [] as string[] };
  });
  scored.sort((a, b) => b.score - a.score);
  scored.forEach((s, i) => (s.rank = i + 1));

  const minBy = (f: (s: ScoredRecommendation) => number) => scored.reduce((a, b) => (f(b) < f(a) ? b : a));
  minBy((s) => s.distanceKm).badges.push('Closest');
  minBy((s) => s.totalMinutes).badges.push('Fastest');
  minBy((s) => s.chargeCost).badges.push('Cheapest');
  const withFree = scored.filter((s) => s.availableCompatiblePorts > 0);
  if (withFree.length) minBy((s) => s.estimatedWaitMinutes).badges.push('Shortest wait');

  for (const s of scored) {
    if (s.availableCompatiblePorts > 0) s.reasons.push(`${s.availableCompatiblePorts} compatible port${s.availableCompatiblePorts > 1 ? 's' : ''} free`);
    else s.reasons.push(`All compatible ports busy · ~${Math.round(s.estimatedWaitMinutes)} min wait (est.)`);
    s.reasons.push(`Up to ${s.bestPowerKw} kW ${s.currentType}`);
    if (s.trafficLevel === 'heavy') s.reasons.push('Heavy traffic on the way');
    if (!s.statusFresh) s.reasons.push('Availability not recently confirmed');
  }
  return scored;
}

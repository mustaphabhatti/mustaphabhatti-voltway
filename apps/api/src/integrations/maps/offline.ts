import { haversineKm, type LatLng } from '@voltway/shared';
import { q } from '../../db';
import { typicalTrafficFactor } from './traffic';
import type { RouteRequest, RouteResult, RoutingProvider, RouteStep } from './types';

/**
 * Offline routing fallback.
 * Uses a small seeded highway graph (road_nodes / road_edges) for intercity
 * trips and a straight-line × road-factor estimate for local trips.
 * Results are flagged `approximate: true` and the UI says so.
 */
interface Node { id: string; name: string; lat: number; lng: number }
interface Edge { to: string; road: string; km: number; min: number }

let graph: { nodes: Map<string, Node>; adj: Map<string, Edge[]> } | null = null;

async function loadGraph() {
  if (graph) return graph;
  const nodes = new Map<string, Node>();
  const adj = new Map<string, Edge[]>();
  for (const n of await q<Node>('SELECT id, name, lat, lng FROM road_nodes')) {
    nodes.set(n.id, n);
    adj.set(n.id, []);
  }
  for (const e of await q<{ a: string; b: string; road: string; speed_kmh: number }>('SELECT * FROM road_edges')) {
    const A = nodes.get(e.a), B = nodes.get(e.b);
    if (!A || !B) continue;
    const km = haversineKm(A, B) * 1.12;
    const min = (km / e.speed_kmh) * 60;
    adj.get(e.a)!.push({ to: e.b, road: e.road, km, min });
    adj.get(e.b)!.push({ to: e.a, road: e.road, km, min });
  }
  graph = { nodes, adj };
  return graph;
}

export function resetOfflineGraph() {
  graph = null;
}

function dijkstra(adj: Map<string, Edge[]>, start: string, goal: string, penalty?: Set<string>) {
  const dist = new Map<string, number>([[start, 0]]);
  const prev = new Map<string, { node: string; edge: Edge }>();
  const open = new Set<string>([start]);
  while (open.size) {
    let cur = '';
    let best = Infinity;
    for (const n of open) if ((dist.get(n) ?? Infinity) < best) { best = dist.get(n)!; cur = n; }
    open.delete(cur);
    if (cur === goal) break;
    for (const e of adj.get(cur) ?? []) {
      const key = [cur, e.to].sort().join('|');
      const cost = best + e.min * (penalty?.has(key) ? 3 : 1);
      if (cost < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, cost);
        prev.set(e.to, { node: cur, edge: e });
        open.add(e.to);
      }
    }
  }
  if (!prev.has(goal) && start !== goal) return null;
  const path: { node: string; edge?: Edge }[] = [{ node: goal }];
  let c = goal;
  while (prev.has(c)) {
    const p = prev.get(c)!;
    path[0].edge = p.edge;
    path.unshift({ node: p.node });
    c = p.node;
  }
  return path;
}

function nearestNode(nodes: Map<string, Node>, p: LatLng) {
  let best: Node | null = null;
  let d = Infinity;
  for (const n of nodes.values()) {
    const k = haversineKm(n, p);
    if (k < d) { d = k; best = n; }
  }
  return best ? { node: best, km: d } : null;
}

function localLeg(a: LatLng, b: LatLng) {
  const crow = haversineKm(a, b);
  const km = crow * 1.32;
  const speed = km < 12 ? 26 : km < 40 ? 38 : 60;
  return { km, min: (km / speed) * 60 };
}

export const offlineProvider: RoutingProvider = {
  name: 'offline',
  async route(req: RouteRequest): Promise<RouteResult[]> {
    const g = await loadGraph();
    const tz = 'Asia/Karachi';
    const at = req.departAt ?? new Date();
    const crow = haversineKm(req.from, req.to);
    const direct = (): RouteResult => {
      const leg = localLeg(req.from, req.to);
      const t = typicalTrafficFactor(at, tz, leg.km < 60);
      return {
        provider: 'offline',
        distanceKm: leg.km,
        durationMin: leg.min * t.factor,
        baseDurationMin: leg.min,
        geometry: [req.from, req.to],
        steps: [{ instruction: 'Drive to destination (approximate)', distanceKm: leg.km, durationMin: leg.min * t.factor }],
        summary: 'Approximate direct route',
        traffic: { level: t.level, delayMin: leg.min * (t.factor - 1), source: 'estimated' },
        approximate: true,
      };
    };
    const nA = nearestNode(g.nodes, req.from);
    const nB = nearestNode(g.nodes, req.to);
    if (crow < 45 || !nA || !nB || nA.node.id === nB.node.id || nA.km > crow * 0.6 || nB.km > crow * 0.6) return [direct()];

    const build = (path: { node: string; edge?: Edge }[], label: string): RouteResult => {
      const head = localLeg(req.from, nA.node);
      const tail = localLeg(nB.node, req.to);
      const tHead = typicalTrafficFactor(at, tz, true);
      const tTail = typicalTrafficFactor(new Date(at.getTime() + 3 * 3600_000), tz, true);
      let km = head.km + tail.km;
      let base = head.min + tail.min;
      let dur = head.min * tHead.factor + tail.min * tTail.factor;
      const steps: RouteStep[] = [{ instruction: `Head to ${nA.node.name}`, distanceKm: head.km, durationMin: head.min * tHead.factor }];
      const roads: string[] = [];
      for (let i = 1; i < path.length; i++) {
        const e = path[i].edge!;
        km += e.km;
        base += e.min;
        dur += e.min * 1.03;
        const last = steps[steps.length - 1];
        const name = g.nodes.get(path[i].node)!.name;
        if (last && last.instruction.startsWith(`Follow ${e.road}`)) {
          last.instruction = `Follow ${e.road} to ${name}`;
          last.distanceKm += e.km;
          last.durationMin += e.min;
        } else {
          steps.push({ instruction: `Follow ${e.road} to ${name}`, distanceKm: e.km, durationMin: e.min });
          if (!roads.includes(e.road)) roads.push(e.road);
        }
      }
      steps.push({ instruction: 'Continue to destination', distanceKm: tail.km, durationMin: tail.min * tTail.factor });
      const delay = dur - base;
      return {
        provider: 'offline',
        distanceKm: km,
        durationMin: dur,
        baseDurationMin: base,
        geometry: [req.from, ...path.map((p) => ({ lat: g.nodes.get(p.node)!.lat, lng: g.nodes.get(p.node)!.lng })), req.to],
        steps,
        summary: `${label}${roads.length ? ' via ' + roads.join(', ') : ''}`,
        traffic: { level: delay > 20 ? 'heavy' : delay > 8 ? 'moderate' : 'light', delayMin: delay, source: 'estimated' },
        approximate: true,
      };
    };

    const first = dijkstra(g.adj, nA.node.id, nB.node.id);
    if (!first) return [direct()];
    const results = [build(first, 'Fastest')];
    if (req.alternatives) {
      const used = new Set<string>();
      for (let i = 1; i < first.length; i++) used.add([first[i - 1].node, first[i].node].sort().join('|'));
      const alt = dijkstra(g.adj, nA.node.id, nB.node.id, used);
      if (alt && alt.map((p) => p.node).join() !== first.map((p) => p.node).join()) {
        const r = build(alt, 'Alternative');
        if (r.durationMin < results[0].durationMin * 1.6) results.push(r);
      }
    }
    return results;
  },
};

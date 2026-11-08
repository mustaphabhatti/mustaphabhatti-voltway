export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6371.0088; // mean Earth radius, km

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

/** Cumulative distance (km) at each vertex of a polyline. */
export function cumulativeDistances(line: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + haversineKm(line[i - 1], line[i]));
  return out;
}

/**
 * Projects a point onto a polyline using a local equirectangular approximation.
 * Returns distance along the line (km) and the perpendicular offset (km).
 */
export function projectOntoLine(p: LatLng, line: LatLng[], cum = cumulativeDistances(line)) {
  let best = { alongKm: 0, offsetKm: Infinity, point: line[0] };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const kx = Math.cos(toRad((a.lat + b.lat) / 2)) * 111.32;
    const ky = 110.574;
    const ax = a.lng * kx, ay = a.lat * ky;
    const bx = b.lng * kx, by = b.lat * ky;
    const px = p.lng * kx, py = p.lat * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const cx = ax + t * dx, cy = ay + t * dy;
    const off = Math.hypot(px - cx, py - cy);
    if (off < best.offsetKm) {
      const seg = cum[i] - cum[i - 1];
      best = { alongKm: cum[i - 1] + t * seg, offsetKm: off, point: { lat: cy / ky, lng: cx / kx } };
    }
  }
  return best;
}

/** Interpolated point at a given distance along a polyline. */
export function pointAlong(line: LatLng[], km: number, cum = cumulativeDistances(line)): LatLng {
  if (km <= 0) return line[0];
  for (let i = 1; i < line.length; i++) {
    if (cum[i] >= km) {
      const seg = cum[i] - cum[i - 1] || 1;
      const t = (km - cum[i - 1]) / seg;
      return { lat: line[i - 1].lat + t * (line[i].lat - line[i - 1].lat), lng: line[i - 1].lng + t * (line[i].lng - line[i - 1].lng) };
    }
  }
  return line[line.length - 1];
}

/** Decode a Google/OSRM encoded polyline (precision 5 by default). */
export function decodePolyline(str: string, precision = 5): LatLng[] {
  let index = 0, lat = 0, lng = 0;
  const coords: LatLng[] = [];
  const factor = 10 ** precision;
  while (index < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, byte: number;
      do {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    coords.push({ lat: lat / factor, lng: lng / factor });
  }
  return coords;
}

export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—';
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

import { config } from '../../config';
import { q } from '../../db';
import { fetchJson, reportError, reportOk } from '../health';

export interface GeocodeResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  kind: 'place' | 'station' | 'address';
  source: 'local' | 'nominatim' | 'mapbox';
  stationId?: string;
}

let nominatimCooldownUntil = 0;

async function localSearch(text: string, near?: { lat: number; lng: number }): Promise<GeocodeResult[]> {
  const like = `%${text}%`;
  const places = await q<any>(
    `SELECT id, name, kind, city, country, ST_Y(location::geometry) lat, ST_X(location::geometry) lng,
            similarity(name, $1) sim
       FROM places WHERE name ILIKE $2 OR name % $1 OR city ILIKE $2
      ORDER BY (name ILIKE $3) DESC, sim DESC LIMIT 6`,
    [text, like, `${text}%`],
  );
  const stations = await q<any>(
    `SELECT s.id, s.name, s.address, s.city, ST_Y(s.location::geometry) lat, ST_X(s.location::geometry) lng
       FROM stations s WHERE s.listing_status = 'approved' AND (s.name ILIKE $1 OR s.address ILIKE $1 OR s.name % $2)
      ORDER BY similarity(s.name, $2) DESC LIMIT 5`,
    [like, text],
  );
  const out: GeocodeResult[] = [
    ...places.map((p) => ({
      id: `place:${p.id}`, name: p.name, address: [p.kind === 'city' ? null : p.city, p.country].filter(Boolean).join(', '),
      lat: p.lat, lng: p.lng, kind: 'place' as const, source: 'local' as const,
    })),
    ...stations.map((s) => ({
      id: `station:${s.id}`, name: s.name, address: `${s.address}, ${s.city}`, lat: s.lat, lng: s.lng,
      kind: 'station' as const, source: 'local' as const, stationId: s.id,
    })),
  ];
  if (near) out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'place' ? -1 : 1));
  return out;
}

async function nominatim(text: string): Promise<GeocodeResult[]> {
  if (Date.now() < nominatimCooldownUntil) return [];
  try {
    const data = await fetchJson<any[]>(
      `${config.nominatimUrl}/search?format=jsonv2&limit=5&q=${encodeURIComponent(text)}`,
      { timeoutMs: 2500 },
    );
    reportOk('geocoding:nominatim');
    return data.map((d) => ({
      id: `osm:${d.osm_type}:${d.osm_id}`, name: d.name || d.display_name.split(',')[0], address: d.display_name,
      lat: Number(d.lat), lng: Number(d.lon), kind: 'address', source: 'nominatim',
    }));
  } catch (e) {
    reportError('geocoding:nominatim', e);
    nominatimCooldownUntil = Date.now() + 2 * 60_000;
    return [];
  }
}

async function mapbox(text: string, near?: { lat: number; lng: number }): Promise<GeocodeResult[]> {
  try {
    const prox = near ? `&proximity=${near.lng},${near.lat}` : '';
    const data = await fetchJson<any>(
      `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(text)}&limit=5${prox}&access_token=${config.mapboxToken}`,
      { timeoutMs: 3000 },
    );
    reportOk('geocoding:mapbox');
    return (data.features ?? []).map((f: any) => ({
      id: `mapbox:${f.id}`, name: f.properties.name, address: f.properties.full_address ?? f.properties.place_formatted ?? '',
      lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], kind: 'address', source: 'mapbox',
    }));
  } catch (e) {
    reportError('geocoding:mapbox', e);
    return [];
  }
}

export async function geocode(text: string, near?: { lat: number; lng: number }): Promise<GeocodeResult[]> {
  const local = await localSearch(text, near);
  let external: GeocodeResult[] = [];
  const mode = config.geocoder;
  if (mode === 'mapbox' || (mode === 'auto' && config.mapboxToken)) external = await mapbox(text, near);
  else if (mode === 'nominatim' || (mode === 'auto' && local.length < 3)) external = await nominatim(text);
  const seen = new Set(local.map((l) => l.name.toLowerCase()));
  return [...local, ...external.filter((e) => !seen.has(e.name.toLowerCase()))].slice(0, 10);
}

'use client';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { Station } from '@/lib/types';
import { stationTone } from '@/lib/stationColor';
import { useTheme } from '@/lib/theme';

export interface MapRoute {
  id: string;
  geometry: { lat: number; lng: number }[];
  active?: boolean;
  approximate?: boolean;
}
export interface MapStop {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title?: string;
}

const BOLT = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>';

function stationIcon(s: Station, selected: boolean) {
  const tone = stationTone(s);
  const label = s.maxPowerKw >= 1 ? `${Math.round(s.maxPowerKw)}` : '';
  return L.divIcon({
    className: 'vw-marker',
    html: `<div class="vw-pin${selected ? ' selected' : ''}" style="background:${tone.hex}">${BOLT}<span>${label}</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

const userIcon = L.divIcon({ className: 'vw-marker', html: '<div class="vw-user" style="transform:translate(-50%,-50%)"></div>', iconSize: [0, 0] });
const endpointIcon = L.divIcon({ className: 'vw-marker', html: '<div class="vw-endpoint" style="transform:translate(-50%,-50%)"></div>', iconSize: [0, 0] });
const stopIcon = (n: string) => L.divIcon({ className: 'vw-marker', html: `<div class="vw-stop" style="transform:translate(-50%,-50%)">${n}</div>`, iconSize: [0, 0] });

function Events({ onMove, onClick }: { onMove?: (bbox: [number, number, number, number], center: { lat: number; lng: number }, zoom: number) => void; onClick?: (p: { lat: number; lng: number }) => void }) {
  const map = useMapEvents({
    click: (e) => onClick?.({ lat: e.latlng.lat, lng: e.latlng.lng }),
    moveend: () => {
      const b = map.getBounds();
      onMove?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], map.getCenter(), map.getZoom());
    },
  });
  useEffect(() => {
    const b = map.getBounds();
    onMove?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], map.getCenter(), map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function Controller({ flyTo, fit }: { flyTo?: { lat: number; lng: number; zoom?: number; key: string | number } | null; fit?: { points: { lat: number; lng: number }[]; key: string | number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (flyTo) map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom ?? Math.max(map.getZoom(), 13), { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo?.key]);
  useEffect(() => {
    if (fit && fit.points.length > 1) map.fitBounds(L.latLngBounds(fit.points.map((p) => [p.lat, p.lng])), { padding: [48, 48], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit?.key]);
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

export default function MapView({
  center, zoom = 12, stations = [], selectedId, onSelect, user, routes = [], stops = [], endpoints = [], onMove, onMapClick, pin, flyTo, fit, className,
}: {
  onMapClick?: (p: { lat: number; lng: number }) => void;
  pin?: { lat: number; lng: number } | null;
  center: { lat: number; lng: number };
  zoom?: number;
  stations?: Station[];
  selectedId?: string | null;
  onSelect?: (s: Station) => void;
  user?: { lat: number; lng: number } | null;
  routes?: MapRoute[];
  stops?: MapStop[];
  endpoints?: { lat: number; lng: number; label: string }[];
  onMove?: (bbox: [number, number, number, number], center: { lat: number; lng: number }, zoom: number) => void;
  flyTo?: { lat: number; lng: number; zoom?: number; key: string | number } | null;
  fit?: { points: { lat: number; lng: number }[]; key: string | number } | null;
  className?: string;
}) {
  const { resolved } = useTheme();
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const tiles = useMemo(() => {
    if (token)
      return {
        url: `https://api.mapbox.com/styles/v1/mapbox/${resolved === 'dark' ? 'dark-v11' : 'light-v11'}/tiles/512/{z}/{x}/{y}@2x?access_token=${token}`,
        attribution: '© Mapbox © OpenStreetMap',
        tileSize: 512,
        zoomOffset: -1,
      };
    return {
      url: `https://{s}.basemaps.cartocdn.com/${resolved === 'dark' ? 'dark_all' : 'rastertiles/voyager'}/{z}/{x}/{y}{r}.png`,
      attribution: '© OpenStreetMap contributors © CARTO',
      tileSize: 256,
      zoomOffset: 0,
    };
  }, [resolved, token]);
  const icons = useRef(new Map<string, L.DivIcon>());

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} zoomControl={false} className={className ?? 'h-full w-full'} worldCopyJump>
      <TileLayer key={tiles.url} url={tiles.url} attribution={tiles.attribution} tileSize={tiles.tileSize} zoomOffset={tiles.zoomOffset} maxZoom={19} />
      <Events onMove={onMove} onClick={onMapClick} />
      <Controller flyTo={flyTo} fit={fit} />
      {routes.filter((r) => !r.active).map((r) => (
        <Polyline key={r.id} positions={r.geometry.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#8a93a0', weight: 5, opacity: 0.55, dashArray: r.approximate ? '6 8' : undefined }} />
      ))}
      {routes.filter((r) => r.active).map((r) => (
        <Polyline key={r.id} positions={r.geometry.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#2f6bff', weight: 6, opacity: 0.9, dashArray: r.approximate ? '8 10' : undefined }} />
      ))}
      {stations.map((s) => {
        const sel = s.id === selectedId;
        const tone = stationTone(s);
        const key = `${s.id}:${sel}:${tone.hex}:${s.maxPowerKw}`;
        let icon = icons.current.get(key);
        if (!icon) {
          icon = stationIcon(s, sel);
          icons.current.set(key, icon);
        }
        return (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={icon} zIndexOffset={sel ? 1000 : 0} eventHandlers={{ click: () => onSelect?.(s) }} keyboard title={`${s.name} — ${tone.label}`} />
        );
      })}
      {stops.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={stopIcon(s.label)} zIndexOffset={2000}>
          {s.title && <Tooltip direction="top" offset={[0, -14]}>{s.title}</Tooltip>}
        </Marker>
      ))}
      {endpoints.map((e, i) => (
        <Marker key={`ep${i}`} position={[e.lat, e.lng]} icon={endpointIcon} zIndexOffset={1500}>
          <Tooltip direction="top" offset={[0, -10]} permanent={false}>{e.label}</Tooltip>
        </Marker>
      ))}
      {pin && <Marker position={[pin.lat, pin.lng]} icon={endpointIcon} zIndexOffset={4000} />}
      {user && <Marker position={[user.lat, user.lng]} icon={userIcon} zIndexOffset={3000} />}
    </MapContainer>
  );
}

'use client';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useFetch } from '@/lib/hooks';
import { useGeolocation } from '@/lib/geo';
import { useLiveStations } from '@/lib/useLiveStations';
import type { Station } from '@/lib/types';
import { Button, EmptyState, ErrorState, PageHeader, SkeletonList } from '@/components/ui';
import { StationCard } from '@/components/station/StationCard';
import { RequireRole } from '@/components/layout/RequireRole';

function Favorites() {
  const geo = useGeolocation();
  const pos = geo.position && !geo.isFallback ? geo.position : null;
  const { data, error, loading, reload, setData } = useFetch<{ stations: Station[] }>(`/me/favorites${pos ? `?lat=${pos.lat}&lng=${pos.lng}` : ''}`, [pos?.lat]);
  useLiveStations((fn) => setData((d) => (d ? { stations: fn(d.stations) } : d)));
  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <PageHeader title="Favorites" subtitle="Saved stations update live. You'll be notified about outages, price changes and peak pricing." />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonList /> : !data?.stations.length ? (
        <EmptyState icon={<Heart className="size-6" />} title="No favorites yet" body="Tap the heart on any station to save it here." action={<Link href="/"><Button>Explore the map</Button></Link>} />
      ) : <div className="grid md:grid-cols-2 gap-3">{data.stations.map((s) => <StationCard key={s.id} s={s} href={`/stations/${s.id}`} />)}</div>}
    </div>
  );
}
export default function FavoritesPage() {
  return <RequireRole><Favorites /></RequireRole>;
}

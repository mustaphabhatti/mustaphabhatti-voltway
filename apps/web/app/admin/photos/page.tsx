'use client';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { timeAgo } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, SkeletonList } from '@/components/ui';

export default function AdminPhotos() {
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<any>('/admin/photos');
  const moderate = async (id: string, status: string) => { await api.post(`/admin/photos/${id}/moderate`, { status }); toast('success', status === 'hidden' ? 'Photo hidden' : 'Photo visible'); reload(true); };
  return (
    <>
      <PageHeader title="Community photos" subtitle="Photos uploaded by drivers. Hide anything inappropriate or showing private information." />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonList /> : !data.photos.length ? <EmptyState title="No photos uploaded yet" /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {data.photos.map((p: any) => (
            <Card key={p.id} className="overflow-hidden">
              <img src={p.url} alt="" className="aspect-[4/3] w-full object-cover bg-surface-2" />
              <div className="p-3 text-sm space-y-1">
                <Link href={`/stations/${p.station_id}`} className="font-medium hover:underline">{p.station_name}</Link>
                <div className="text-xs text-muted">{p.full_name} · {timeAgo(p.created_at)}</div>
                <div className="flex items-center justify-between pt-1"><Badge tone={p.status === 'visible' ? 'green' : 'neutral'}>{p.status}</Badge>
                  {p.status === 'visible' ? <Button size="sm" variant="ghost" onClick={() => moderate(p.id, 'hidden')}><EyeOff className="size-4" />Hide</Button> : <Button size="sm" variant="ghost" onClick={() => moderate(p.id, 'visible')}><Eye className="size-4" />Show</Button>}</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

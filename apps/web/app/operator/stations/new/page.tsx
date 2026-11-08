'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { Button, PageHeader } from '@/components/ui';
import { StationForm, draftToPayload, emptyStation } from '@/components/operator/StationForm';

export default function NewStation() {
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = useState(emptyStation);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (d.lat == null || d.lng == null) return toast('error', 'Place the station on the map', 'Search an address or click the map.');
    setBusy(true);
    try {
      const r = await api.post('/operator/stations', draftToPayload(d));
      toast('success', 'Station created', r.station.listingStatus === 'pending' ? 'Submitted to Wattly for review.' : 'Saved as a draft until your company is verified.');
      router.push(`/operator/stations/${r.station.id}`);
    } catch (e: any) {
      toast('error', 'Could not save station', e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-5xl">
      <PageHeader title="Add a station" subtitle="New listings are reviewed by Wattly before drivers can see them." actions={<Button onClick={save} loading={busy}>Create station</Button>} />
      <StationForm value={d} onChange={setD} showPorts />
      <div className="flex justify-end mt-4"><Button size="lg" onClick={save} loading={busy}>Create station</Button></div>
    </div>
  );
}

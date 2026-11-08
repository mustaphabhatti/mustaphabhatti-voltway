'use client';
import { useCallback } from 'react';
import { summarizePorts } from '@wattly/shared';
import { useRealtime } from './realtime';
import type { Station } from './types';

/** Patch a list of stations in place when port statuses change over WebSocket. */
export function useLiveStations(setStations: (fn: (s: Station[]) => Station[]) => void) {
  const handler = useCallback((event: string, data: any) => {
    if (event !== 'port.status') return;
    setStations((list) =>
      list.map((s) => {
        if (s.id !== data.stationId) return s;
        const ports = s.ports.map((p) => (p.id === data.portId ? { ...p, status: data.status, statusSource: data.source, statusUpdatedAt: data.updatedAt, statusStale: false } : p));
        const summary = summarizePorts(ports, s.maintenanceMode);
        const compatible = ports.filter((p) => p.compatible);
        return {
          ...s, ports, summary,
          compatibleAvailable: compatible.filter((p) => p.status === 'available').length,
          compatibleWorking: compatible.filter((p) => !['out_of_service', 'offline', 'no_power'].includes(p.status)).length,
          status: { ...s.status, operational: summary.operationalStatus, source: data.source, updatedAt: data.updatedAt, ageMinutes: 0, stale: false },
        };
      }),
    );
  }, [setStations]);
  return useRealtime('stations', handler);
}

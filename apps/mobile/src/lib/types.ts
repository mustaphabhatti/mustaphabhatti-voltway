import type { ConnectorType, DataSource, PortStatus, PortSummary, Tariff } from '@wattly/shared';

export interface Port {
  id: string;
  label: string;
  evseUid: string | null;
  connectorType: ConnectorType;
  currentType: 'AC' | 'DC';
  maxPowerKw: number;
  voltage: number | null;
  amperage: number | null;
  powerGroup: string | null;
  status: PortStatus;
  statusSource: DataSource;
  statusUpdatedAt: string | null;
  statusStale: boolean;
  compatible: boolean;
}

export interface Station {
  id: string;
  name: string;
  description: string | null;
  address: string;
  city: string;
  region: string | null;
  country: string;
  lat: number;
  lng: number;
  timezone: string;
  phone: string | null;
  operator: { id: string; name: string; slug: string; brandColor: string; verified: boolean };
  is24_7: boolean;
  openingHours: { day: number; open: string; close: string }[];
  openNow: { open: boolean | null; label: string };
  amenities: string[];
  paymentMethods: string[];
  parkingInfo: string | null;
  accessType: string;
  images: string[];
  listingStatus: string;
  rejectionReason: string | null;
  maintenanceMode: boolean;
  maintenanceNote: string | null;
  reservationsEnabled: boolean;
  reservationFee: number;
  integration: { type: string; ref: string | null; supportsRemoteStart: boolean };
  isDemo: boolean;
  comingSoon: boolean;
  locationType: string;
  hostNotes: string | null;
  community: boolean;
  photoCount: number;
  reliability: { score: number | null; checkins: number; lastCheckinAt: string | null; lastOutcome: string | null; lastSuccessAt: string | null };
  infoUpdatedAt: string;
  rating: number | null;
  reviewCount: number;
  ports: Port[];
  summary: PortSummary;
  status: { operational: string; source: DataSource; updatedAt: string | null; ageMinutes: number | null; stale: boolean };
  connectors: ConnectorType[];
  hasDC: boolean;
  hasAC: boolean;
  maxPowerKw: number;
  compatiblePorts: number;
  compatibleAvailable: number;
  compatibleWorking: number;
  estimatedWaitMinutes: number | null;
  pricing: {
    currency: string; currentRate: number; periodLabel: string; periodKind: string; baseRate: number; sessionFee: number;
    parkingFeePerHour: number; idleFeePerMinute: number; idleGraceMinutes: number; serviceChargePercent: number; timeFeePerMinute: number;
    taxPercent: number; hasTimeOfUse: boolean; dynamic: boolean; tariffName: string; updatedAt: string;
  } | null;
  tariff: Tariff | null;
  tariffId: string | null;
  travel: { distanceKm: number; straightLineKm: number; travelMinutes: number; traffic: { level: string; source: string } } | null;
  distanceKm?: number | null;
}

export interface Vehicle {
  id: string;
  nickname: string;
  brand: string;
  model: string;
  battery_kwh: number;
  max_ac_kw: number;
  max_dc_kw: number;
  connectors: ConnectorType[];
  curve_profile: string;
  efficiency_wh_km: number;
  current_soc: number;
  target_soc: number;
  is_default: boolean;
  model_id: number | null;
}

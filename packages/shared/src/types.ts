// ─────────────────────────────────────────────────────────────────────────────
// Core domain types shared by the API and the web app.
// ─────────────────────────────────────────────────────────────────────────────

export type Role = 'driver' | 'operator' | 'admin';

export const CONNECTOR_TYPES = ['CCS2', 'CCS1', 'CHAdeMO', 'Type2', 'Type1', 'GBT_DC', 'GBT_AC', 'NACS'] as const;
export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

export const CONNECTOR_LABELS: Record<ConnectorType, string> = {
  CCS2: 'CCS2',
  CCS1: 'CCS1',
  CHAdeMO: 'CHAdeMO',
  Type2: 'Type 2',
  Type1: 'Type 1 (J1772)',
  GBT_DC: 'GB/T DC',
  GBT_AC: 'GB/T AC',
  NACS: 'NACS',
};

export const CONNECTOR_CURRENT: Record<ConnectorType, CurrentType> = {
  CCS2: 'DC',
  CCS1: 'DC',
  CHAdeMO: 'DC',
  GBT_DC: 'DC',
  NACS: 'DC',
  Type2: 'AC',
  Type1: 'AC',
  GBT_AC: 'AC',
};

export type CurrentType = 'AC' | 'DC';

export const PORT_STATUSES = [
  'available',
  'charging',
  'occupied',
  'reserved',
  'out_of_service',
  'offline',
  'no_power',
  'unknown',
] as const;
export type PortStatus = (typeof PORT_STATUSES)[number];

export const PORT_STATUS_LABELS: Record<PortStatus, string> = {
  available: 'Available',
  charging: 'Charging',
  occupied: 'Occupied',
  reserved: 'Reserved',
  out_of_service: 'Out of service',
  offline: 'Temporarily offline',
  no_power: 'Electricity unavailable',
  unknown: 'Unknown status',
};

/**
 * Where a piece of information came from. The UI must never label anything
 * other than `live` as live/real-time.
 */
export type DataSource =
  | 'live' // pushed by a connected charger / network (OCPP, OCPI, operator API)
  | 'simulated' // produced by the built-in demo simulator — NOT real
  | 'operator_reported' // manually set by the operator in the dashboard
  | 'user_reported' // reported by a driver
  | 'estimated' // computed / predicted by Wattly
  | 'static'; // static listing information

export const DATA_SOURCE_LABELS: Record<DataSource, string> = {
  live: 'Live',
  simulated: 'Demo feed (simulated)',
  operator_reported: 'Reported by operator',
  user_reported: 'Reported by drivers',
  estimated: 'Estimated',
  static: 'Listing info',
};

export type StationOperationalStatus =
  | 'operational'
  | 'partial'
  | 'offline'
  | 'no_power'
  | 'maintenance'
  | 'unknown';

export type ListingStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';
export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'suspended';

export const AMENITIES = [
  'restaurant',
  'cafe',
  'restroom',
  'shopping',
  'wifi',
  'prayer_area',
  'lounge',
  'hotel',
  'parking',
  'convenience_store',
  'playground',
  'car_wash',
  'covered_parking',
  'security',
] as const;
export type Amenity = (typeof AMENITIES)[number];

export const AMENITY_LABELS: Record<Amenity, string> = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  restroom: 'Restrooms',
  shopping: 'Shopping',
  wifi: 'Wi-Fi',
  prayer_area: 'Prayer area',
  lounge: 'Lounge',
  hotel: 'Hotel',
  parking: 'Parking',
  convenience_store: 'Convenience store',
  playground: 'Playground',
  car_wash: 'Car wash',
  covered_parking: 'Covered parking',
  security: '24h security',
};

export const PAYMENT_METHODS = ['card', 'app', 'rfid', 'cash', 'wallet', 'local_gateway', 'apple_pay', 'google_pay'] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKind, string> = {
  card: 'Credit / debit card',
  app: 'Wattly app',
  rfid: 'RFID card',
  cash: 'Cash',
  wallet: 'Mobile wallet',
  local_gateway: 'Local payment gateway',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
};

export type CurveProfile = 'standard_400v' | 'flat_800v' | 'lfp' | 'legacy';

export const NOTIFICATION_TYPES = [
  'nearby_available',
  'availability_change',
  'session_complete',
  'reservation_reminder',
  'price_change',
  'peak_schedule',
  'station_outage',
  'traffic',
  'low_battery',
  'better_alternative',
  'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_LABELS: Record<NotificationType, { label: string; description: string }> = {
  nearby_available: { label: 'Nearby available chargers', description: 'When a compatible charger frees up near you' },
  availability_change: { label: 'Availability changes', description: 'For stations you watch or favorite' },
  session_complete: { label: 'Charging complete', description: 'When your session reaches its target' },
  reservation_reminder: { label: 'Reservation reminders', description: '15 minutes before a reservation starts' },
  price_change: { label: 'Price changes', description: 'When a favorite station changes its rates' },
  peak_schedule: { label: 'Peak / off-peak schedule', description: 'Before peak pricing starts at favorite stations' },
  station_outage: { label: 'Station outages', description: 'When a favorite station goes offline or loses power' },
  traffic: { label: 'Traffic congestion', description: 'Heavy traffic on your planned route' },
  low_battery: { label: 'Low battery warnings', description: 'When your planned trip needs a charging stop' },
  better_alternative: { label: 'Better or cheaper alternatives', description: 'When a cheaper or faster option is nearby' },
  system: { label: 'Account & system', description: 'Security and account messages (always on)' },
};

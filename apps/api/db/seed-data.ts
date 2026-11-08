// ─────────────────────────────────────────────────────────────────────────────
// DEMO DATA. All operators, stations, prices, users and reviews below are
// fictional and flagged `is_demo = true`. Coordinates are approximate.
// ─────────────────────────────────────────────────────────────────────────────
import type { Tariff } from '@voltway/shared';

export const DEMO_PASSWORD = 'Demo1234!';

export const VEHICLE_MODELS = [
  // brand, model, variant, usable kWh, AC kW, DC kW, connectors, curve, Wh/km  (approximate public specs)
  ['Hyundai', 'Ioniq 5', '77 kWh RWD', 74, 10.9, 235, ['CCS2', 'Type2'], 'flat_800v', 175],
  ['Kia', 'EV6', '77 kWh RWD', 74, 10.9, 235, ['CCS2', 'Type2'], 'flat_800v', 170],
  ['Tesla', 'Model 3', 'Long Range AWD', 75, 11, 250, ['CCS2', 'Type2'], 'standard_400v', 150],
  ['Tesla', 'Model Y', 'Long Range AWD', 75, 11, 250, ['CCS2', 'Type2'], 'standard_400v', 165],
  ['BYD', 'Atto 3', 'Extended Range', 60.5, 7, 88, ['CCS2', 'Type2'], 'lfp', 160],
  ['BYD', 'Seal', 'AWD Performance', 82.5, 11, 150, ['CCS2', 'Type2'], 'lfp', 165],
  ['BYD', 'Dolphin', 'Extended Range', 60.4, 7, 88, ['CCS2', 'Type2'], 'lfp', 145],
  ['MG', 'ZS EV', 'Long Range', 68.3, 11, 92, ['CCS2', 'Type2'], 'standard_400v', 170],
  ['MG', 'MG4 Electric', 'Long Range', 61.7, 11, 140, ['CCS2', 'Type2'], 'standard_400v', 160],
  ['Audi', 'Q8 e-tron', '55 quattro', 106, 11, 170, ['CCS2', 'Type2'], 'standard_400v', 225],
  ['Mercedes-Benz', 'EQS', '450+', 108, 11, 200, ['CCS2', 'Type2'], 'standard_400v', 180],
  ['BMW', 'iX', 'xDrive50', 105.2, 11, 195, ['CCS2', 'Type2'], 'standard_400v', 210],
  ['Porsche', 'Taycan', '4S Performance Battery Plus', 83.7, 11, 270, ['CCS2', 'Type2'], 'flat_800v', 210],
  ['Toyota', 'bZ4X', 'FWD', 64, 6.6, 150, ['CCS2', 'Type2'], 'standard_400v', 170],
  ['Nissan', 'Leaf', '40 kWh', 39, 6.6, 46, ['CHAdeMO', 'Type2'], 'legacy', 165],
  ['Seres', '3', 'Standard', 52, 6.6, 60, ['GBT_DC', 'GBT_AC'], 'standard_400v', 165],
  ['Honri', 'VE', 'City', 9.3, 3.3, 0, ['GBT_AC'], 'lfp', 95],
] as const;

type T = Partial<Tariff> & { currency: string; baseRate: number };

export const COMPANIES: {
  key: string; name: string; legal: string; color: string; country: string; status: 'verified' | 'pending' | 'rejected';
  email: string; owner: string; description: string; tariffs: Record<string, T>;
}[] = [
  {
    key: 'voltgrid', name: 'VoltGrid Energy', legal: 'VoltGrid Energy (Pvt.) Ltd.', color: '#10b981', country: 'PK', status: 'verified',
    email: 'ops@voltgrid.demo', owner: 'Ayesha Khan', description: 'Urban fast-charging hubs across Lahore and Islamabad.',
    tariffs: {
      fast: {
        currency: 'PKR', baseRate: 85, sessionFee: 0, serviceChargePercent: 5, idleFeePerMinute: 10, idleGraceMinutes: 15,
        periods: [
          { label: 'Evening peak', kind: 'peak', start: '17:00', end: '23:00', rate: 110 },
          { label: 'Night off-peak', kind: 'off_peak', start: '23:00', end: '07:00', rate: 65 },
        ],
      },
      ac: {
        currency: 'PKR', baseRate: 60, parkingFeePerHour: 0,
        periods: [{ label: 'Night saver', kind: 'off_peak', start: '23:00', end: '07:00', rate: 45 }],
      },
    },
  },
  {
    key: 'ampway', name: 'AmpWay Charging', legal: 'AmpWay Mobility Pvt Ltd', color: '#3b82f6', country: 'PK', status: 'verified',
    email: 'ops@ampway.demo', owner: 'Bilal Ahmed', description: 'Highway and motorway corridor charging between Lahore and Islamabad.',
    tariffs: {
      corridor: { currency: 'PKR', baseRate: 105, weekendRate: 115, sessionFee: 100, idleFeePerMinute: 15, idleGraceMinutes: 10 },
    },
  },
  {
    key: 'greenmile', name: 'GreenMile EV', legal: 'GreenMile EV Solutions', color: '#14b8a6', country: 'PK', status: 'verified',
    email: 'ops@greenmile.demo', owner: 'Sana Siddiqui', description: 'Destination and fast charging across Karachi and Hyderabad.',
    tariffs: {
      tou: {
        currency: 'PKR', baseRate: 80, serviceChargePercent: 3,
        periods: [
          { label: 'Peak', kind: 'peak', start: '18:30', end: '22:30', rate: 120 },
          { label: 'Off-peak', kind: 'off_peak', start: '00:00', end: '08:00', rate: 60 },
        ],
        seasonal: [{ label: 'Summer demand', startMonth: 5, endMonth: 9, multiplier: 1.1 }],
        discounts: [{ label: 'Night owl', percent: 10, start: '01:00', end: '05:00' }],
      },
    },
  },
  {
    key: 'desertvolt', name: 'DesertVolt', legal: 'DesertVolt Charging LLC', color: '#f59e0b', country: 'AE', status: 'verified',
    email: 'ops@desertvolt.demo', owner: 'Omar Haddad', description: 'Premium charging in Dubai and Abu Dhabi.',
    tariffs: {
      dc: {
        currency: 'AED', baseRate: 1.2, idleFeePerMinute: 0.5, idleGraceMinutes: 10, taxPercent: 5, weekendDays: [0, 6],
        periods: [
          { label: 'Afternoon peak', kind: 'peak', start: '16:00', end: '21:00', rate: 1.45 },
          { label: 'Overnight', kind: 'off_peak', start: '22:00', end: '06:00', rate: 0.9 },
        ],
        dynamic: { enabled: true, minMultiplier: 0.95, maxMultiplier: 1.25 },
      },
      ac: { currency: 'AED', baseRate: 0.79, parkingFeePerHour: 0, taxPercent: 5 },
    },
  },
  {
    key: 'citycharge', name: 'CityCharge Hubs', legal: 'CityCharge Hubs (SMC-Pvt) Ltd', color: '#8b5cf6', country: 'PK', status: 'pending',
    email: 'ops@citycharge.demo', owner: 'Hamza Raza', description: 'New operator — awaiting verification.',
    tariffs: { std: { currency: 'PKR', baseRate: 75 } },
  },
];

// Port layouts
export type Profile = 'hpc' | 'dc' | 'mixed' | 'ac' | 'motorway' | 'gbt' | 'small';
export const PROFILES: Record<Profile, { label: string; type: string; kw: number; v?: number; a?: number; group?: string }[]> = {
  hpc: [
    { label: 'HPC-1', type: 'CCS2', kw: 180, v: 920, a: 400, group: 'A' },
    { label: 'HPC-2', type: 'CCS2', kw: 180, v: 920, a: 400, group: 'A' },
    { label: 'HPC-3', type: 'CCS2', kw: 120, v: 920, a: 250, group: 'B' },
    { label: 'HPC-4', type: 'CCS2', kw: 120, v: 920, a: 250, group: 'B' },
    { label: 'DC-5', type: 'CHAdeMO', kw: 50, v: 500, a: 125 },
    { label: 'AC-6', type: 'Type2', kw: 22, v: 400, a: 32 },
  ],
  dc: [
    { label: 'DC-1', type: 'CCS2', kw: 60, v: 750, a: 150 },
    { label: 'DC-2', type: 'CCS2', kw: 60, v: 750, a: 150 },
    { label: 'DC-3', type: 'GBT_DC', kw: 60, v: 750, a: 150 },
    { label: 'AC-4', type: 'Type2', kw: 22, v: 400, a: 32 },
  ],
  mixed: [
    { label: 'DC-1', type: 'CCS2', kw: 120, v: 920, a: 250 },
    { label: 'DC-2', type: 'CHAdeMO', kw: 50, v: 500, a: 125 },
    { label: 'AC-3', type: 'Type2', kw: 22, v: 400, a: 32 },
    { label: 'AC-4', type: 'Type2', kw: 11, v: 400, a: 16 },
  ],
  ac: [
    { label: 'AC-1', type: 'Type2', kw: 22, v: 400, a: 32 },
    { label: 'AC-2', type: 'Type2', kw: 22, v: 400, a: 32 },
    { label: 'AC-3', type: 'Type2', kw: 7.4, v: 230, a: 32 },
    { label: 'AC-4', type: 'GBT_AC', kw: 7, v: 230, a: 32 },
  ],
  motorway: [
    { label: 'M-1', type: 'CCS2', kw: 150, v: 920, a: 350, group: 'A' },
    { label: 'M-2', type: 'CCS2', kw: 150, v: 920, a: 350, group: 'A' },
    { label: 'M-3', type: 'CCS2', kw: 120, v: 920, a: 250 },
    { label: 'M-4', type: 'GBT_DC', kw: 80, v: 750, a: 200 },
    { label: 'M-5', type: 'CHAdeMO', kw: 50, v: 500, a: 125 },
  ],
  gbt: [
    { label: 'GB-1', type: 'GBT_DC', kw: 60, v: 750, a: 150 },
    { label: 'GB-2', type: 'GBT_DC', kw: 60, v: 750, a: 150 },
    { label: 'CCS-3', type: 'CCS2', kw: 60, v: 750, a: 150 },
    { label: 'AC-4', type: 'GBT_AC', kw: 7, v: 230, a: 32 },
  ],
  small: [
    { label: 'AC-1', type: 'Type2', kw: 11, v: 400, a: 16 },
    { label: 'AC-2', type: 'Type2', kw: 7.4, v: 230, a: 32 },
  ],
};

const MALL = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '10:00', close: '22:00' }));
const OFFICE = [1, 2, 3, 4, 5].map((day) => ({ day, open: '08:00', close: '20:00' })).concat([{ day: 6, open: '10:00', close: '18:00' }]);

export interface StationSeed {
  name: string; company: string; city: string; region: string; country: string; address: string; lat: number; lng: number;
  tz: string; profile: Profile; tariff: string; is247?: boolean; hours?: { day: number; open: string; close: string }[];
  amenities: string[]; payments: string[]; integration: 'simulator' | 'none'; listing?: 'approved' | 'pending' | 'draft' | 'rejected';
  reservations?: boolean; fee?: number; parking?: string; scenario?: 'no_power' | 'maintenance' | 'unknown' | 'stale'; description?: string;
}

const PK = { tz: 'Asia/Karachi', country: 'PK' };
const AE = { tz: 'Asia/Dubai', country: 'AE' };
const payPK = ['app', 'card', 'wallet', 'local_gateway'];
const payAE = ['app', 'card', 'apple_pay', 'google_pay', 'rfid'];

export const STATIONS: StationSeed[] = [
  // ── Lahore ──
  { name: 'VoltGrid Gulberg Hub', company: 'voltgrid', city: 'Lahore', region: 'Punjab', ...PK, address: 'MM Alam Road, Gulberg III', lat: 31.5139, lng: 74.3502, profile: 'hpc', tariff: 'fast', is247: true, amenities: ['cafe', 'restroom', 'wifi', 'restaurant', 'security'], payments: payPK, integration: 'simulator', reservations: true, fee: 150, parking: 'Free for 2 hours while charging', description: 'Flagship urban hub with six chargers, covered bays and a café next door.' },
  { name: 'VoltGrid DHA Phase 5', company: 'voltgrid', city: 'Lahore', region: 'Punjab', ...PK, address: 'Commercial Broadway, DHA Phase 5', lat: 31.4627, lng: 74.4089, profile: 'dc', tariff: 'fast', is247: true, amenities: ['cafe', 'restroom', 'convenience_store', 'security'], payments: payPK, integration: 'simulator', reservations: true, fee: 100 },
  { name: 'VoltGrid Packages Mall', company: 'voltgrid', city: 'Lahore', region: 'Punjab', ...PK, address: 'Packages Mall, Walton Road', lat: 31.4712, lng: 74.3555, profile: 'mixed', tariff: 'fast', hours: MALL, amenities: ['shopping', 'restaurant', 'cafe', 'restroom', 'prayer_area', 'covered_parking'], payments: payPK, integration: 'simulator', parking: 'Mall parking fee applies' },
  { name: 'VoltGrid Emporium', company: 'voltgrid', city: 'Lahore', region: 'Punjab', ...PK, address: 'Emporium Mall, Johar Town', lat: 31.4675, lng: 74.2662, profile: 'mixed', tariff: 'fast', hours: MALL, amenities: ['shopping', 'restaurant', 'cafe', 'restroom', 'prayer_area', 'playground', 'covered_parking'], payments: payPK, integration: 'simulator' },
  { name: 'VoltGrid Model Town Park', company: 'voltgrid', city: 'Lahore', region: 'Punjab', ...PK, address: 'Link Road, Model Town', lat: 31.4838, lng: 74.3245, profile: 'ac', tariff: 'ac', hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '06:00', close: '23:00' })), amenities: ['restroom', 'parking'], payments: payPK, integration: 'simulator' },
  { name: 'VoltGrid Allama Iqbal Airport', company: 'voltgrid', city: 'Lahore', region: 'Punjab', ...PK, address: 'Airport Road, Cantt', lat: 31.5196, lng: 74.4024, profile: 'dc', tariff: 'fast', is247: true, amenities: ['cafe', 'restroom', 'covered_parking', 'security'], payments: payPK, integration: 'simulator' },
  { name: 'VoltGrid Bahria Town', company: 'voltgrid', city: 'Lahore', region: 'Punjab', ...PK, address: 'Main Boulevard, Bahria Town', lat: 31.3685, lng: 74.1847, profile: 'dc', tariff: 'fast', is247: true, amenities: ['restaurant', 'restroom', 'prayer_area'], payments: payPK, integration: 'simulator', scenario: 'no_power', description: 'Grid supply interruptions possible during scheduled load management.' },
  { name: 'VoltGrid Liberty Market', company: 'voltgrid', city: 'Lahore', region: 'Punjab', ...PK, address: 'Liberty Roundabout, Gulberg III', lat: 31.5106, lng: 74.3448, profile: 'small', tariff: 'ac', hours: MALL, amenities: ['shopping', 'restaurant', 'cafe'], payments: payPK, integration: 'simulator' },
  { name: 'VoltGrid Thokar Niaz Baig', company: 'voltgrid', city: 'Lahore', region: 'Punjab', ...PK, address: 'Multan Road, near M-2 entry', lat: 31.4718, lng: 74.2405, profile: 'hpc', tariff: 'fast', is247: true, amenities: ['restaurant', 'restroom', 'prayer_area', 'convenience_store', 'security'], payments: payPK, integration: 'simulator', reservations: true, fee: 150 },
  { name: 'VoltGrid Wapda Town (new)', company: 'voltgrid', city: 'Lahore', region: 'Punjab', ...PK, address: 'Main Boulevard, Wapda Town', lat: 31.4319, lng: 74.2652, profile: 'dc', tariff: 'fast', is247: true, amenities: ['restroom'], payments: payPK, integration: 'simulator', listing: 'pending' },
  { name: 'AmpWay Ravi Toll Plaza', company: 'ampway', city: 'Lahore', region: 'Punjab', ...PK, address: 'M-2 Motorway, Ravi Toll Plaza', lat: 31.6042, lng: 74.2283, profile: 'motorway', tariff: 'corridor', is247: true, amenities: ['restaurant', 'restroom', 'prayer_area', 'convenience_store'], payments: ['card', 'cash', 'app'], integration: 'none' },
  { name: 'CityCharge Mall Road', company: 'citycharge', city: 'Lahore', region: 'Punjab', ...PK, address: 'The Mall, near GPO', lat: 31.5582, lng: 74.3214, profile: 'small', tariff: 'std', hours: MALL, amenities: ['shopping'], payments: payPK, integration: 'none', listing: 'draft' },
  { name: 'CityCharge Cavalry Ground', company: 'citycharge', city: 'Lahore', region: 'Punjab', ...PK, address: 'Cavalry Ground Main Boulevard', lat: 31.5005, lng: 74.3752, profile: 'ac', tariff: 'std', hours: MALL, amenities: ['cafe'], payments: payPK, integration: 'none', listing: 'draft' },

  // ── Islamabad / Rawalpindi ──
  { name: 'VoltGrid Blue Area', company: 'voltgrid', city: 'Islamabad', region: 'ICT', ...PK, address: 'Jinnah Avenue, Blue Area', lat: 33.7104, lng: 73.0556, profile: 'hpc', tariff: 'fast', is247: true, amenities: ['cafe', 'restaurant', 'restroom', 'wifi', 'security'], payments: payPK, integration: 'simulator', reservations: true, fee: 150 },
  { name: 'VoltGrid F-7 Jinnah Super', company: 'voltgrid', city: 'Islamabad', region: 'ICT', ...PK, address: 'Jinnah Super Market, F-7 Markaz', lat: 33.7208, lng: 73.0566, profile: 'mixed', tariff: 'fast', hours: MALL, amenities: ['shopping', 'restaurant', 'cafe'], payments: payPK, integration: 'simulator' },
  { name: 'VoltGrid Centaurus', company: 'voltgrid', city: 'Islamabad', region: 'ICT', ...PK, address: 'The Centaurus Mall, F-8', lat: 33.7077, lng: 73.0498, profile: 'dc', tariff: 'fast', hours: MALL, amenities: ['shopping', 'restaurant', 'cafe', 'restroom', 'prayer_area', 'covered_parking'], payments: payPK, integration: 'simulator' },
  { name: 'VoltGrid E-11 Markaz', company: 'voltgrid', city: 'Islamabad', region: 'ICT', ...PK, address: 'E-11/2 Markaz', lat: 33.6996, lng: 72.9773, profile: 'ac', tariff: 'ac', hours: OFFICE, amenities: ['cafe', 'restaurant'], payments: payPK, integration: 'simulator' },
  { name: 'VoltGrid Islamabad Airport', company: 'voltgrid', city: 'Islamabad', region: 'ICT', ...PK, address: 'New Islamabad International Airport, Fateh Jang Road', lat: 33.5532, lng: 72.8335, profile: 'dc', tariff: 'fast', is247: true, amenities: ['cafe', 'restroom', 'covered_parking', 'security'], payments: payPK, integration: 'simulator' },
  { name: 'AmpWay G-11 Express', company: 'ampway', city: 'Islamabad', region: 'ICT', ...PK, address: 'Kashmir Highway, G-11', lat: 33.6694, lng: 72.9997, profile: 'dc', tariff: 'corridor', is247: true, amenities: ['convenience_store', 'restroom'], payments: ['card', 'cash', 'app'], integration: 'none', scenario: 'stale' },
  { name: 'AmpWay Rawalpindi Saddar', company: 'ampway', city: 'Rawalpindi', region: 'Punjab', ...PK, address: 'Bank Road, Saddar', lat: 33.5973, lng: 73.0479, profile: 'gbt', tariff: 'corridor', hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '08:00', close: '23:00' })), amenities: ['restaurant', 'shopping'], payments: ['card', 'cash'], integration: 'none' },
  { name: 'VoltGrid Bahria Phase 7', company: 'voltgrid', city: 'Rawalpindi', region: 'Punjab', ...PK, address: 'Spring North, Bahria Town Phase 7', lat: 33.5227, lng: 73.0956, profile: 'mixed', tariff: 'fast', is247: true, amenities: ['restaurant', 'cafe', 'restroom'], payments: payPK, integration: 'simulator' },

  // ── M-2 motorway & GT Road corridor ──
  { name: 'AmpWay M-2 Sheikhupura', company: 'ampway', city: 'Sheikhupura', region: 'Punjab', ...PK, address: 'M-2 Sheikhupura Interchange', lat: 31.7025, lng: 73.9810, profile: 'dc', tariff: 'corridor', is247: true, amenities: ['restroom', 'convenience_store'], payments: ['card', 'cash', 'app'], integration: 'none' },
  { name: 'AmpWay M-2 Pindi Bhattian', company: 'ampway', city: 'Pindi Bhattian', region: 'Punjab', ...PK, address: 'M-2 Pindi Bhattian Interchange', lat: 31.8985, lng: 73.2725, profile: 'motorway', tariff: 'corridor', is247: true, amenities: ['restaurant', 'restroom', 'prayer_area'], payments: ['card', 'cash', 'app'], integration: 'none' },
  { name: 'AmpWay Salam Service Area', company: 'ampway', city: 'Kot Momin', region: 'Punjab', ...PK, address: 'M-2 Salam Service Area (northbound)', lat: 32.2795, lng: 72.9812, profile: 'motorway', tariff: 'corridor', is247: true, amenities: ['restaurant', 'cafe', 'restroom', 'prayer_area', 'convenience_store'], payments: ['card', 'cash', 'app'], integration: 'none' },
  { name: 'AmpWay Bhera Service Area', company: 'ampway', city: 'Bhera', region: 'Punjab', ...PK, address: 'M-2 Bhera Service Area', lat: 32.4605, lng: 72.9195, profile: 'motorway', tariff: 'corridor', is247: true, amenities: ['restaurant', 'cafe', 'restroom', 'prayer_area', 'convenience_store', 'hotel'], payments: ['card', 'cash', 'app'], integration: 'none', reservations: true, fee: 200 },
  { name: 'AmpWay Kallar Kahar Service Area', company: 'ampway', city: 'Kallar Kahar', region: 'Punjab', ...PK, address: 'M-2 Kallar Kahar Service Area', lat: 32.7802, lng: 72.7012, profile: 'motorway', tariff: 'corridor', is247: true, amenities: ['restaurant', 'cafe', 'restroom', 'prayer_area', 'convenience_store'], payments: ['card', 'cash', 'app'], integration: 'none' },
  { name: 'AmpWay Chakri Service Area', company: 'ampway', city: 'Chakri', region: 'Punjab', ...PK, address: 'M-2 Chakri Service Area', lat: 33.3195, lng: 72.8110, profile: 'motorway', tariff: 'corridor', is247: true, amenities: ['restaurant', 'restroom', 'prayer_area', 'convenience_store'], payments: ['card', 'cash', 'app'], integration: 'none', scenario: 'maintenance' },
  { name: 'AmpWay GT Road Gujranwala', company: 'ampway', city: 'Gujranwala', region: 'Punjab', ...PK, address: 'GT Road, Gujranwala Bypass', lat: 32.1877, lng: 74.1945, profile: 'dc', tariff: 'corridor', is247: true, amenities: ['restaurant', 'restroom'], payments: ['card', 'cash'], integration: 'none' },
  { name: 'AmpWay GT Road Jhelum', company: 'ampway', city: 'Jhelum', region: 'Punjab', ...PK, address: 'GT Road, near Jhelum Bridge', lat: 32.9405, lng: 73.7270, profile: 'gbt', tariff: 'corridor', is247: true, amenities: ['restaurant', 'restroom', 'prayer_area'], payments: ['card', 'cash'], integration: 'none', scenario: 'unknown' },
  { name: 'AmpWay Faisalabad Canal Road', company: 'ampway', city: 'Faisalabad', region: 'Punjab', ...PK, address: 'Canal Road, near Lyallpur Galleria', lat: 31.4180, lng: 73.0790, profile: 'dc', tariff: 'corridor', is247: true, amenities: ['shopping', 'restaurant', 'restroom'], payments: ['card', 'cash', 'app'], integration: 'none' },
  { name: 'AmpWay Sahiwal Bypass', company: 'ampway', city: 'Sahiwal', region: 'Punjab', ...PK, address: 'N-5 Sahiwal Bypass', lat: 30.6682, lng: 73.1066, profile: 'dc', tariff: 'corridor', is247: true, amenities: ['restroom', 'convenience_store'], payments: ['card', 'cash'], integration: 'none' },
  { name: 'AmpWay Multan Cantt', company: 'ampway', city: 'Multan', region: 'Punjab', ...PK, address: 'Bosan Road, Cantt', lat: 30.1975, lng: 71.4697, profile: 'dc', tariff: 'corridor', is247: true, amenities: ['restaurant', 'restroom'], payments: ['card', 'cash'], integration: 'none' },

  // ── Karachi / Hyderabad ──
  { name: 'GreenMile Clifton Block 4', company: 'greenmile', city: 'Karachi', region: 'Sindh', ...PK, address: 'Clifton Block 4, near Dolmen Mall', lat: 24.8138, lng: 67.0300, profile: 'hpc', tariff: 'tou', is247: true, amenities: ['shopping', 'restaurant', 'cafe', 'restroom', 'security'], payments: payPK, integration: 'simulator', reservations: true, fee: 150 },
  { name: 'GreenMile DHA Phase 6', company: 'greenmile', city: 'Karachi', region: 'Sindh', ...PK, address: 'Khayaban-e-Ittehad, DHA Phase 6', lat: 24.7985, lng: 67.0612, profile: 'dc', tariff: 'tou', is247: true, amenities: ['cafe', 'restroom', 'convenience_store'], payments: payPK, integration: 'simulator' },
  { name: 'GreenMile Shahrah-e-Faisal', company: 'greenmile', city: 'Karachi', region: 'Sindh', ...PK, address: 'Shahrah-e-Faisal, near Nursery', lat: 24.8645, lng: 67.0762, profile: 'mixed', tariff: 'tou', is247: true, amenities: ['restaurant', 'restroom', 'prayer_area'], payments: payPK, integration: 'simulator' },
  { name: 'GreenMile Gulshan-e-Iqbal', company: 'greenmile', city: 'Karachi', region: 'Sindh', ...PK, address: 'University Road, Gulshan-e-Iqbal Block 7', lat: 24.9180, lng: 67.0970, profile: 'gbt', tariff: 'tou', hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '07:00', close: '00:00' })), amenities: ['restaurant', 'cafe'], payments: payPK, integration: 'simulator' },
  { name: 'GreenMile Lucky One Mall', company: 'greenmile', city: 'Karachi', region: 'Sindh', ...PK, address: 'Lucky One Mall, Rashid Minhas Road', lat: 24.9322, lng: 67.0874, profile: 'mixed', tariff: 'tou', hours: MALL, amenities: ['shopping', 'restaurant', 'cafe', 'restroom', 'prayer_area', 'playground', 'covered_parking'], payments: payPK, integration: 'simulator' },
  { name: 'GreenMile PECHS Tariq Road', company: 'greenmile', city: 'Karachi', region: 'Sindh', ...PK, address: 'Tariq Road, PECHS Block 2', lat: 24.8700, lng: 67.0600, profile: 'small', tariff: 'tou', hours: MALL, amenities: ['shopping', 'restaurant'], payments: payPK, integration: 'simulator' },
  { name: 'GreenMile North Nazimabad', company: 'greenmile', city: 'Karachi', region: 'Sindh', ...PK, address: 'Block H, North Nazimabad', lat: 24.9420, lng: 67.0400, profile: 'ac', tariff: 'tou', hours: OFFICE, amenities: ['cafe'], payments: payPK, integration: 'simulator' },
  { name: 'GreenMile Jinnah Airport', company: 'greenmile', city: 'Karachi', region: 'Sindh', ...PK, address: 'Jinnah International Airport, Star Gate', lat: 24.9008, lng: 67.1681, profile: 'dc', tariff: 'tou', is247: true, amenities: ['cafe', 'restroom', 'security', 'covered_parking'], payments: payPK, integration: 'simulator' },
  { name: 'GreenMile Bahria Town Karachi', company: 'greenmile', city: 'Karachi', region: 'Sindh', ...PK, address: 'Jinnah Avenue, Bahria Town Karachi', lat: 25.0100, lng: 67.3100, profile: 'dc', tariff: 'tou', is247: true, amenities: ['restaurant', 'restroom', 'prayer_area'], payments: payPK, integration: 'simulator' },
  { name: 'GreenMile M-9 Motorway', company: 'greenmile', city: 'Nooriabad', region: 'Sindh', ...PK, address: 'M-9 Karachi–Hyderabad Motorway, Nooriabad', lat: 25.1708, lng: 67.7834, profile: 'motorway', tariff: 'tou', is247: true, amenities: ['restaurant', 'restroom', 'prayer_area', 'convenience_store'], payments: payPK, integration: 'simulator' },
  { name: 'GreenMile Hyderabad Auto Bhan', company: 'greenmile', city: 'Hyderabad', region: 'Sindh', ...PK, address: 'Auto Bhan Road, Latifabad', lat: 25.3700, lng: 68.3650, profile: 'dc', tariff: 'tou', is247: true, amenities: ['restaurant', 'restroom'], payments: payPK, integration: 'simulator' },

  // ── Dubai / Abu Dhabi ──
  { name: 'DesertVolt Downtown Boulevard', company: 'desertvolt', city: 'Dubai', region: 'Dubai', ...AE, address: 'Sheikh Mohammed bin Rashid Blvd, Downtown', lat: 25.1955, lng: 55.2760, profile: 'hpc', tariff: 'dc', is247: true, amenities: ['shopping', 'restaurant', 'cafe', 'restroom', 'covered_parking', 'wifi'], payments: payAE, integration: 'simulator', reservations: true, fee: 10 },
  { name: 'DesertVolt Dubai Marina', company: 'desertvolt', city: 'Dubai', region: 'Dubai', ...AE, address: 'Marina Walk, Dubai Marina', lat: 25.0805, lng: 55.1403, profile: 'dc', tariff: 'dc', is247: true, amenities: ['restaurant', 'cafe', 'covered_parking'], payments: payAE, integration: 'simulator' },
  { name: 'DesertVolt Business Bay', company: 'desertvolt', city: 'Dubai', region: 'Dubai', ...AE, address: 'Bay Avenue, Business Bay', lat: 25.1865, lng: 55.2640, profile: 'mixed', tariff: 'dc', is247: true, amenities: ['cafe', 'restroom', 'covered_parking'], payments: payAE, integration: 'simulator' },
  { name: 'DesertVolt DIFC Gate', company: 'desertvolt', city: 'Dubai', region: 'Dubai', ...AE, address: 'Gate Avenue, DIFC', lat: 25.2125, lng: 55.2805, profile: 'ac', tariff: 'ac', hours: OFFICE, amenities: ['restaurant', 'cafe', 'covered_parking'], payments: payAE, integration: 'simulator' },
  { name: 'DesertVolt Deira City Centre', company: 'desertvolt', city: 'Dubai', region: 'Dubai', ...AE, address: 'Deira City Centre, Port Saeed', lat: 25.2515, lng: 55.3328, profile: 'mixed', tariff: 'dc', hours: MALL, amenities: ['shopping', 'restaurant', 'cafe', 'restroom', 'prayer_area', 'covered_parking'], payments: payAE, integration: 'simulator' },
  { name: 'DesertVolt Al Barsha', company: 'desertvolt', city: 'Dubai', region: 'Dubai', ...AE, address: 'Al Barsha 1, near Mall of the Emirates', lat: 25.1175, lng: 55.2010, profile: 'hpc', tariff: 'dc', is247: true, amenities: ['shopping', 'restaurant', 'cafe', 'restroom'], payments: payAE, integration: 'simulator' },
  { name: 'DesertVolt Jebel Ali', company: 'desertvolt', city: 'Dubai', region: 'Dubai', ...AE, address: 'Sheikh Zayed Road, Jebel Ali Exit 13', lat: 25.0105, lng: 55.1300, profile: 'motorway', tariff: 'dc', is247: true, amenities: ['restroom', 'convenience_store', 'cafe'], payments: payAE, integration: 'simulator' },
  { name: 'DesertVolt Silicon Oasis', company: 'desertvolt', city: 'Dubai', region: 'Dubai', ...AE, address: 'Dubai Silicon Oasis HQ', lat: 25.1205, lng: 55.3790, profile: 'dc', tariff: 'dc', is247: true, amenities: ['cafe', 'restroom'], payments: payAE, integration: 'simulator' },
  { name: 'DesertVolt Abu Dhabi Corniche', company: 'desertvolt', city: 'Abu Dhabi', region: 'Abu Dhabi', ...AE, address: 'Corniche Road West', lat: 24.4760, lng: 54.3400, profile: 'hpc', tariff: 'dc', is247: true, amenities: ['restaurant', 'cafe', 'restroom', 'playground'], payments: payAE, integration: 'simulator' },
  { name: 'DesertVolt Sharjah Al Nahda', company: 'desertvolt', city: 'Sharjah', region: 'Sharjah', ...AE, address: 'Al Nahda Street', lat: 25.3000, lng: 55.3700, profile: 'dc', tariff: 'dc', is247: true, amenities: ['shopping', 'restroom'], payments: payAE, integration: 'simulator' },
];

export const PLACES: [string, string, string | null, string, number, number][] = [
  // name, kind, city, country, lat, lng
  ['Lahore', 'city', null, 'Pakistan', 31.5204, 74.3587],
  ['Islamabad', 'city', null, 'Pakistan', 33.6844, 73.0479],
  ['Rawalpindi', 'city', null, 'Pakistan', 33.5651, 73.0169],
  ['Karachi', 'city', null, 'Pakistan', 24.8607, 67.0011],
  ['Hyderabad', 'city', null, 'Pakistan', 25.396, 68.3578],
  ['Faisalabad', 'city', null, 'Pakistan', 31.418, 73.079],
  ['Multan', 'city', null, 'Pakistan', 30.1575, 71.5249],
  ['Gujranwala', 'city', null, 'Pakistan', 32.1877, 74.1945],
  ['Sahiwal', 'city', null, 'Pakistan', 30.6682, 73.1066],
  ['Jhelum', 'city', null, 'Pakistan', 32.9405, 73.727],
  ['Murree', 'city', null, 'Pakistan', 33.907, 73.3943],
  ['Peshawar', 'city', null, 'Pakistan', 34.0151, 71.5249],
  ['Dubai', 'city', null, 'United Arab Emirates', 25.2048, 55.2708],
  ['Abu Dhabi', 'city', null, 'United Arab Emirates', 24.4539, 54.3773],
  ['Sharjah', 'city', null, 'United Arab Emirates', 25.3463, 55.4209],
  ['Gulberg', 'area', 'Lahore', 'Pakistan', 31.516, 74.348],
  ['DHA Phase 5, Lahore', 'area', 'Lahore', 'Pakistan', 31.4627, 74.4089],
  ['Johar Town', 'area', 'Lahore', 'Pakistan', 31.4697, 74.2728],
  ['Model Town', 'area', 'Lahore', 'Pakistan', 31.4836, 74.324],
  ['Bahria Town Lahore', 'area', 'Lahore', 'Pakistan', 31.3656, 74.1855],
  ['Mall Road Lahore', 'area', 'Lahore', 'Pakistan', 31.558, 74.329],
  ['Badshahi Mosque', 'landmark', 'Lahore', 'Pakistan', 31.5879, 74.3107],
  ['Minar-e-Pakistan', 'landmark', 'Lahore', 'Pakistan', 31.5925, 74.3095],
  ['Allama Iqbal International Airport', 'landmark', 'Lahore', 'Pakistan', 31.5216, 74.4036],
  ['Lahore University of Management Sciences (LUMS)', 'landmark', 'Lahore', 'Pakistan', 31.4707, 74.4111],
  ['Blue Area', 'area', 'Islamabad', 'Pakistan', 33.7104, 73.0556],
  ['F-7 Markaz', 'area', 'Islamabad', 'Pakistan', 33.7208, 73.0566],
  ['Faisal Mosque', 'landmark', 'Islamabad', 'Pakistan', 33.7295, 73.0372],
  ['Pakistan Monument', 'landmark', 'Islamabad', 'Pakistan', 33.6932, 73.0688],
  ['Islamabad International Airport', 'landmark', 'Islamabad', 'Pakistan', 33.5532, 72.8335],
  ['Bahria Town Rawalpindi', 'area', 'Rawalpindi', 'Pakistan', 33.5227, 73.0956],
  ['Bhera Service Area (M-2)', 'highway', 'Bhera', 'Pakistan', 32.4605, 72.9195],
  ['Kallar Kahar (M-2)', 'highway', 'Kallar Kahar', 'Pakistan', 32.7802, 72.7012],
  ['Clifton', 'area', 'Karachi', 'Pakistan', 24.8138, 67.03],
  ['DHA Phase 6, Karachi', 'area', 'Karachi', 'Pakistan', 24.7985, 67.0612],
  ['Gulshan-e-Iqbal', 'area', 'Karachi', 'Pakistan', 24.918, 67.097],
  ['Mazar-e-Quaid', 'landmark', 'Karachi', 'Pakistan', 24.8754, 67.0405],
  ['Sea View Karachi', 'landmark', 'Karachi', 'Pakistan', 24.7889, 67.0453],
  ['Jinnah International Airport', 'landmark', 'Karachi', 'Pakistan', 24.9008, 67.1681],
  ['Downtown Dubai', 'area', 'Dubai', 'United Arab Emirates', 25.1972, 55.2744],
  ['Dubai Marina', 'area', 'Dubai', 'United Arab Emirates', 25.08, 55.14],
  ['Burj Khalifa', 'landmark', 'Dubai', 'United Arab Emirates', 25.1972, 55.2744],
  ['Dubai International Airport', 'landmark', 'Dubai', 'United Arab Emirates', 25.2532, 55.3657],
  ['Palm Jumeirah', 'area', 'Dubai', 'United Arab Emirates', 25.1124, 55.139],
  ['Sheikh Zayed Grand Mosque', 'landmark', 'Abu Dhabi', 'United Arab Emirates', 24.4128, 54.4749],
];

// Offline highway graph (approximate geometry) — used only when no routing provider is reachable.
export const ROAD_NODES: [string, string, number, number][] = [
  ['LHR', 'Lahore', 31.5204, 74.3587],
  ['LHR_W', 'Thokar Niaz Baig', 31.4718, 74.2405],
  ['RAVI', 'Ravi Toll Plaza (M-2)', 31.6042, 74.2283],
  ['SKP', 'Sheikhupura Interchange', 31.7025, 73.981],
  ['KKD', 'Khanqah Dogran', 31.83, 73.62],
  ['PBN', 'Pindi Bhattian', 31.8985, 73.2725],
  ['SALAM', 'Salam Service Area', 32.2795, 72.9812],
  ['BHERA', 'Bhera Service Area', 32.4605, 72.9195],
  ['KLK', 'Kallar Kahar', 32.7802, 72.7012],
  ['BLK', 'Balkasar', 32.93, 72.68],
  ['CHAKRI', 'Chakri Service Area', 33.3195, 72.811],
  ['ISB_TP', 'Islamabad Toll Plaza', 33.618, 72.928],
  ['ISB', 'Islamabad', 33.6844, 73.0479],
  ['RWP', 'Rawalpindi', 33.5973, 73.0479],
  ['GRW', 'Gujranwala', 32.1877, 74.1945],
  ['WZD', 'Wazirabad', 32.443, 74.12],
  ['GJT', 'Gujrat', 32.574, 74.079],
  ['KHR', 'Kharian', 32.811, 73.865],
  ['JLM', 'Jhelum', 32.9405, 73.727],
  ['DINA', 'Dina', 33.03, 73.6],
  ['GJK', 'Gujar Khan', 33.254, 73.304],
  ['FSD', 'Faisalabad', 31.418, 73.079],
  ['SWL', 'Sahiwal', 30.6682, 73.1066],
  ['OKR', 'Okara', 30.8138, 73.4534],
  ['MUX', 'Multan', 30.1975, 71.4697],
  ['KHI', 'Karachi', 24.8607, 67.0011],
  ['KHI_TP', 'M-9 Karachi Toll Plaza', 25.0315, 67.2402],
  ['NRB', 'Nooriabad', 25.1708, 67.7834],
  ['HYD', 'Hyderabad', 25.396, 68.3578],
  ['DXB', 'Dubai', 25.2048, 55.2708],
  ['DXB_MAR', 'Dubai Marina', 25.0805, 55.1403],
  ['JBA', 'Jebel Ali', 25.0105, 55.13],
  ['GHT', 'Ghantoot', 24.85, 54.88],
  ['AUH', 'Abu Dhabi', 24.4539, 54.3773],
  ['SHJ', 'Sharjah', 25.3463, 55.4209],
];

export const ROAD_EDGES: [string, string, string, number][] = [
  ['LHR', 'LHR_W', 'Multan Road', 40],
  ['LHR', 'RAVI', 'Ring Road', 60],
  ['LHR_W', 'RAVI', 'Ring Road', 70],
  ['RAVI', 'SKP', 'M-2', 110],
  ['SKP', 'KKD', 'M-2', 110],
  ['KKD', 'PBN', 'M-2', 110],
  ['PBN', 'SALAM', 'M-2', 110],
  ['SALAM', 'BHERA', 'M-2', 110],
  ['BHERA', 'KLK', 'M-2', 105],
  ['KLK', 'BLK', 'M-2 (Salt Range)', 80],
  ['BLK', 'CHAKRI', 'M-2', 110],
  ['CHAKRI', 'ISB_TP', 'M-2', 110],
  ['ISB_TP', 'ISB', 'Srinagar Highway', 70],
  ['ISB', 'RWP', 'Islamabad Expressway', 50],
  ['LHR', 'GRW', 'GT Road (N-5)', 65],
  ['GRW', 'WZD', 'GT Road (N-5)', 65],
  ['WZD', 'GJT', 'GT Road (N-5)', 60],
  ['GJT', 'KHR', 'GT Road (N-5)', 65],
  ['KHR', 'JLM', 'GT Road (N-5)', 60],
  ['JLM', 'DINA', 'GT Road (N-5)', 60],
  ['DINA', 'GJK', 'GT Road (N-5)', 65],
  ['GJK', 'RWP', 'GT Road (N-5)', 60],
  ['PBN', 'FSD', 'M-4', 110],
  ['FSD', 'MUX', 'M-4', 110],
  ['LHR_W', 'OKR', 'N-5 / M-3', 85],
  ['OKR', 'SWL', 'N-5', 80],
  ['SWL', 'MUX', 'N-5', 80],
  ['KHI', 'KHI_TP', 'Super Highway', 60],
  ['KHI_TP', 'NRB', 'M-9', 110],
  ['NRB', 'HYD', 'M-9', 110],
  ['DXB', 'DXB_MAR', 'Sheikh Zayed Road (E11)', 80],
  ['DXB_MAR', 'JBA', 'Sheikh Zayed Road (E11)', 100],
  ['JBA', 'GHT', 'E11', 120],
  ['GHT', 'AUH', 'E11', 120],
  ['DXB', 'SHJ', 'E11', 60],
];

export const REVIEW_TEXT: [number, string][] = [
  [5, 'Fast and reliable. Got from 20% to 80% in about 25 minutes.'],
  [5, 'Clean, well lit and the staff were helpful. Café next door is a bonus.'],
  [4, 'Good speeds, but one charger was out of service when I visited.'],
  [4, 'Easy to find and pay through the app. Parking can get tight in the evening.'],
  [3, 'Charging was fine but the peak-hour rate is steep. I now come after 11 pm.'],
  [5, 'Perfect stop on a road trip — food, prayer area and quick charging.'],
  [2, 'Waited 30 minutes for a free port on Friday evening.'],
  [4, 'Shared power between two bays — speed dropped when the neighbour plugged in.'],
  [5, 'Never had an issue here. Reservations work well.'],
  [3, 'Decent, though the cable barely reaches the charging port on my car.'],
  [1, 'Station showed available but power was down. Please update status faster.'],
  [4, 'Comfortable lounge while waiting. Prices are fair off-peak.'],
];

export const FIRST_NAMES = ['Ali', 'Fatima', 'Usman', 'Zainab', 'Hassan', 'Maryam', 'Ahmed', 'Hira', 'Imran', 'Noor', 'Saad', 'Amna', 'Faisal', 'Sara', 'Kamran', 'Mahnoor', 'Rehan', 'Iqra', 'Tariq', 'Laiba', 'Khalid', 'Aisha', 'Yusuf', 'Leila', 'Rashid', 'Mariam', 'Daniyal', 'Anaya', 'Zeeshan', 'Rabia'];
export const LAST_NAMES = ['Malik', 'Qureshi', 'Sheikh', 'Butt', 'Chaudhry', 'Hussain', 'Iqbal', 'Rana', 'Javed', 'Mirza', 'Al Mansoori', 'Haddad', 'Farooq', 'Anwar', 'Saleem'];

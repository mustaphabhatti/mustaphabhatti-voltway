const bool = (v: string | undefined, d: boolean) => (v == null || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://evcharge:evcharge@localhost:5432/evcharge',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  publicApiUrl: process.env.PUBLIC_API_URL ?? process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  isProd: process.env.NODE_ENV === 'production',
  demoSimulator: bool(process.env.DEMO_SIMULATOR, true),
  demoSessionSpeed: Math.max(1, Number(process.env.DEMO_SESSION_SPEED ?? 30)),
  routingProvider: (process.env.ROUTING_PROVIDER ?? 'auto') as 'auto' | 'osrm' | 'mapbox' | 'offline',
  osrmUrl: process.env.OSRM_URL ?? 'https://router.project-osrm.org',
  geocoder: (process.env.GEOCODER ?? 'auto') as 'auto' | 'nominatim' | 'mapbox' | 'local',
  nominatimUrl: process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org',
  mapboxToken: process.env.MAPBOX_TOKEN ?? '',
  google: { clientId: process.env.GOOGLE_CLIENT_ID ?? '', clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '' },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID ?? '',
    teamId: process.env.APPLE_TEAM_ID ?? '',
    keyId: process.env.APPLE_KEY_ID ?? '',
    privateKey: (process.env.APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  },
  paymentProvider: (process.env.PAYMENT_PROVIDER ?? 'demo') as 'demo' | 'stripe',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  ocppAutoAccept: bool(process.env.OCPP_AUTO_ACCEPT, false),
  externalTimeoutMs: Number(process.env.EXTERNAL_TIMEOUT_MS ?? 6000),
};

if (config.isProd && config.jwtSecret.startsWith('dev-')) {
  throw new Error('JWT_SECRET must be set in production');
}

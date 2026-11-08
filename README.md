# Voltway — EV charging & smart navigation platform

Voltway helps EV drivers find compatible chargers, see what's free, compare prices across peak and off-peak, estimate charging time with real charging curves, and plan EV routes with charging stops. Drivers can check in, upload photos and add missing stations, and those contributions feed a station reliability score. Charging companies get a dashboard for stations, ports, tariffs and analytics, and platform admins get a moderation and verification console.

It runs as one platform with three clients:

| App | Stack | For |
|---|---|---|
| `apps/web` | Next.js 16 · React 19 · Tailwind 4 · Leaflet · Recharts | Drivers, operators and admins (responsive, light/dark) |
| `apps/mobile` | Expo SDK 58 · React Native 0.88 · Expo Router · react-native-maps | Native Android & iOS driver app |
| `apps/api` | Fastify 5 · PostgreSQL 16 + PostGIS · WebSockets · OCPP 1.6J | Shared backend |
| `packages/shared` | TypeScript | Charging estimator, tariff engine, route planner, recommendations, reliability score (used by API, web and mobile) |

> **Demo data.** The seed creates fictional operators, stations, prices, drivers and reviews (flagged `is_demo`). Availability from the built-in simulator is always labelled **"Demo feed (simulated)"** and is never shown as live.

---

## Features

**Drivers (web + mobile)**
- Map-first explore screen with colour-coded pins (availability, max kW, reliability score), search (city, area, address, station), map/list views and filters: connector, AC/DC, power, price now, availability, open now, 24/7, amenities, network, reliability score, location type and coming-soon stations.
- Station pages: per-port status with **data provenance** (Live / Demo feed / Reported by operator / Driver report / Estimated), pricing with peak/off-peak schedule, fees, opening hours, amenities, payment methods, popular times (estimated from history), reviews, photos, and an "About this information" panel.
- **Charging estimator:** uses the vehicle's DC curve, on-board AC limit, shared-power cabinets, efficiency losses and temperature. It never assumes the charger's rated power is what the car receives. It shows duration, energy (into the battery and billed), cost integrated over time-of-use windows, completion time, and "start now vs cheapest time".
- **Smart picks:** ranks nearby stations by total time (drive + wait + charge), cost, distance, wait and reliability, with side-by-side comparison.
- **EV route planner:** picks charging stops for the car and battery level, and shows arrival battery at every stop, charge time, cost, total trip time, alternative routes and strategies (fastest / fewest stops / cheapest). It hands off to Google Maps / Apple Maps / Waze.
- **Community features (PlugShare-style, with Voltway's own design):**
  - Check-ins: charged / couldn't charge (with the problem) / waiting / charging now / comment, with observed kW, duration and a photo.
  - **Reliability score (0–10)** from recency-weighted check-ins and ratings.
  - Driver photos, recent activity feed, driver-added and coming-soon stations (including shared home chargers), contributor stats and badges.
- Reservations, app-started charging sessions with live progress, invoices, payment methods, favorites, saved places, charging history, and support tickets.
- Notifications (in-app + real-time, plus local push on mobile) for charging complete, reservation reminders, price changes, peak pricing, outages, availability, low battery on a trip, traffic, and cheaper alternatives. Each type has a preference toggle.

**Charging companies (web)**
- Company registration with document upload → admin verification. Stations stay drafts until the company is verified.
- Station CRUD with a map location picker, opening hours, amenities, payment methods, photos and maintenance mode. Port CRUD with manual status updates.
- Tariff editor: peak/off-peak windows by day, weekend rate, seasonal multipliers, dated discounts, dynamic pricing, session/time/parking/idle fees, service charge and tax, with a live preview. Price changes notify drivers who saved the station.
- OCPP charger registration (with Basic auth), reservations, reviews with replies, driver check-ins.
- Analytics: sessions, energy, revenue, average duration, utilization, unique drivers, ratings, daily trends, a peak-hours heatmap, port availability/uptime, top stations and CSV export.

**Platform admin (web)**
- Users (roles, suspension), company verification, station listing approval (including driver submissions), data-quality scoring, driver reports, review and photo moderation, complaints, platform analytics, integrations health, settings and pricing guardrails, and an audit log.

**Integrations**
- **OCPP 1.6J central system** at `ws://<api>/ocpp/<chargePointId>`: BootNotification, Heartbeat, StatusNotification (→ live status), Start/StopTransaction, MeterValues, RemoteStart/Stop, ReserveNow.
- **OCPI 2.2.1** locations import (eMSP pull), configured in Admin → Integrations.
- Routing: Mapbox Directions with live traffic (if `MAPBOX_TOKEN` is set) → OSRM → an offline highway-graph fallback (approximate, clearly labelled). Geocoding: Mapbox / Nominatim plus a local gazetteer. Without a live provider, traffic comes from a typical-pattern model labelled "estimated".
- Payments: provider interface with a demo provider (no money moves; invoices labelled demo) and Stripe PaymentIntents.
- Sign-in: email or phone + password; Google and Apple OAuth on the web when configured.

---

## Quick start (local)

Requirements: Node 20+, PostgreSQL 14+ with PostGIS 3.

```bash
# 1. Database
createuser -s evcharge && createdb -O evcharge evcharge
psql -d evcharge -c "ALTER USER evcharge PASSWORD 'evcharge'; CREATE EXTENSION postgis;"

# 2. Install (root workspaces: shared, api, web)
npm install

# 3. Configure
cp apps/api/.env.example apps/api/.env      # set JWT_SECRET
cp apps/web/.env.example apps/web/.env.local

# 4. Schema + demo data
npm run db:migrate
npm run db:seed          # or: npm run db:reset

# 5. Run
npm run dev:api          # http://localhost:4000
npm run dev:web          # http://localhost:3000
```

Demo accounts (password `Demo1234!`): `driver@voltway.demo`, `ops@voltgrid.demo` (operator), `admin@voltway.demo`.

### Mobile app (Android / iOS)

The mobile app is a separate Expo project (kept outside the npm workspaces so its React Native versions stay pinned to the Expo SDK).

```bash
cd apps/mobile
npm install
cp .env.example .env     # set EXPO_PUBLIC_API_URL to an address your phone/emulator can reach
npx expo start           # press a (Android) / i (iOS), or scan the QR code with Expo Go
```

- Android emulator → `http://10.0.2.2:4000` · iOS simulator → `http://localhost:4000` · physical phone → `http://<your-computer-LAN-IP>:4000`.
- Android builds need a Google Maps key in `GOOGLE_MAPS_ANDROID_API_KEY`. iOS uses Apple Maps.
- Store builds with EAS: `npx eas-cli@latest build --platform android|ios --profile production`. Set the production API URL in `eas.json`.
- Operators and admins use the web dashboard.

### Try a real OCPP charger (emulated)

```bash
cd apps/api
npx tsx tools/ocpp-charge-point.ts AMPWAY-RAVI-01 ws://localhost:4000 5
```

The seeded "AmpWay Ravi Toll Plaza" station switches to **live** status. Start charging from the app to see RemoteStart → MeterValues → RemoteStop → invoice.

---

## Configuration

API (`apps/api/.env`): `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN`, `PUBLIC_API_URL`, `DEMO_SIMULATOR`, `DEMO_SESSION_SPEED`, `ROUTING_PROVIDER`, `OSRM_URL`, `GEOCODER`, `NOMINATIM_URL`, `MAPBOX_TOKEN`, `GOOGLE_CLIENT_ID/SECRET`, `APPLE_CLIENT_ID/TEAM_ID/KEY_ID/PRIVATE_KEY`, `PAYMENT_PROVIDER`, `STRIPE_SECRET_KEY`, `OCPP_AUTO_ACCEPT`.

Web (`apps/web/.env.local`): `API_URL` (proxy target), `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_MAPBOX_TOKEN` (optional Mapbox tiles; OpenStreetMap/CARTO tiles otherwise).

Mobile (`apps/mobile/.env`): `EXPO_PUBLIC_API_URL`, `GOOGLE_MAPS_ANDROID_API_KEY`, `GOOGLE_MAPS_IOS_API_KEY` (optional).

## Architecture

```
apps/api/src
  routes/        auth · stations · routing · driver · community · operator · admin
  services/      stations (PostGIS queries, shaping) · sessions · portStatus · notifications
  integrations/  maps (mapbox, osrm, offline, traffic, geocoding) · charging (ocpp16, simulator) · ocpi · payments
  realtime/      WebSocket hub (topics: stations, station:<id>, user:<id>, session:<id>)
  jobs/          reservation reminders/expiry, peak-price warnings, check-in expiry
apps/api/db      SQL migrations, seed data, migration runner
packages/shared  estimator · pricing · routePlanner · recommend · status/reliability · geo · types
apps/web         Next.js App Router: (driver), operator, admin, (auth)
apps/mobile/src  Expo Router screens (app/), components, lib (api, auth, realtime, location, theme)
```

Every port status change goes through one service (`setPortStatus`). It records history for analytics, broadcasts over WebSockets and fires notifications. Each status carries its source, so the clients can say exactly where it came from.

## Tests

```bash
npm test            # shared estimator/pricing/planner tests + API unit tests
npm run typecheck   # shared, api, web
cd apps/mobile && npx tsc --noEmit
```

## What's demo vs production-ready

- **Ready, with configuration:** OCPP 1.6J chargers, OCPI locations import, Mapbox/OSRM routing, Stripe payments, Google/Apple web sign-in.
- **Demo stand-ins:** the simulator (availability and charging sessions), the demo payment provider, the offline routing graph (covers the seeded regions only), and the typical-traffic model. All are labelled in the UI.
- **Next steps:** remote push via Expo push tokens / FCM / APNs, native Google/Apple sign-in on mobile (expo-auth-session), OCPI push endpoints and tariffs module, marker clustering for very large networks, Redis-backed WebSocket fan-out for multi-instance deployments, and fleet management.

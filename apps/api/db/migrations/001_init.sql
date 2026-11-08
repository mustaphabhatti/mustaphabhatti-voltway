-- ════════════════════════════════════════════════════════════════════════════
-- Voltway schema — PostgreSQL 14+ with PostGIS 3
-- ════════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

-- ── Users & auth ────────────────────────────────────────────────────────────
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext UNIQUE,
  phone           text UNIQUE,
  password_hash   text,
  full_name       text NOT NULL DEFAULT '',
  role            text NOT NULL DEFAULT 'driver' CHECK (role IN ('driver','operator','admin')),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  avatar_url      text,
  auth_provider   text NOT NULL DEFAULT 'password',   -- password | google | apple
  provider_subject text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_login_at   timestamptz,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE UNIQUE INDEX users_provider_subject_idx ON users(auth_provider, provider_subject) WHERE provider_subject IS NOT NULL;

CREATE TABLE user_preferences (
  user_id               uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  currency              text,
  distance_unit         text NOT NULL DEFAULT 'km',
  min_arrival_soc       int  NOT NULL DEFAULT 15 CHECK (min_arrival_soc BETWEEN 0 AND 50),
  preferred_networks    text[] NOT NULL DEFAULT '{}',
  avoid_networks        text[] NOT NULL DEFAULT '{}',
  notification_prefs    jsonb NOT NULL DEFAULT '{}'::jsonb,
  home_city             text,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── Vehicles ────────────────────────────────────────────────────────────────
CREATE TABLE vehicle_models (
  id                  serial PRIMARY KEY,
  brand               text NOT NULL,
  model               text NOT NULL,
  variant             text NOT NULL DEFAULT '',
  battery_kwh         numeric(6,1) NOT NULL,        -- usable
  max_ac_kw           numeric(6,1) NOT NULL,
  max_dc_kw           numeric(6,1) NOT NULL,
  connectors          text[] NOT NULL,
  curve_profile       text NOT NULL DEFAULT 'standard_400v',
  efficiency_wh_km    int NOT NULL DEFAULT 170,
  UNIQUE (brand, model, variant)
);

CREATE TABLE user_vehicles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_id            int REFERENCES vehicle_models(id),
  nickname            text NOT NULL DEFAULT '',
  brand               text NOT NULL,
  model               text NOT NULL,
  battery_kwh         numeric(6,1) NOT NULL CHECK (battery_kwh > 0),
  max_ac_kw           numeric(6,1) NOT NULL DEFAULT 7.4,
  max_dc_kw           numeric(6,1) NOT NULL DEFAULT 50,
  connectors          text[] NOT NULL,
  curve_profile       text NOT NULL DEFAULT 'standard_400v',
  efficiency_wh_km    int NOT NULL DEFAULT 170,
  current_soc         int NOT NULL DEFAULT 50 CHECK (current_soc BETWEEN 0 AND 100),
  target_soc          int NOT NULL DEFAULT 80 CHECK (target_soc BETWEEN 1 AND 100),
  is_default          boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_vehicles_user_idx ON user_vehicles(user_id);

-- ── Companies (charging operators / networks) ──────────────────────────────
CREATE TABLE companies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  slug                  text UNIQUE NOT NULL,
  legal_name            text,
  registration_number   text,
  tax_id                text,
  email                 text,
  phone                 text,
  website               text,
  address               text,
  country               text NOT NULL DEFAULT 'PK',
  brand_color           text DEFAULT '#10b981',
  logo_url              text,
  description           text,
  verification_status   text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected','suspended')),
  verification_notes    text,
  documents             jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified_at           timestamptz,
  verified_by           uuid REFERENCES users(id),
  created_by            uuid REFERENCES users(id),
  is_demo               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE company_members (
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role text NOT NULL DEFAULT 'owner' CHECK (member_role IN ('owner','manager','staff')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);
CREATE INDEX company_members_user_idx ON company_members(user_id);

CREATE TABLE tariffs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  config      jsonb NOT NULL,               -- see packages/shared/src/pricing.ts (Tariff)
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tariffs_company_idx ON tariffs(company_id);

-- ── Stations & ports ───────────────────────────────────────────────────────
CREATE TABLE stations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tariff_id           uuid REFERENCES tariffs(id) ON DELETE SET NULL,
  name                text NOT NULL,
  description         text,
  address             text NOT NULL,
  city                text NOT NULL,
  region              text,
  country             text NOT NULL DEFAULT 'PK',
  postal_code         text,
  location            geography(Point, 4326) NOT NULL,
  timezone            text NOT NULL DEFAULT 'Asia/Karachi',
  phone               text,
  is_24_7             boolean NOT NULL DEFAULT false,
  opening_hours       jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{day:0..6, open:"HH:MM", close:"HH:MM"}]
  amenities           text[] NOT NULL DEFAULT '{}',
  payment_methods     text[] NOT NULL DEFAULT '{}',
  parking_info        text,
  access_type         text NOT NULL DEFAULT 'public' CHECK (access_type IN ('public','restricted','private')),
  images              text[] NOT NULL DEFAULT '{}',
  listing_status      text NOT NULL DEFAULT 'pending' CHECK (listing_status IN ('draft','pending','approved','rejected','suspended')),
  rejection_reason    text,
  maintenance_mode    boolean NOT NULL DEFAULT false,
  maintenance_note    text,
  reservations_enabled boolean NOT NULL DEFAULT false,
  reservation_fee     numeric(10,2) NOT NULL DEFAULT 0,
  integration_type    text NOT NULL DEFAULT 'none' CHECK (integration_type IN ('none','ocpp','ocpi','simulator','operator_api')),
  integration_ref     text,
  data_source         text NOT NULL DEFAULT 'operator',
  is_demo             boolean NOT NULL DEFAULT false,
  info_updated_at     timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stations_location_gix ON stations USING gist(location);
CREATE INDEX stations_company_idx ON stations(company_id);
CREATE INDEX stations_listing_idx ON stations(listing_status);
CREATE INDEX stations_name_trgm ON stations USING gin (name gin_trgm_ops);
CREATE INDEX stations_city_trgm ON stations USING gin (city gin_trgm_ops);
CREATE INDEX stations_address_trgm ON stations USING gin (address gin_trgm_ops);

CREATE TABLE ports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id          uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  label               text NOT NULL,
  evse_uid            text,
  connector_type      text NOT NULL,
  current_type        text NOT NULL CHECK (current_type IN ('AC','DC')),
  max_power_kw        numeric(6,1) NOT NULL CHECK (max_power_kw > 0),
  voltage             int,
  amperage            int,
  power_group         text,     -- ports sharing one power cabinet
  status              text NOT NULL DEFAULT 'unknown' CHECK (status IN ('available','charging','occupied','reserved','out_of_service','offline','no_power','unknown')),
  status_source       text NOT NULL DEFAULT 'operator_reported' CHECK (status_source IN ('live','simulated','operator_reported','user_reported','estimated','static')),
  status_updated_at   timestamptz,
  ocpp_connector_id   int,
  tariff_id           uuid REFERENCES tariffs(id) ON DELETE SET NULL,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ports_station_idx ON ports(station_id);

CREATE TABLE port_status_events (
  id          bigserial PRIMARY KEY,
  port_id     uuid NOT NULL REFERENCES ports(id) ON DELETE CASCADE,
  station_id  uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  status      text NOT NULL,
  source      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX port_status_events_station_time_idx ON port_status_events(station_id, created_at);

-- OCPP charge points (one per physical charger)
CREATE TABLE charge_points (
  id              text PRIMARY KEY,              -- chargePointIdentity
  station_id      uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  password_hash   text,
  vendor          text,
  model           text,
  serial_number   text,
  firmware        text,
  ocpp_version    text NOT NULL DEFAULT '1.6J',
  connected       boolean NOT NULL DEFAULT false,
  last_boot_at    timestamptz,
  last_heartbeat_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Driver data ─────────────────────────────────────────────────────────────
CREATE TABLE favorites (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  station_id  uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  notify      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, station_id)
);

CREATE TABLE saved_places (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       text NOT NULL,
  address     text NOT NULL,
  location    geography(Point, 4326) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE station_watches (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  station_id  uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  connector_types text[] NOT NULL DEFAULT '{}',
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, station_id)
);

CREATE TABLE reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id      uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating          int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden','flagged')),
  operator_reply  text,
  operator_replied_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, user_id)
);
CREATE INDEX reviews_station_idx ON reviews(station_id);

CREATE TABLE review_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      text NOT NULL,
  resolved    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, user_id)
);

CREATE TABLE station_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id      uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  port_id         uuid REFERENCES ports(id) ON DELETE SET NULL,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('status','wrong_info','closed','price','other')),
  reported_status text,
  message         text NOT NULL DEFAULT '',
  resolved        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Reservations, sessions, payments ───────────────────────────────────────
CREATE TABLE reservations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  station_id  uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  port_id     uuid NOT NULL REFERENCES ports(id) ON DELETE CASCADE,
  vehicle_id  uuid REFERENCES user_vehicles(id) ON DELETE SET NULL,
  start_at    timestamptz NOT NULL,
  end_at      timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','active','completed','cancelled','expired')),
  fee         numeric(10,2) NOT NULL DEFAULT 0,
  currency    text NOT NULL DEFAULT 'PKR',
  reminded    boolean NOT NULL DEFAULT false,
  control_ref text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);
CREATE INDEX reservations_port_time_idx ON reservations(port_id, start_at, end_at);
CREATE INDEX reservations_user_idx ON reservations(user_id);

CREATE TABLE payment_methods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('card','wallet','local_gateway')),
  provider      text NOT NULL,       -- demo | stripe | jazzcash | easypaisa | ...
  label         text NOT NULL,
  brand         text,
  last4         text,
  provider_ref  text,
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE charging_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES users(id) ON DELETE SET NULL,
  station_id        uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  port_id           uuid REFERENCES ports(id) ON DELETE SET NULL,
  vehicle_id        uuid REFERENCES user_vehicles(id) ON DELETE SET NULL,
  reservation_id    uuid REFERENCES reservations(id) ON DELETE SET NULL,
  payment_method_id uuid REFERENCES payment_methods(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','completed','stopped','failed')),
  control_source    text NOT NULL DEFAULT 'simulator',   -- simulator | ocpp | ocpi | manual | historical
  ocpp_transaction_id int,
  started_at        timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  start_soc         numeric(5,1),
  current_soc       numeric(5,1),
  target_soc        numeric(5,1),
  energy_kwh        numeric(10,3) NOT NULL DEFAULT 0,
  power_kw          numeric(8,2) NOT NULL DEFAULT 0,
  cost_total        numeric(12,2) NOT NULL DEFAULT 0,
  cost_breakdown    jsonb,
  currency          text NOT NULL DEFAULT 'PKR',
  is_demo           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_station_time_idx ON charging_sessions(station_id, started_at);
CREATE INDEX sessions_user_idx ON charging_sessions(user_id, started_at DESC);
CREATE UNIQUE INDEX sessions_ocpp_tx_idx ON charging_sessions(ocpp_transaction_id) WHERE ocpp_transaction_id IS NOT NULL;
CREATE SEQUENCE ocpp_transaction_seq START 1000;

CREATE TABLE session_meter_values (
  session_id  uuid NOT NULL REFERENCES charging_sessions(id) ON DELETE CASCADE,
  ts          timestamptz NOT NULL DEFAULT now(),
  energy_kwh  numeric(10,3) NOT NULL,
  power_kw    numeric(8,2) NOT NULL,
  soc         numeric(5,1)
);
CREATE INDEX session_meter_values_idx ON session_meter_values(session_id, ts);

CREATE SEQUENCE invoice_number_seq START 10001;
CREATE TABLE invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number            text UNIQUE NOT NULL,
  session_id        uuid REFERENCES charging_sessions(id) ON DELETE SET NULL,
  reservation_id    uuid REFERENCES reservations(id) ON DELETE SET NULL,
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id        uuid REFERENCES companies(id) ON DELETE SET NULL,
  amount            numeric(12,2) NOT NULL,
  currency          text NOT NULL,
  breakdown         jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_status    text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded')),
  payment_provider  text,
  provider_ref      text,
  issued_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoices_user_idx ON invoices(user_id, issued_at DESC);

-- ── Notifications ───────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key  text,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);
CREATE UNIQUE INDEX notifications_dedupe_idx ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- ── Admin / platform ────────────────────────────────────────────────────────
CREATE TABLE complaints (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  station_id  uuid REFERENCES stations(id) ON DELETE SET NULL,
  company_id  uuid REFERENCES companies(id) ON DELETE SET NULL,
  category    text NOT NULL DEFAULT 'other',
  subject     text NOT NULL,
  description text NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  priority    text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  admin_notes text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES users(id)
);

CREATE TABLE integrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN ('ocpi','ocpp','operator_api')),
  name            text NOT NULL,
  company_id      uuid REFERENCES companies(id) ON DELETE CASCADE,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled         boolean NOT NULL DEFAULT false,
  last_sync_at    timestamptz,
  status_message  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Offline gazetteer used when no external geocoder is configured/reachable
CREATE TABLE places (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'area',   -- city | area | landmark | highway
  city        text,
  country     text NOT NULL,
  location    geography(Point, 4326) NOT NULL
);
CREATE INDEX places_name_trgm ON places USING gin (name gin_trgm_ops);

-- Offline road graph used as a routing fallback (demo regions)
CREATE TABLE road_nodes (
  id    text PRIMARY KEY,
  name  text NOT NULL,
  lat   double precision NOT NULL,
  lng   double precision NOT NULL
);
CREATE TABLE road_edges (
  a          text NOT NULL REFERENCES road_nodes(id),
  b          text NOT NULL REFERENCES road_nodes(id),
  road       text NOT NULL,
  speed_kmh  int NOT NULL,
  PRIMARY KEY (a, b)
);

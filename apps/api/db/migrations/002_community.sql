-- ════════════════════════════════════════════════════════════════════════════
-- Community features: check-ins, driver photos, community-submitted stations,
-- coming-soon listings, home charger sharing.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE stations ADD COLUMN coming_soon boolean NOT NULL DEFAULT false;
ALTER TABLE stations ADD COLUMN submitted_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE stations ADD COLUMN location_type text NOT NULL DEFAULT 'public'
  CHECK (location_type IN ('public','destination','dealership','workplace','residential','highway'));
ALTER TABLE stations ADD COLUMN host_notes text;
ALTER TABLE companies ADD COLUMN is_community boolean NOT NULL DEFAULT false;

CREATE TABLE checkins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id      uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  port_id         uuid REFERENCES ports(id) ON DELETE SET NULL,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_label   text,
  outcome         text NOT NULL CHECK (outcome IN ('charged','could_not_charge','waiting','charging_now','comment')),
  problem         text CHECK (problem IN ('broken','occupied','blocked_by_ice','no_power','payment_failed','slow','access','other')),
  kw_observed     numeric(6,1),
  duration_min    int CHECK (duration_min BETWEEN 1 AND 1440),
  comment         text NOT NULL DEFAULT '',
  photo_url       text,
  charging_until  timestamptz,
  status          text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkins_station_idx ON checkins(station_id, created_at DESC);
CREATE INDEX checkins_user_idx ON checkins(user_id, created_at DESC);
CREATE INDEX checkins_time_idx ON checkins(created_at DESC);

CREATE TABLE station_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id  uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  checkin_id  uuid REFERENCES checkins(id) ON DELETE SET NULL,
  url         text NOT NULL,
  caption     text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden','pending')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX station_photos_station_idx ON station_photos(station_id, created_at DESC);

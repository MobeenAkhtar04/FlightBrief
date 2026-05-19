-- FlightBrief database schema
-- run this once to set up the tables
-- postgres 16

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS briefings (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    departure               TEXT NOT NULL,
    arrival                 TEXT NOT NULL,
    distance_nm             FLOAT,
    bearing_deg             FLOAT,
    flight_time_hrs         FLOAT,
    fuel_burn_gal           FLOAT,
    departure_metar_raw     TEXT,
    arrival_metar_raw       TEXT,
    departure_flight_rules  TEXT,
    arrival_flight_rules    TEXT,
    decision                TEXT,            -- GO or NOGO
    decision_reasons        JSONB,           -- array of reason strings
    full_brief              JSONB            -- entire briefing response stored here
);

-- index for filtering by airport pair
CREATE INDEX IF NOT EXISTS idx_briefings_departure ON briefings (departure);
CREATE INDEX IF NOT EXISTS idx_briefings_arrival ON briefings (arrival);
CREATE INDEX IF NOT EXISTS idx_briefings_created_at ON briefings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_briefings_dep_arr ON briefings (departure, arrival);

-- WeatherWise AI database schema (Stages 1-7)

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saved_locations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    name       TEXT NOT NULL,
    country    TEXT,
    admin1     TEXT,
    latitude   REAL NOT NULL,
    longitude  REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS preferences (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            INTEGER NOT NULL UNIQUE,
    temperature_unit   TEXT NOT NULL DEFAULT 'celsius',
    wind_speed_unit    TEXT NOT NULL DEFAULT 'kmh',
    notifications_on   INTEGER NOT NULL DEFAULT 1,
    comfort_preference TEXT NOT NULL DEFAULT 'normal',
    updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS forecast_history (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id    INTEGER NOT NULL,
    forecast_date  TEXT NOT NULL,
    temperature    REAL,
    humidity       REAL,
    wind_speed     REAL,
    condition      TEXT,
    fetched_at     TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (location_id) REFERENCES saved_locations (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_reports (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER,
    reporter_name       TEXT NOT NULL DEFAULT 'Anonymous',
    location_name       TEXT,
    latitude            REAL NOT NULL,
    longitude           REAL NOT NULL,
    category            TEXT NOT NULL DEFAULT 'rain',
    condition           TEXT NOT NULL,
    description         TEXT,
    photo_reference     TEXT,
    moderation_status   TEXT NOT NULL DEFAULT 'pending',
    verification_status TEXT NOT NULL DEFAULT 'unverified',
    moderator_note      TEXT,
    expires_at          TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS forecast_snapshots (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    location_key         TEXT NOT NULL,
    location_name        TEXT,
    latitude             REAL NOT NULL,
    longitude            REAL NOT NULL,
    fetched_at           TEXT NOT NULL,
    valid_time           TEXT NOT NULL,
    horizon_hours        INTEGER,
    source               TEXT NOT NULL DEFAULT 'open-meteo',
    predicted_temp       REAL,
    predicted_precip_prob REAL,
    predicted_precip_mm  REAL,
    predicted_wind_kmh   REAL,
    weather_code         INTEGER,
    payload_json         TEXT
);

CREATE TABLE IF NOT EXISTS observations (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    location_key       TEXT NOT NULL,
    latitude           REAL NOT NULL,
    longitude          REAL NOT NULL,
    observed_at        TEXT NOT NULL,
    source             TEXT NOT NULL DEFAULT 'manual-observation',
    observed_temp      REAL,
    observed_precip_mm REAL,
    observed_wind_kmh  REAL,
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weather_alerts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    source           TEXT NOT NULL,
    alert_type       TEXT NOT NULL,
    severity         TEXT NOT NULL,
    area             TEXT NOT NULL,
    latitude         REAL,
    longitude        REAL,
    issued_at        TEXT NOT NULL,
    expires_at       TEXT NOT NULL,
    headline         TEXT NOT NULL,
    description      TEXT,
    source_reference TEXT,
    is_official      INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cache_records (
    cache_key       TEXT PRIMARY KEY,
    location_params TEXT,
    payload         TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    expires_at      TEXT NOT NULL
);

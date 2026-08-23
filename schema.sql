-- mery secure backend — Cloudflare D1 schema
-- All admin data lives here (server-only). The browser never reads this directly;
-- it goes through authenticated Pages Functions at /api/*.

CREATE TABLE IF NOT EXISTS users (
  username   TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'admin',
  salt       TEXT NOT NULL,
  iterations INTEGER NOT NULL DEFAULT 100000,
  hash       TEXT NOT NULL,
  algo       TEXT NOT NULL DEFAULT 'PBKDF2-SHA256',
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id         TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id         TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS discounts (
  id         TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hero (
  id   TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  ord  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key  TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO meta (key, value) VALUES ('sessionVersion', '1');

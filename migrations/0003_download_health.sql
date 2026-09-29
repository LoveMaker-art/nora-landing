CREATE TABLE IF NOT EXISTS installer_health (
 url TEXT PRIMARY KEY,
 state TEXT NOT NULL,
 checked_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS installer_checks (
 platform TEXT PRIMARY KEY,
 attempted_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS installer_links (
 platform TEXT PRIMARY KEY,
 url TEXT NOT NULL,
 published TEXT NOT NULL,
 checked_at INTEGER NOT NULL
);

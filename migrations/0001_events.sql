CREATE TABLE IF NOT EXISTS events (
 event_id TEXT PRIMARY KEY,
 visitor_id TEXT NOT NULL,
 occurred_at INTEGER NOT NULL,
 event TEXT NOT NULL CHECK(event IN ('pageview','download_click','help_open','link_click','installer_resolve')),
 action TEXT NOT NULL DEFAULT '',
 platform TEXT NOT NULL DEFAULT '',
 result TEXT NOT NULL DEFAULT '',
 channel TEXT NOT NULL DEFAULT '',
 device TEXT NOT NULL DEFAULT '',
 hostname TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_time ON events(occurred_at);
CREATE INDEX IF NOT EXISTS events_event_time ON events(event, occurred_at);

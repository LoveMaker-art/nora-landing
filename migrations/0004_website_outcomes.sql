ALTER TABLE events RENAME TO events_v1;
CREATE TABLE IF NOT EXISTS events (
 event_id TEXT PRIMARY KEY,
 visitor_id TEXT NOT NULL,
 occurred_at INTEGER NOT NULL,
 event TEXT NOT NULL CHECK(event IN ('pageview','download_click','help_open','link_click','installer_resolve','download_ready','download_failed')),
 action TEXT NOT NULL DEFAULT '',
 platform TEXT NOT NULL DEFAULT '',
 result TEXT NOT NULL DEFAULT '',
 channel TEXT NOT NULL DEFAULT '',
 device TEXT NOT NULL DEFAULT '',
 received_at INTEGER NOT NULL DEFAULT (unixepoch()*1000),
 hostname TEXT NOT NULL
);
INSERT INTO events (event_id,visitor_id,occurred_at,event,action,platform,result,channel,device,hostname,received_at) SELECT event_id,visitor_id,occurred_at,event,action,platform,result,channel,device,hostname,occurred_at FROM events_v1;
DROP TABLE events_v1;
CREATE INDEX events_time ON events(occurred_at);
CREATE INDEX events_event_time ON events(event,occurred_at);

CREATE TABLE IF NOT EXISTS launcher_events (
 event_id TEXT PRIMARY KEY,
 installation_id TEXT NOT NULL,
 operation_id TEXT NOT NULL,
 sequence INTEGER NOT NULL,
 event TEXT NOT NULL,
 occurred_at INTEGER NOT NULL,
 received_at INTEGER NOT NULL,
 platform TEXT NOT NULL,
 arch TEXT NOT NULL,
 launcher_version TEXT NOT NULL,
 product_version TEXT NOT NULL,
 cohort TEXT NOT NULL,
 action TEXT NOT NULL,
 stage TEXT NOT NULL,
 status TEXT NOT NULL,
 error_code TEXT NOT NULL,
 elapsed_ms INTEGER NOT NULL,
 stage_elapsed_ms INTEGER NOT NULL,
 progress_age_ms INTEGER,
 UNIQUE(installation_id, sequence)
);
CREATE INDEX IF NOT EXISTS launcher_events_time ON launcher_events(occurred_at);
CREATE INDEX IF NOT EXISTS launcher_events_operation ON launcher_events(operation_id, sequence);
CREATE INDEX IF NOT EXISTS launcher_events_task ON launcher_events(installation_id, operation_id, sequence);
CREATE INDEX IF NOT EXISTS launcher_events_kind ON launcher_events(event, occurred_at);

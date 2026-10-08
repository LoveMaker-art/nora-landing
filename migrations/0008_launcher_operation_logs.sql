-- Raw redacted operation records are separate from funnel/error events.
CREATE TABLE IF NOT EXISTS launcher_operation_logs (
  installation_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  log_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK(chunk_index >= 0 AND chunk_index < 4096),
  chunk_id TEXT NOT NULL,
  text TEXT NOT NULL,
  final INTEGER NOT NULL CHECK(final IN (0,1)),
  missing TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY(installation_id,operation_id,log_id,chunk_index)
);
CREATE UNIQUE INDEX IF NOT EXISTS launcher_operation_logs_final
  ON launcher_operation_logs(installation_id,operation_id,log_id) WHERE final=1;

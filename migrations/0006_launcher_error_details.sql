-- Additive: older launchers continue sending v1 records without these fields.
ALTER TABLE launcher_events ADD COLUMN error_source TEXT NOT NULL DEFAULT '';
ALTER TABLE launcher_events ADD COLUMN error_site TEXT NOT NULL DEFAULT '';
ALTER TABLE launcher_events ADD COLUMN system_code TEXT NOT NULL DEFAULT '';
ALTER TABLE launcher_events ADD COLUMN http_status INTEGER;
ALTER TABLE launcher_events ADD COLUMN exit_code INTEGER;
ALTER TABLE launcher_events ADD COLUMN exit_signal TEXT NOT NULL DEFAULT '';
ALTER TABLE launcher_events ADD COLUMN error_kind TEXT NOT NULL DEFAULT '';
ALTER TABLE launcher_events ADD COLUMN attempt INTEGER NOT NULL DEFAULT 0;

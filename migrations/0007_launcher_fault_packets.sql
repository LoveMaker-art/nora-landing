-- Additive: v1/v2 events keep a NULL fault. Only v3 failures carry bounded sanitized evidence.
ALTER TABLE launcher_events ADD COLUMN fault TEXT;

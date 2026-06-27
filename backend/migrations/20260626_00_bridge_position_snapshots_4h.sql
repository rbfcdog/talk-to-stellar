-- Move bridge_position_snapshots from one-per-day to 4-hour buckets so the
-- invested-balance chart shows a real, curving series instead of a single flat
-- point per day that gets overwritten on every read.
--
-- snapshot_date stops being a calendar DATE and becomes a TIMESTAMP holding the
-- 4h bucket boundary (00,04,08,12,16,20 UTC). The uniqueness moves to
-- (public_key, snapshot_date) on that timestamp, so each 4h window is its own
-- row and earlier points are preserved.

BEGIN;

-- Drop the old one-per-day uniqueness (default Postgres constraint name).
ALTER TABLE bridge_position_snapshots
  DROP CONSTRAINT IF EXISTS bridge_position_snapshots_public_key_snapshot_date_key;

-- DATE → TIMESTAMP (existing rows cast to midnight of their day).
ALTER TABLE bridge_position_snapshots
  ALTER COLUMN snapshot_date TYPE TIMESTAMP USING snapshot_date::timestamp;

-- New uniqueness on the 4h bucket timestamp.
ALTER TABLE bridge_position_snapshots
  DROP CONSTRAINT IF EXISTS bridge_position_snapshots_pk_bucket_key;
ALTER TABLE bridge_position_snapshots
  ADD CONSTRAINT bridge_position_snapshots_pk_bucket_key UNIQUE (public_key, snapshot_date);

COMMIT;

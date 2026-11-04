ALTER TABLE duplicate_review_cases ADD COLUMN snapshot_id TEXT REFERENCES snapshots(id);
ALTER TABLE duplicate_review_cases ADD COLUMN match_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS duplicate_review_cases_snapshot_pair_idx
  ON duplicate_review_cases(snapshot_id, member_id_a, member_id_b, reason);
CREATE INDEX IF NOT EXISTS duplicate_review_cases_snapshot_status_idx
  ON duplicate_review_cases(snapshot_id, status);

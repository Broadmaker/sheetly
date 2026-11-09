ALTER TABLE email_validation_results ADD COLUMN reviewed_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS email_validation_results_record_policy_idx
  ON email_validation_results(member_snapshot_record_id, policy_version);

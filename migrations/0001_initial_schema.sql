PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'division', 'district', 'school', 'viewer')),
  scope_type TEXT NOT NULL DEFAULT 'global' CHECK (scope_type IN ('global', 'division', 'district', 'school')),
  scope_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS divisions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS districts (
  id TEXT PRIMARY KEY,
  division_id TEXT REFERENCES divisions(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS schools (
  school_id TEXT PRIMARY KEY,
  school_name TEXT NOT NULL,
  district_id TEXT REFERENCES districts(id),
  division_id TEXT REFERENCES divisions(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS reporting_periods (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  period_start TEXT,
  period_end TEXT,
  cutoff_date TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL CHECK (module IN ('school', 'member')),
  original_filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  reporting_period TEXT NOT NULL,
  export_date TEXT,
  uploaded_by TEXT REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'committed', 'rejected', 'superseded')),
  validation_summary_json TEXT NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS uploads_dedupe_idx
  ON uploads(module, checksum_sha256, reporting_period);
CREATE INDEX IF NOT EXISTS uploads_module_period_idx
  ON uploads(module, reporting_period);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  upload_id TEXT NOT NULL UNIQUE REFERENCES uploads(id),
  module TEXT NOT NULL CHECK (module IN ('school', 'member')),
  reporting_period TEXT NOT NULL,
  export_date TEXT,
  download_basis TEXT NOT NULL DEFAULT 'unknown' CHECK (download_basis IN ('cumulative', 'period', 'unknown')),
  record_count INTEGER NOT NULL DEFAULT 0,
  supersedes_snapshot_id TEXT REFERENCES snapshots(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS snapshots_module_period_idx
  ON snapshots(module, reporting_period);

CREATE TABLE IF NOT EXISTS school_snapshot_records (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL,
  school_name TEXT,
  registered_users INTEGER,
  actual_users INTEGER,
  participation_rate REAL,
  downloads INTEGER,
  raw_json TEXT NOT NULL DEFAULT '{}',
  row_status TEXT NOT NULL DEFAULT 'accepted' CHECK (row_status IN ('accepted', 'warning', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS school_snapshot_records_snapshot_school_idx
  ON school_snapshot_records(snapshot_id, school_id);
CREATE INDEX IF NOT EXISTS school_snapshot_records_school_idx
  ON school_snapshot_records(school_id);

CREATE TABLE IF NOT EXISTS member_snapshot_records (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  last_name TEXT,
  first_name TEXT,
  middle_name TEXT,
  full_name_normalized TEXT,
  gender TEXT,
  account_status TEXT,
  email TEXT,
  email_normalized TEXT,
  portal_role TEXT,
  total_downloads INTEGER,
  registered_at TEXT,
  school_id TEXT,
  school_name TEXT,
  district_id TEXT,
  district_name TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  row_status TEXT NOT NULL DEFAULT 'accepted' CHECK (row_status IN ('accepted', 'warning', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS member_snapshot_records_snapshot_member_idx
  ON member_snapshot_records(snapshot_id, member_id);
CREATE INDEX IF NOT EXISTS member_snapshot_records_member_idx
  ON member_snapshot_records(member_id);
CREATE INDEX IF NOT EXISTS member_snapshot_records_email_idx
  ON member_snapshot_records(email_normalized);
CREATE INDEX IF NOT EXISTS member_snapshot_records_name_idx
  ON member_snapshot_records(full_name_normalized);

CREATE TABLE IF NOT EXISTS comparisons (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL CHECK (module IN ('school', 'member')),
  previous_snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  current_snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  scope_warning TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'warning'))
);

CREATE INDEX IF NOT EXISTS comparisons_snapshots_idx
  ON comparisons(previous_snapshot_id, current_snapshot_id);

CREATE TABLE IF NOT EXISTS school_comparison_results (
  id TEXT PRIMARY KEY,
  comparison_id TEXT NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL,
  school_name TEXT,
  previous_downloads INTEGER,
  current_downloads INTEGER,
  difference INTEGER,
  percentage_change REAL,
  category TEXT NOT NULL CHECK (category IN ('increased', 'decreased', 'no_change', 'new', 'missing', 'invalid')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS school_comparison_results_comparison_school_idx
  ON school_comparison_results(comparison_id, school_id);

CREATE TABLE IF NOT EXISTS member_comparison_results (
  id TEXT PRIMARY KEY,
  comparison_id TEXT NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('new', 'existing', 'missing', 'updated_profile', 'status_changed', 'invalid')),
  previous_total_downloads INTEGER,
  current_total_downloads INTEGER,
  difference INTEGER,
  changed_fields_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS member_comparison_results_comparison_member_idx
  ON member_comparison_results(comparison_id, member_id);

CREATE TABLE IF NOT EXISTS duplicate_review_cases (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL DEFAULT 'member' CHECK (module IN ('school', 'member')),
  member_id_a TEXT NOT NULL,
  member_id_b TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('duplicate_id', 'shared_email', 'same_name', 'similar_name')),
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'not_duplicate', 'resolved_external')),
  reviewed_by TEXT REFERENCES users(id),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS duplicate_review_cases_status_idx
  ON duplicate_review_cases(status);

CREATE TABLE IF NOT EXISTS member_assignment_history (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  school_id TEXT,
  school_name TEXT,
  district_id TEXT,
  district_name TEXT,
  effective_date TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS member_assignment_history_member_idx
  ON member_assignment_history(member_id);

CREATE TABLE IF NOT EXISTS transfer_events (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  previous_snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  current_snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  previous_school_id TEXT,
  previous_school_name TEXT,
  previous_district TEXT,
  current_school_id TEXT,
  current_school_name TEXT,
  current_district TEXT,
  profile_update_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  note TEXT,
  reviewed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS transfer_events_status_idx
  ON transfer_events(status);

CREATE TABLE IF NOT EXISTS email_policies (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  policy_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS email_validation_results (
  id TEXT PRIMARY KEY,
  member_snapshot_record_id TEXT NOT NULL REFERENCES member_snapshot_records(id) ON DELETE CASCADE,
  email TEXT,
  domain TEXT,
  classification TEXT NOT NULL CHECK (classification IN ('deped_domain', 'non_deped_domain', 'invalid_missing', 'needs_verification')),
  policy_version INTEGER NOT NULL,
  reviewed_by TEXT REFERENCES users(id),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS email_validation_results_classification_idx
  ON email_validation_results(classification);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS audit_logs_created_idx
  ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON audit_logs(entity_type, entity_id);

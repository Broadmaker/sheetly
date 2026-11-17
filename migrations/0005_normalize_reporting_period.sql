-- Normalize any legacy full-date reporting periods (YYYY-MM-DD) to the
-- monthly format used by the app (YYYY-MM).
UPDATE uploads
SET reporting_period = substr(reporting_period, 1, 7)
WHERE length(reporting_period) > 7;

UPDATE snapshots
SET reporting_period = substr(reporting_period, 1, 7)
WHERE length(reporting_period) > 7;

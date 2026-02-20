-- Migration: 006_data_sources_health_tracking.sql
-- Description: Add health monitoring fields for data source reliability
-- Date: 2026-02-19
-- Feature: fix-heritage-site-imports

ALTER TABLE data_sources
ADD COLUMN health_status VARCHAR(20) CHECK (health_status IN ('healthy', 'unhealthy', 'unknown')) DEFAULT 'unknown',
ADD COLUMN last_import_attempt TIMESTAMP,
ADD COLUMN last_successful_import TIMESTAMP,
ADD COLUMN last_error_timestamp TIMESTAMP,
ADD COLUMN last_error_message TEXT,
ADD COLUMN consecutive_failure_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN success_count_7day INTEGER NOT NULL DEFAULT 0,
ADD COLUMN failure_count_7day INTEGER NOT NULL DEFAULT 0;

-- Computed column for success rate (updated via trigger or application logic)
ALTER TABLE data_sources
ADD COLUMN success_rate_7day DECIMAL(5,2) GENERATED ALWAYS AS (
  CASE 
    WHEN (success_count_7day + failure_count_7day) = 0 THEN NULL
    ELSE ROUND((success_count_7day::decimal / (success_count_7day + failure_count_7day)) * 100, 2)
  END
) STORED;

-- Index for health monitoring queries
CREATE INDEX idx_data_sources_health 
  ON data_sources(health_status) 
  WHERE health_status = 'unhealthy';

CREATE INDEX idx_data_sources_last_import 
  ON data_sources(last_import_attempt DESC);

COMMENT ON COLUMN data_sources.health_status IS 'Current health: healthy (recent success), unhealthy (recent failures), unknown (not yet attempted)';
COMMENT ON COLUMN data_sources.last_import_attempt IS 'Timestamp of most recent import attempt (success or failure)';
COMMENT ON COLUMN data_sources.last_successful_import IS 'Timestamp of most recent successful import';
COMMENT ON COLUMN data_sources.last_error_timestamp IS 'Timestamp of most recent import error';
COMMENT ON COLUMN data_sources.last_error_message IS 'Error message from most recent failure for operational debugging';
COMMENT ON COLUMN data_sources.consecutive_failure_count IS 'Number of consecutive failures, reset to 0 on success';
COMMENT ON COLUMN data_sources.success_count_7day IS 'Number of successful imports in last 7 days (rolling window)';
COMMENT ON COLUMN data_sources.failure_count_7day IS 'Number of failed imports in last 7 days (rolling window)';
COMMENT ON COLUMN data_sources.success_rate_7day IS 'Computed success percentage over last 7 days';

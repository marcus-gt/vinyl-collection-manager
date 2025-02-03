-- Extend session timeout to 24 hours (in seconds)
ALTER TABLE auth.sessions
  ALTER COLUMN max_age_seconds SET DEFAULT 86400;  -- 24 hours = 86400 seconds

-- Update existing sessions to use the new timeout
UPDATE auth.sessions
SET max_age_seconds = 86400
WHERE max_age_seconds < 86400; 

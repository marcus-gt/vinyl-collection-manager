-- Add format columns to vinyl_records table
-- master_format: format of the original master release (e.g., "Vinyl", "CD")
-- current_release_format: format of the specific release the user owns

ALTER TABLE vinyl_records
ADD COLUMN IF NOT EXISTS master_format TEXT,
ADD COLUMN IF NOT EXISTS current_release_format TEXT;

-- Add index for filtering by format
CREATE INDEX IF NOT EXISTS idx_vinyl_records_current_release_format ON vinyl_records(current_release_format);

-- Add comment explaining the columns
COMMENT ON COLUMN vinyl_records.master_format IS 'Format of the original master release (e.g., Vinyl, CD, Cassette)';
COMMENT ON COLUMN vinyl_records.current_release_format IS 'Format of the specific release the user owns (e.g., Vinyl, CD, Cassette)';


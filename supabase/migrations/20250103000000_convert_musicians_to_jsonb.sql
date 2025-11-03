-- Convert musicians column from text[] to JSONB to store categorized credits
-- This allows storing the nested structure: {"Instruments": {"Wind": [...], ...}, "Visual": {...}, ...}

-- Alter the column type to JSONB, converting existing text arrays to JSONB arrays
ALTER TABLE vinyl_records 
ALTER COLUMN musicians TYPE jsonb USING to_jsonb(musicians);

-- Set default to empty object instead of NULL
ALTER TABLE vinyl_records 
ALTER COLUMN musicians SET DEFAULT '{}'::jsonb;

-- Add a comment explaining the new structure
COMMENT ON COLUMN vinyl_records.musicians IS 
'Categorized credits in JSONB format: {"Heading": {"Subheading": ["Name (Role)", ...], ...}, ...}. 
Example: {"Instruments": {"Wind Instruments": ["John Coltrane (Tenor Saxophone)"], "Keyboard": ["Bill Evans (Piano)"]}, "Production": {"General": ["Nesuhi Ertegun (Producer)"]}}. 
Legacy records may still have simple arrays ["Name (Role)", ...].';

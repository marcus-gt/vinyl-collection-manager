-- Add a JSONB column to store option colors
ALTER TABLE custom_columns
ADD COLUMN option_colors JSONB DEFAULT '{}'::jsonb;

-- Add default_value column
ALTER TABLE custom_columns
ADD COLUMN default_value TEXT;

-- Add apply_to_all column
ALTER TABLE custom_columns
ADD COLUMN apply_to_all BOOLEAN DEFAULT false;

COMMENT ON COLUMN custom_columns.option_colors IS 'Maps option values to their colors, e.g., {"Option1": "blue", "Option2": "red"}';
COMMENT ON COLUMN custom_columns.default_value IS 'Default value for new records';
COMMENT ON COLUMN custom_columns.apply_to_all IS 'Whether to apply default value to all existing records'; 

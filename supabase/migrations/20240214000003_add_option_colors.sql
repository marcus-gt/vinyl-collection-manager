-- Add a JSONB column to store option colors
ALTER TABLE custom_columns
ADD COLUMN option_colors JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN custom_columns.option_colors IS 'Maps option values to their colors, e.g., {"Option1": "blue", "Option2": "red"}'; 

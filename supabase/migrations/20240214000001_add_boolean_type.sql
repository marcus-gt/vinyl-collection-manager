-- Update the type check constraint to include boolean type
ALTER TABLE custom_columns DROP CONSTRAINT custom_columns_type_check;
ALTER TABLE custom_columns ADD CONSTRAINT custom_columns_type_check 
  CHECK (type IN ('text', 'number', 'single-select', 'multi-select', 'boolean')); 

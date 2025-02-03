-- Add function to clean up invalid values when options are removed
CREATE OR REPLACE FUNCTION clean_up_invalid_values()
RETURNS TRIGGER AS $$
BEGIN
    -- For single-select and multi-select columns
    IF NEW.type IN ('single-select', 'multi-select') AND OLD.options IS DISTINCT FROM NEW.options THEN
        -- Get removed options
        WITH removed_options AS (
            SELECT jsonb_array_elements_text(OLD.options) AS opt
            EXCEPT
            SELECT jsonb_array_elements_text(NEW.options) AS opt
        )
        -- Update values that use removed options
        UPDATE custom_column_values cv
        SET value = CASE
            WHEN NEW.type = 'single-select' AND value IN (SELECT opt FROM removed_options)
                THEN ''  -- Clear single-select values
            WHEN NEW.type = 'multi-select'
                THEN (
                    SELECT string_agg(opt, ',')
                    FROM unnest(string_to_array(cv.value, ',')) AS opt
                    WHERE opt NOT IN (SELECT opt FROM removed_options)
                )
            ELSE value
        END
        WHERE cv.column_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS clean_up_invalid_values_trigger ON custom_columns;

-- Add trigger to clean up values when options are removed
CREATE TRIGGER clean_up_invalid_values_trigger
    AFTER UPDATE ON custom_columns
    FOR EACH ROW
    EXECUTE FUNCTION clean_up_invalid_values(); 

-- Add custom_values_cache column to vinyl_records
ALTER TABLE vinyl_records 
ADD COLUMN custom_values_cache JSONB DEFAULT '{}'::jsonb;

-- Create function to update the cache
CREATE OR REPLACE FUNCTION update_custom_values_cache()
RETURNS TRIGGER AS $$
BEGIN
    -- For INSERT/UPDATE on custom_column_values
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        UPDATE vinyl_records
        SET custom_values_cache = (
            SELECT COALESCE(
                jsonb_object_agg(cc.id::text, ccv.value),
                '{}'::jsonb
            )
            FROM custom_column_values ccv
            JOIN custom_columns cc ON ccv.column_id = cc.id
            WHERE ccv.record_id = NEW.record_id
            GROUP BY ccv.record_id
        )
        WHERE id = NEW.record_id;
    -- For DELETE
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE vinyl_records
        SET custom_values_cache = (
            SELECT COALESCE(
                jsonb_object_agg(cc.id::text, ccv.value),
                '{}'::jsonb
            )
            FROM custom_column_values ccv
            JOIN custom_columns cc ON ccv.column_id = cc.id
            WHERE ccv.record_id = OLD.record_id
            GROUP BY ccv.record_id
        )
        WHERE id = OLD.record_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to maintain the cache
CREATE TRIGGER trigger_update_custom_values_cache
AFTER INSERT OR UPDATE OR DELETE ON custom_column_values
FOR EACH ROW EXECUTE FUNCTION update_custom_values_cache();

-- Populate initial cache data
UPDATE vinyl_records vr
SET custom_values_cache = (
    SELECT COALESCE(
        jsonb_object_agg(cc.id::text, ccv.value),
        '{}'::jsonb
    )
    FROM custom_column_values ccv
    JOIN custom_columns cc ON ccv.column_id = cc.id
    WHERE ccv.record_id = vr.id
    GROUP BY ccv.record_id
);

-- Add comment explaining the cache
COMMENT ON COLUMN vinyl_records.custom_values_cache IS 
'Denormalized cache of custom column values. Format: {"column_id": "value"}';

-- Create rollback function in case we need to revert
CREATE OR REPLACE FUNCTION rebuild_custom_values_cache()
RETURNS void AS $$
BEGIN
    UPDATE vinyl_records vr
    SET custom_values_cache = (
        SELECT COALESCE(
            jsonb_object_agg(cc.id::text, ccv.value),
            '{}'::jsonb
        )
        FROM custom_column_values ccv
        JOIN custom_columns cc ON ccv.column_id = cc.id
        WHERE ccv.record_id = vr.id
        GROUP BY ccv.record_id
    );
END;
$$ LANGUAGE plpgsql; 

-- Create custom columns table
CREATE TABLE custom_columns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('text', 'number', 'select')),
    options JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, name)
);

-- Create custom column values table
CREATE TABLE custom_column_values (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    record_id UUID NOT NULL REFERENCES vinyl_records(id) ON DELETE CASCADE,
    column_id UUID NOT NULL REFERENCES custom_columns(id) ON DELETE CASCADE,
    value TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(record_id, column_id)
);

-- Add RLS policies for custom_columns
ALTER TABLE custom_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own custom columns"
    ON custom_columns FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own custom columns"
    ON custom_columns FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own custom columns"
    ON custom_columns FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own custom columns"
    ON custom_columns FOR DELETE
    USING (auth.uid() = user_id);

-- Add RLS policies for custom_column_values
ALTER TABLE custom_column_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view values for their columns"
    ON custom_column_values FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM custom_columns
            WHERE id = column_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert values for their columns"
    ON custom_column_values FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM custom_columns
            WHERE id = column_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update values for their columns"
    ON custom_column_values FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM custom_columns
            WHERE id = column_id AND user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM custom_columns
            WHERE id = column_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete values for their columns"
    ON custom_column_values FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM custom_columns
            WHERE id = column_id AND user_id = auth.uid()
        )
    );

-- Add function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to update updated_at
CREATE TRIGGER update_custom_columns_updated_at
    BEFORE UPDATE ON custom_columns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_column_values_updated_at
    BEFORE UPDATE ON custom_column_values
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add function to clean up invalid values when options are removed
CREATE OR REPLACE FUNCTION clean_up_invalid_values()
RETURNS TRIGGER AS $$
BEGIN
    -- For single-select columns
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

-- Add trigger to clean up values when options are removed
CREATE TRIGGER clean_up_invalid_values_trigger
    AFTER UPDATE ON custom_columns
    FOR EACH ROW
    EXECUTE FUNCTION clean_up_invalid_values(); 

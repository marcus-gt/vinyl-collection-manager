-- Create function for updating timestamps
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create table for storing column filter preferences
CREATE TABLE column_filters (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    column_id VARCHAR NOT NULL,
    filter_value JSONB,  -- Store any type of filter value (text, array, range, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, column_id)
);

-- Add trigger for updated_at
CREATE TRIGGER set_timestamp
    BEFORE UPDATE ON column_filters
    FOR EACH ROW
    EXECUTE PROCEDURE trigger_set_timestamp();

-- Add index for faster lookups
CREATE INDEX idx_column_filters_user_id ON column_filters(user_id); 

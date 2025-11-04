-- Create relational model for music contributors
-- Replaces the JSON musicians field with proper tables

-- 1. CONTRIBUTORS TABLE
-- Stores unique contributors (musicians, producers, engineers, etc.)
CREATE TABLE IF NOT EXISTS contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE contributors IS 'Unique list of all contributors (musicians, producers, engineers, etc.)';

-- 2. CONTRIBUTION CATEGORIES TABLE
-- Stores the hierarchy of contribution types (Instruments/Wind, Production/General, etc.)
CREATE TABLE IF NOT EXISTS contribution_categories (
  id SERIAL PRIMARY KEY,
  main_category TEXT NOT NULL,
  sub_category TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(main_category, sub_category)
);

COMMENT ON TABLE contribution_categories IS 'Hierarchical categories for contributions (e.g., Instruments > Wind Instruments)';

-- 3. CONTRIBUTIONS TABLE
-- Links records to contributors with their roles and categories
CREATE TABLE IF NOT EXISTS contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES vinyl_records(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contributor_id UUID NOT NULL REFERENCES contributors(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES contribution_categories(id) ON DELETE RESTRICT,
  roles TEXT[] NOT NULL DEFAULT '{}',
  instruments TEXT[] NOT NULL DEFAULT '{}',
  notes JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(record_id, contributor_id, category_id)
);

COMMENT ON TABLE contributions IS 'Links records to contributors with their roles, instruments, and categories';
COMMENT ON COLUMN contributions.roles IS 'Array of roles (e.g., {Performer, "Composed By"})';
COMMENT ON COLUMN contributions.instruments IS 'Array of instruments (e.g., {Drums, "Double Bass"})';
COMMENT ON COLUMN contributions.notes IS 'Optional metadata in JSONB format';

-- 4. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_contributions_record_id ON contributions(record_id);
CREATE INDEX IF NOT EXISTS idx_contributions_contributor_id ON contributions(contributor_id);
CREATE INDEX IF NOT EXISTS idx_contributions_category_id ON contributions(category_id);
CREATE INDEX IF NOT EXISTS idx_contributions_user_id ON contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_contributors_name ON contributors(name);
CREATE INDEX IF NOT EXISTS idx_contribution_categories_main ON contribution_categories(main_category);

-- 5. SEED CONTRIBUTION CATEGORIES
-- Based on official Discogs credits structure
INSERT INTO contribution_categories (main_category, sub_category) VALUES
  -- Visual
  ('Visual', 'General'),
  ('Visual', 'Artwork'),
  ('Visual', 'Photography'),
  
  -- Production
  ('Production', 'General'),
  ('Production', 'Executive'),
  
  -- Technical
  ('Technical', 'General'),
  
  -- Writing & Arrangement
  ('Writing & Arrangement', 'General'),
  
  -- Vocals
  ('Vocals', 'General'),
  
  -- Featuring & Presenting
  ('Featuring & Presenting', 'General'),
  
  -- Conducting & Leading
  ('Conducting & Leading', 'General'),
  
  -- Remix
  ('Remix', 'General'),
  
  -- DJ Mix
  ('DJ Mix', 'General'),
  
  -- Acting, Literary & Spoken
  ('Acting, Literary & Spoken', 'General'),
  
  -- Management
  ('Management', 'General'),
  
  -- Instruments - Various subcategories
  ('Instruments', 'Drums and percussion'),
  ('Instruments', 'Tuned Percussion'),
  ('Instruments', 'Keyboard'),
  ('Instruments', 'Stringed Instruments'),
  ('Instruments', 'Wind Instruments'),
  ('Instruments', 'Technical Musical'),
  ('Instruments', 'Other Musical'),
  
  -- Other/Uncategorized
  ('Other', 'General'),
  ('Uncategorized', 'General')
ON CONFLICT (main_category, sub_category) DO NOTHING;

-- 6. ROW LEVEL SECURITY (RLS)
-- Enable RLS on all tables
ALTER TABLE contributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE contribution_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;

-- Contributors: Everyone can read, only authenticated users can insert (auto-dedup)
CREATE POLICY "Anyone can read contributors"
  ON contributors FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert contributors"
  ON contributors FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Categories: Everyone can read (seed data)
CREATE POLICY "Anyone can read categories"
  ON contribution_categories FOR SELECT
  USING (true);

-- Contributions: Users can only see/modify their own data
CREATE POLICY "Users can read their own contributions"
  ON contributions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contributions"
  ON contributions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contributions"
  ON contributions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contributions"
  ON contributions FOR DELETE
  USING (auth.uid() = user_id);

-- 7. HELPER VIEW: Recreate old JSON format
-- This view provides backwards compatibility by recreating the musicians JSON structure
CREATE OR REPLACE VIEW record_contributors_json AS
SELECT 
  record_id,
  user_id,
  jsonb_object_agg(
    main_category,
    subcategories
  ) AS musicians
FROM (
  SELECT 
    co.record_id,
    co.user_id,
    cat.main_category,
    jsonb_object_agg(
      cat.sub_category,
      credits
    ) AS subcategories
  FROM (
    SELECT 
      co.record_id,
      co.user_id,
      co.category_id,
      jsonb_agg(
        format('%s (%s)', 
          c.name, 
          array_to_string(
            array_cat(co.roles, co.instruments), 
            ', '
          )
        ) ORDER BY c.name
      ) AS credits
    FROM contributions co
    JOIN contributors c ON co.contributor_id = c.id
    GROUP BY co.record_id, co.user_id, co.category_id
  ) co
  JOIN contribution_categories cat ON co.category_id = cat.id
  GROUP BY co.record_id, co.user_id, cat.main_category
) grouped
GROUP BY record_id, user_id;

COMMENT ON VIEW record_contributors_json IS 'Backwards-compatible view that recreates the musicians JSON structure from relational tables';

-- 8. TRIGGERS FOR UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_contributors_updated_at
  BEFORE UPDATE ON contributors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contributions_updated_at
  BEFORE UPDATE ON contributions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


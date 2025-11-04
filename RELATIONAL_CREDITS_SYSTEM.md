# Relational Credits System

## Overview

The vinyl collection manager now uses a **relational model** for storing music credits instead of a JSON field. This enables:
- ✅ No duplicate contributors across records
- ✅ Powerful filtering (e.g., "show all bassists")
- ✅ Proper normalization
- ✅ Easy to extend with more metadata
- ✅ Backwards compatibility via SQL views

## Database Schema

### Tables

#### 1. `contributors`
Stores unique contributors (musicians, producers, engineers, etc.)
```sql
id          UUID PRIMARY KEY
name        TEXT UNIQUE NOT NULL
created_at  TIMESTAMPTZ
updated_at  TIMESTAMPTZ
```

#### 2. `contribution_categories`
Hierarchical categories (Instruments/Wind, Production/General, etc.)
```sql
id             SERIAL PRIMARY KEY
main_category  TEXT NOT NULL
sub_category   TEXT NOT NULL
UNIQUE(main_category, sub_category)
```

#### 3. `contributions`
Links records ↔ contributors ↔ categories
```sql
id               UUID PRIMARY KEY
record_id        UUID → vinyl_records.id
user_id          UUID → auth.users.id
contributor_id   UUID → contributors.id
category_id      INT → contribution_categories.id
roles            TEXT[] (e.g., {Performer, "Composed By"})
instruments      TEXT[] (e.g., {Drums, "Double Bass"})
notes            JSONB (optional metadata)
created_at       TIMESTAMPTZ
updated_at       TIMESTAMPTZ
UNIQUE(record_id, contributor_id, category_id)
```

### Relationships

```
vinyl_records
   │
   ├── contributions (links record ↔ contributor ↔ category)
   │     ├──→ contributors.id (who)
   │     ├──→ contribution_categories.id (how/where)
   │     ├── roles[] (what they did)
   │     ├── instruments[] (what they played)
   │     └── user_id (whose data)
```

## Example Data

### For "Makaya McCraven - In These Times"

**contributors table:**
```
id                                    name
contrib-001                           Makaya McCraven
contrib-002                           Junius Paul
contrib-003                           Jeff Parker
```

**contributions table:**
```
record_id  contributor_id  category_id  roles                    instruments
rec-001    contrib-001     13           {Performer}              {Drums, Percussion}
rec-001    contrib-001     2            {Producer, Mixed By}     {}
rec-001    contrib-002     16           {Performer}              {Double Bass, Bass Guitar}
rec-001    contrib-003     16           {Performer}              {Guitar}
```

## Example Queries

### 1. All credits for one record
```sql
SELECT 
  c.name,
  cat.main_category,
  cat.sub_category,
  co.roles,
  co.instruments
FROM contributions co
JOIN contributors c ON co.contributor_id = c.id
JOIN contribution_categories cat ON co.category_id = cat.id
WHERE co.record_id = 'rec-001';
```

### 2. All records where Junius Paul played bass
```sql
SELECT vr.title, co.instruments
FROM contributions co
JOIN vinyl_records vr ON vr.id = co.record_id
JOIN contributors c ON co.contributor_id = c.id
WHERE c.name = 'Junius Paul'
  AND 'Bass' = ANY(co.instruments);
```

### 3. All wind instrument players across collection
```sql
SELECT DISTINCT c.name, co.instruments
FROM contributions co
JOIN contributors c ON co.contributor_id = c.id
JOIN contribution_categories cat ON co.category_id = cat.id
WHERE cat.main_category = 'Instruments'
  AND cat.sub_category = 'Wind Instruments';
```

### 4. Most frequent collaborators
```sql
SELECT c.name, COUNT(*) as record_count
FROM contributions co
JOIN contributors c ON co.contributor_id = c.id
WHERE co.user_id = 'user-123'
GROUP BY c.name
ORDER BY record_count DESC
LIMIT 10;
```

## Backwards Compatibility

### SQL View: `record_contributors_json`
Recreates the old JSON structure for backwards compatibility:

```sql
SELECT * FROM record_contributors_json WHERE record_id = 'rec-001';
```

Returns:
```json
{
  "Instruments": {
    "Drums and percussion": ["Makaya McCraven (Performer, Drums, Percussion)"],
    "Stringed Instruments": [
      "Junius Paul (Performer, Double Bass, Bass Guitar)",
      "Jeff Parker (Performer, Guitar)"
    ]
  },
  "Production": {
    "General": ["Makaya McCraven (Producer, Mixed By)"]
  }
}
```

## How It Works

### When Adding a New Record:

1. **discogs_lookup.py** fetches and categorizes credits using official Discogs list
2. Returns JSON structure: `{"Instruments": {"Wind": ["Name (Role)"]}}` 
3. **barcode_scanner/db.py** receives the data:
   - Stores JSON in `musicians` field (legacy, for now)
   - **Also** parses and stores in relational tables:
     - Inserts unique contributors to `contributors`
     - Links via `contributions` table with roles/instruments

### Data Flow:

```
Discogs API
    ↓
discogs_lookup.py (categorizes)
    ↓
JSON: {"Instruments": {"Wind": ["Miles Davis (Trumpet)"]}}
    ↓
barcode_scanner/db.py
    ├→ vinyl_records.musicians (JSON, legacy)
    └→ contributors + contributions (relational, new)
```

## Migration Strategy

1. ✅ **Phase 1** (Current): Dual-write system
   - New records write to BOTH JSON and relational tables
   - Old `musicians` field kept for safety
   
2. **Phase 2** (Future): Backfill existing records
   - Run backfill script to populate relational tables for old records
   
3. **Phase 3** (Future): Drop JSON field
   - Once confident, remove `musicians` JSON field
   - Use SQL view for any legacy code

## Benefits

### Query Capabilities
- "Show all records with Coltrane"
- "Find all bassists in my collection"
- "Most common producers"
- "Records by category (only drummers)"

### Data Quality
- No duplicates ("Junius Paul" is one row in `contributors`)
- Consistent spelling enforced by foreign key
- Easy to fix typos (update one row in `contributors`)

### Performance
- Indexed lookups on contributor name
- Efficient joins vs parsing JSON
- Can add full-text search on names

### Future Extensions
- Add contributor metadata (bio, links, image)
- Track contributor relationships (bands, collaborations)
- Add "favorite contributors" feature
- Analytics on your listening patterns


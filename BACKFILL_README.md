# Discogs Data Backfill Script

This script fetches fresh data from the Discogs API for existing records while preserving all custom column data, `added_from` source, and barcode information.

## Prerequisites

### 1. Environment Variables

You need to set these in your `.env` file:

```bash
# Discogs API
DISCOGS_TOKEN=your_discogs_token_here

# Supabase
SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here  # NOT the anon key!
```

**Important:** The script requires the **SERVICE_ROLE_KEY** (not the anon key) because it needs to bypass Row Level Security (RLS) to access all records.

### 2. Get Your Supabase Service Role Key

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **API**
3. Copy the **`service_role`** key (it's the longer one, labeled "secret")
4. Add it to your `.env` file as `SUPABASE_SERVICE_ROLE_KEY`

⚠️ **Security Note:** The service role key bypasses all RLS policies. Keep it secret and never commit it to version control!

## Usage

### Step 1: Dry Run (Recommended First)

Generate a comparison CSV to see what will change **without updating the database**:

```bash
poetry run python backfill_discogs_data.py --dry-run
```

This will:
- Fetch all 168 records marked as "Kjøpt"
- Call the Discogs API for each record
- Generate a CSV file: `backfill_comparison_TIMESTAMP.csv`
- **Takes ~3-4 minutes** (1 second per record for rate limiting)

### Step 2: Review the Comparison CSV

Open the generated CSV file and verify:
- ✓ New fields look correct
- ✓ Preserved fields are marked with ✓
- ✓ No unexpected changes

### Step 3: Test with Small Batch

Test the actual database update with just 5 records:

```bash
poetry run python backfill_discogs_data.py --test 5
```

This will:
- Update only the first 5 records
- **Prompt for confirmation** before updating
- Update the database

After running, **check the UI** to verify:
- ✓ Custom columns are preserved
- ✓ New Discogs fields are populated
- ✓ `added_from` (Source) is unchanged
- ✓ Barcodes are preserved (if applicable)

### Step 4: Full Update

If everything looks good, run the full update:

```bash
poetry run python backfill_discogs_data.py --full
```

This will:
- Update all 168 records marked as "Kjøpt"
- **Prompt for confirmation** before updating
- **Takes ~3-4 minutes** (1 second per record for rate limiting)
- **Stop immediately** on any error

## What Gets Updated

### ✅ Updated (New Discogs Data)
- All standard Discogs fields (artist, album, year, label, country, genres, styles, musicians, etc.)
- New extended fields:
  - `original_catno`, `original_release_url`, `original_release_date`, `original_identifiers`
  - `current_label`, `current_catno`, `current_country`, `current_release_date`, `current_identifiers`
  - `master_id`, `master_url`, `tracklist`

### ✅ Preserved (Not Changed)
- **`custom_values_cache`** - All your custom column data (Kommentarer, Yay or nay?, Klassifisering, etc.)
- **`added_from`** - The source (barcode, spotify, manual, etc.)
- **`barcode`** - The scanned barcode (if record was added via barcode)
- **`created_at`** - Original timestamp when record was added

## How It Works

1. **Query**: Finds all records where the custom column "Kjøpt?" (UUID: `28f7485e-a53b-4def-9bfc-10a41ba9a8ec`) equals "Kjøpt"

2. **Fetch**: For each record, uses the `current_release_url` to fetch fresh data from Discogs API

3. **Merge**: Combines the fresh Discogs data with the preserved fields

4. **Update**: Writes the merged data back to the database

5. **Rate Limiting**: Waits 1 second between requests (Discogs allows 60 req/min)

## Error Handling

- **Stops immediately** on any error
- Logs the problematic record details
- Allows you to fix the issue and re-run
- Already-updated records won't be re-processed

## Troubleshooting

### "Found 0 records"

**Problem:** Using the anon key instead of service role key

**Solution:** 
1. Get your service role key from Supabase dashboard
2. Add it to `.env` as `SUPABASE_SERVICE_ROLE_KEY`
3. Make sure your `.env` file is being loaded

### "Missing Supabase configuration"

**Problem:** Environment variables not set

**Solution:**
```bash
# Check if .env file exists
ls -la .env

# Check if variables are set
poetry run python -c "import os; from dotenv import load_dotenv; load_dotenv(); print('URL:', os.getenv('SUPABASE_URL')); print('Key:', bool(os.getenv('SUPABASE_SERVICE_ROLE_KEY')))"
```

### "Rate limit exceeded"

**Problem:** Making too many Discogs API requests

**Solution:** The script has built-in rate limiting (1 req/sec). If you still hit limits, the script will stop and you can resume later.

## Safety Features

- ✅ Dry run mode to preview changes
- ✅ Test mode with limited records
- ✅ Confirmation prompt before updates
- ✅ Stops on first error
- ✅ Preserves critical data (custom columns, source, barcode)
- ✅ Rate limiting to respect API limits

## Example Output

```
============================================================
DISCOGS DATA BACKFILL SCRIPT
============================================================

Using Supabase URL: https://your-project.supabase.co
Using key type: SERVICE_ROLE
✓ Found 168 records marked 'Kjøpt'

Mode: DRY RUN (no database updates)

============================================================
DRY RUN - Fetching fresh data for comparison
============================================================

[1/168] Fetching: Makaya McCraven - Off The Record
[2/168] Fetching: Signe Emmeluth - Banshee
[3/168] Fetching: Petter Eldh - Projekt Drums vol. 2
...
[168/168] Fetching: Enemy - The Betrayal

============================================================
Writing comparison to CSV...
============================================================

✓ Dry run complete!
✓ Comparison saved to: backfill_comparison_20251102_143052.csv
✓ Processed 168 records

Review the CSV file before running --test or --full
```

## Reusability

This script is designed to be reusable. You can run it again in the future if you:
- Add more records marked as "Kjøpt"
- Want to refresh existing data
- Need to fix data issues

The query will always fetch the current set of records marked "Kjøpt", so you can safely re-run it without duplicating work.


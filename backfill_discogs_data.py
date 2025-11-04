#!/usr/bin/env python3
"""
Backfill Discogs data for existing records while preserving custom data.

This script fetches fresh data from the Discogs API for records marked as "Kjøpt"
while preserving all custom column data, added_from source, and barcode information.

Usage:
    python backfill_discogs_data.py --dry-run          # Compare old vs new, no updates
    python backfill_discogs_data.py --test 5           # Test with 5 records
    python backfill_discogs_data.py --full             # Update all records

Requirements:
    - DISCOGS_TOKEN environment variable must be set
    - SUPABASE_URL environment variable must be set  
    - SUPABASE_SERVICE_ROLE_KEY environment variable must be set (for admin access)
      
Note: This script requires the SERVICE_ROLE_KEY (not the anon key) because it needs
to bypass Row Level Security (RLS) to access all records regardless of user.
"""

import argparse
import time
import csv
import os
import sys
from datetime import datetime
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# Import from existing modules
from discogs_lookup import format_release_data
from discogs_client import Client as DiscogsClient
from barcode_scanner.db import insert_contributions_relational

# The UUID of the "Kjøpt?" custom column
KJOPT_COLUMN_ID = '28f7485e-a53b-4def-9bfc-10a41ba9a8ec'

def get_supabase_client() -> Client:
    """Get a Supabase client for admin operations
    
    Note: This uses the SERVICE_ROLE_KEY for admin access to bypass RLS.
    Make sure to set SUPABASE_SERVICE_ROLE_KEY in your .env file.
    """
    url = os.getenv("SUPABASE_URL")
    # Use service role key for admin operations (bypasses RLS)
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
    
    if not url or not key:
        raise ValueError("Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.")
    
    print(f"Using Supabase URL: {url}")
    print(f"Using key type: {'SERVICE_ROLE' if os.getenv('SUPABASE_SERVICE_ROLE_KEY') else 'ANON'}")
    
    return create_client(url, key)

def get_discogs_client() -> DiscogsClient:
    """Get a Discogs API client"""
    token = os.getenv('DISCOGS_TOKEN')
    if not token:
        raise ValueError("DISCOGS_TOKEN environment variable is not set")
    
    return DiscogsClient('VinylCollectionManager/1.0', user_token=token)

def fetch_records_to_update(user_id: str) -> List[Dict[str, Any]]:
    """Fetch all records where 'Kjøpt?' = 'Kjøpt' for a specific user"""
    print("Connecting to Supabase...")
    supabase = get_supabase_client()
    
    print(f"Fetching records for user: {user_id}")
    print(f"Where custom column '{KJOPT_COLUMN_ID}' = 'Kjøpt'...")
    
    # Fetch all records for this user with custom_values_cache
    response = supabase.table('vinyl_records')\
        .select('*')\
        .eq('user_id', user_id)\
        .not_.is_('custom_values_cache', 'null')\
        .execute()
    
    all_records = response.data
    
    # Filter in Python for records with Kjøpt
    kjopt_records = [
        r for r in all_records 
        if r.get('custom_values_cache', {}).get(KJOPT_COLUMN_ID) == 'Kjøpt'
    ]
    
    print(f"  Total records for user: {len(all_records)}")
    print(f"  Records marked 'Kjøpt': {len(kjopt_records)}")
    
    return kjopt_records

def extract_release_id_from_url(url: str) -> str:
    """Extract release ID from Discogs URL
    
    Examples:
        https://www.discogs.com/release/2825456 -> 2825456
        https://www.discogs.com/release/2825456-Miles-Davis -> 2825456
    """
    if not url:
        raise ValueError("URL is empty")
    
    parts = url.rstrip('/').split('/')
    release_id = parts[-1].split('-')[0]  # Handle URLs with names after ID
    
    if not release_id.isdigit():
        raise ValueError(f"Could not extract numeric release ID from URL: {url}")
    
    return release_id

def fetch_fresh_discogs_data(release_url: str, added_from: str) -> Dict[str, Any]:
    """Fetch fresh data from Discogs API using current_release_url"""
    release_id = extract_release_id_from_url(release_url)
    
    # Use Discogs client to fetch release
    d = get_discogs_client()
    release = d.release(int(release_id))
    
    # Use existing format_release_data function to extract all fields
    return format_release_data(release, added_from=added_from)

def compare_values(old_val: Any, new_val: Any) -> str:
    """Compare old and new values and return a formatted string"""
    if old_val == new_val:
        return "✓ (unchanged)"
    
    # Handle None values
    if old_val is None and new_val is None:
        return "✓ (both None)"
    if old_val is None:
        return f"NEW: {new_val}"
    if new_val is None:
        return f"REMOVED: {old_val}"
    
    # Handle lists/arrays
    if isinstance(old_val, list) and isinstance(new_val, list):
        if set(old_val) == set(new_val):
            return "✓ (same items)"
        return f"CHANGED: {len(old_val)} -> {len(new_val)} items"
    
    return f"CHANGED: {old_val} -> {new_val}"

def dry_run_comparison(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Generate comparison data without updating DB and create two CSVs"""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    comparison_file = f'backfill_comparison_{timestamp}.csv'
    full_data_file = f'backfill_full_data_{timestamp}.csv'
    
    print(f"\n{'='*60}")
    print(f"DRY RUN - Fetching fresh data for comparison")
    print(f"{'='*60}\n")
    
    comparison_data = []
    full_data = []
    
    for i, record in enumerate(records, 1):
        print(f"[{i}/{len(records)}] Fetching: {record['artist']} - {record['album']}")
        
        try:
            # Fetch fresh Discogs data
            fresh_data = fetch_fresh_discogs_data(
                record['current_release_url'],
                record['added_from']
            )
            
            # Build comparison row (changes only)
            import json
            custom_values_display = json.dumps(record.get('custom_values_cache', {}))
            
            comparison = {
                'record_id': record['id'],
                'artist': record.get('artist', ''),
                'album': record.get('album', ''),
                
                # Compare key fields (musicians is NOT compared since we're keeping it unchanged)
                'year_comparison': compare_values(record.get('year'), fresh_data.get('year')),
                'label_comparison': compare_values(record.get('label'), fresh_data.get('label')),
                'country_comparison': compare_values(record.get('country'), fresh_data.get('country')),
                'genres_comparison': compare_values(record.get('genres'), fresh_data.get('genres')),
                'styles_comparison': compare_values(record.get('styles'), fresh_data.get('styles')),
                
                # New fields being added
                'original_catno_NEW': fresh_data.get('original_catno', ''),
                'current_label_NEW': fresh_data.get('current_label', ''),
                'current_catno_NEW': fresh_data.get('current_catno', ''),
                'current_country_NEW': fresh_data.get('current_country', ''),
                'tracklist_NEW': f"{len(fresh_data.get('tracklist', []))} tracks" if fresh_data.get('tracklist') else '',
                'master_url_NEW': fresh_data.get('master_url', ''),
                'original_release_url_NEW': fresh_data.get('original_release_url', ''),
                
                # Contributors will be populated in relational tables
                'contributors_NEW': 'Will be populated in relational tables',
                
                # Verify preserved fields - show actual values so you can verify
                'custom_values_PRESERVED': custom_values_display,
                'added_from_PRESERVED': record.get('added_from', ''),
                'barcode_PRESERVED': record.get('barcode', ''),
                'musicians_UNCHANGED': '✓ (keeping existing value)',
                'current_release_url': record.get('current_release_url', ''),
            }
            
            comparison_data.append(comparison)
            
            # Build full data row (actual values after update)
            # Format contributors as full JSON string for display
            import json
            contributors_full = json.dumps(fresh_data.get('musicians', {})) if fresh_data.get('musicians') else ''
            
            # Format tracklist as full JSON string for display
            tracklist_full = json.dumps(fresh_data.get('tracklist', [])) if fresh_data.get('tracklist') else ''
            
            # Show actual custom values to verify preservation
            custom_values_full = json.dumps(record.get('custom_values_cache', {}))
            
            full_row = {
                'record_id': record['id'],
                'artist': fresh_data.get('artist', ''),
                'album': fresh_data.get('album', ''),
                'year': fresh_data.get('year', ''),
                'label': fresh_data.get('label', ''),
                'country': fresh_data.get('country', ''),
                'genres': fresh_data.get('genres', ''),
                'styles': fresh_data.get('styles', ''),
                'original_catno': fresh_data.get('original_catno', ''),
                'current_label': fresh_data.get('current_label', ''),
                'current_catno': fresh_data.get('current_catno', ''),
                'current_country': fresh_data.get('current_country', ''),
                'tracklist_full': tracklist_full,
                'master_url': fresh_data.get('master_url', ''),
                'original_release_url': fresh_data.get('original_release_url', ''),
                'current_release_url': record.get('current_release_url', ''),
                'contributors_full': contributors_full,
                'musicians_legacy': 'UNCHANGED (preserved)',
                'added_from': record.get('added_from', ''),
                'barcode': record.get('barcode', ''),
                'custom_values_full': custom_values_full,
            }
            
            full_data.append(full_row)
            
            # Rate limiting - Discogs allows 60 req/min
            time.sleep(1)
            
        except Exception as e:
            print(f"\n✗ ERROR processing record {record['id']}: {e}")
            print(f"  Artist: {record.get('artist')}")
            print(f"  Album: {record.get('album')}")
            print(f"  URL: {record.get('current_release_url')}")
            print(f"\nStopping dry run. Fix this error before proceeding.\n")
            raise
    
    # Write comparison CSV
    print(f"\n{'='*60}")
    print(f"Writing comparison CSV...")
    print(f"{'='*60}\n")
    
    with open(comparison_file, 'w', newline='', encoding='utf-8') as f:
        if comparison_data:
            writer = csv.DictWriter(f, fieldnames=comparison_data[0].keys())
            writer.writeheader()
            writer.writerows(comparison_data)
    
    # Write full data CSV
    print(f"Writing full data CSV...")
    
    with open(full_data_file, 'w', newline='', encoding='utf-8') as f:
        if full_data:
            writer = csv.DictWriter(f, fieldnames=full_data[0].keys())
            writer.writeheader()
            writer.writerows(full_data)
    
    print(f"\n✓ Dry run complete!")
    print(f"✓ Comparison saved to: {comparison_file}")
    print(f"✓ Full data saved to: {full_data_file}")
    print(f"✓ Processed {len(comparison_data)} records")
    print(f"\nReview the CSV files before running --test or --full\n")
    
    return comparison_data

def update_records(records: List[Dict[str, Any]], limit: Optional[int] = None) -> None:
    """Update records in database with fresh Discogs data"""
    supabase = get_supabase_client()
    records_to_process = records[:limit] if limit else records
    
    print(f"\n{'='*60}")
    print(f"UPDATING {len(records_to_process)} RECORDS")
    print(f"{'='*60}\n")
    
    updated_count = 0
    
    for i, record in enumerate(records_to_process, 1):
        print(f"[{i}/{len(records_to_process)}] Processing: {record['artist']} - {record['album']}")
        
        try:
            # Fetch fresh Discogs data
            fresh_data = fetch_fresh_discogs_data(
                record['current_release_url'],
                record['added_from']
            )
            
            # CRITICAL: Merge with preserved data
            # Extract musicians data for relational tables, but don't include in vinyl_records update
            musicians_data = fresh_data.pop('musicians', None)
            
            updated_data = {
                **fresh_data,  # All new/updated Discogs fields (except musicians)
                
                # PRESERVE these fields - DO NOT OVERWRITE
                'custom_values_cache': record['custom_values_cache'],
                'added_from': record['added_from'],
                'created_at': record['created_at'],
                'musicians': record['musicians'],  # Keep existing musicians field unchanged
            }
            
            # Preserve barcode if it exists
            if record.get('barcode'):
                updated_data['barcode'] = record['barcode']
            
            # Set updated timestamp
            updated_data['updated_at'] = datetime.utcnow().isoformat()
            
            # Update in Supabase
            supabase.table('vinyl_records')\
                .update(updated_data)\
                .eq('id', record['id'])\
                .execute()
            
            # Also update the relational contributors tables
            if musicians_data is not None:
                print(f"  → Updating contributors in relational tables...")
                # First, delete old contributions for this record
                supabase.table('contributions')\
                    .delete()\
                    .eq('record_id', record['id'])\
                    .eq('user_id', record['user_id'])\
                    .execute()
                
                # Then insert fresh contributions
                insert_contributions_relational(
                    client=supabase,
                    record_id=record['id'],
                    user_id=record['user_id'],
                    musicians_data=musicians_data
                )
            
            print(f"  ✓ Updated successfully")
            updated_count += 1
            
            # Rate limiting - Discogs allows 60 req/min
            time.sleep(1)
            
        except Exception as e:
            print(f"\n{'='*60}")
            print(f"✗ ERROR on record {record['id']}")
            print(f"{'='*60}")
            print(f"Artist: {record.get('artist')}")
            print(f"Album: {record.get('album')}")
            print(f"URL: {record.get('current_release_url')}")
            print(f"Error: {e}")
            print(f"\nStopped after updating {updated_count} records.")
            print(f"Fix the error and re-run to continue from where it stopped.\n")
            raise
    
    print(f"\n{'='*60}")
    print(f"✓ SUCCESS!")
    print(f"{'='*60}")
    print(f"Successfully updated {updated_count} records!")
    print(f"All custom data, added_from, and barcodes preserved.\n")

def main():
    parser = argparse.ArgumentParser(
        description='Backfill Discogs data while preserving custom columns',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # First, do a dry run to see what will change
    python backfill_discogs_data.py --user-id YOUR_USER_ID --dry-run
    
    # Review the generated CSV, then test with a few records
    python backfill_discogs_data.py --user-id YOUR_USER_ID --test 5
    
    # If all looks good, run the full update
    python backfill_discogs_data.py --user-id YOUR_USER_ID --full
        """
    )
    
    parser.add_argument('--user-id', type=str, required=True,
                       help='User ID to filter records (required)')
    
    parser.add_argument('--record-id', type=str, metavar='RECORD_ID',
                       help='Update a specific record by ID (for testing)')
    
    parser.add_argument('--limit', type=int, metavar='N',
                       help='Limit to first N records (works with both --dry-run and --test)')
    
    parser.add_argument('--yes', action='store_true',
                       help='Skip confirmation prompts (auto-confirm)')
    
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--dry-run', action='store_true', 
                      help='Generate comparison CSV without updating DB')
    group.add_argument('--test', type=int, metavar='N', 
                      help='Test with first N records (updates DB)')
    group.add_argument('--full', action='store_true', 
                      help='Update all records (updates DB)')
    
    args = parser.parse_args()
    
    try:
        # Fetch records to update
        print(f"\n{'='*60}")
        print("DISCOGS DATA BACKFILL SCRIPT")
        print(f"{'='*60}\n")
        
        # Handle single record ID mode
        if args.record_id:
            print(f"Fetching specific record: {args.record_id}\n")
            supabase = get_supabase_client()
            result = supabase.table('vinyl_records').select('*').eq('id', args.record_id).eq('user_id', args.user_id).execute()
            records = result.data
            if not records:
                print(f"❌ Record {args.record_id} not found for user {args.user_id}")
                return
            print(f"✓ Found record: {records[0]['artist']} - {records[0]['album']}\n")
        else:
            records = fetch_records_to_update(args.user_id)
            print(f"\n✓ Found {len(records)} records marked 'Kjøpt'\n")
            
            if len(records) == 0:
                print("No records to process. Exiting.")
                return
            
            # Apply limit if specified
            if args.limit:
                records = records[:args.limit]
                print(f"Limiting to first {args.limit} records\n")
        
        # Execute based on mode
        if args.dry_run:
            print("Mode: DRY RUN (no database updates)")
            dry_run_comparison(records)
            
        elif args.test:
            print(f"Mode: TEST ({args.test} records)")
            if args.yes:
                print("Auto-confirmed with --yes flag")
                update_records(records, limit=args.test)
            else:
                confirm = input(f"\n⚠ This will UPDATE {args.test} records in the database.\nContinue? (yes/no): ")
                if confirm.lower() == 'yes':
                    update_records(records, limit=args.test)
                else:
                    print("Cancelled.")
                
        elif args.full:
            print(f"Mode: FULL UPDATE (all {len(records)} records)")
            if args.yes:
                print("Auto-confirmed with --yes flag")
                update_records(records)
            else:
                confirm = input(f"\n⚠ This will UPDATE all {len(records)} records in the database.\nContinue? (yes/no): ")
                if confirm.lower() == 'yes':
                    update_records(records)
                else:
                    print("Cancelled.")
    
    except Exception as e:
        print(f"\n✗ Script failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()


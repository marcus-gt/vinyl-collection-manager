#!/usr/bin/env python3
"""
Migrate credits from JSON musicians field to relational contributors model.

This script:
1. Reads all records with musicians data
2. Parses the JSON structure
3. Inserts unique contributors
4. Inserts contribution categories (already seeded)
5. Creates contributions linking records to contributors

Usage:
  python migrate_to_relational_credits.py --user-id YOUR_USER_ID [--dry-run] [--test N]
"""

import os
import argparse
import json
import re
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

def get_supabase_client() -> Client:
    """Initialize Supabase client with service role key for admin access"""
    url = os.getenv('SUPABASE_URL')
    # Use service role key to bypass RLS
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_KEY')
    
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    
    print(f"Using Supabase URL: {url}")
    if 'SERVICE_ROLE' in os.environ.get('SUPABASE_SERVICE_ROLE_KEY', ''):
        print("Using key type: SERVICE_ROLE")
    else:
        print("Using key type: ANON (may have RLS restrictions)")
    
    return create_client(url, key)


def parse_credit_string(credit_str: str) -> tuple[str, list[str]]:
    """
    Parse a credit string like "Makaya McCraven (Drums, Producer, Mixed By)"
    Returns: (name, [roles/instruments])
    """
    match = re.match(r'^(.+?)\s*\((.+)\)$', credit_str.strip())
    if match:
        name = match.group(1).strip()
        roles_str = match.group(2).strip()
        roles = [r.strip() for r in roles_str.split(',')]
        return name, roles
    else:
        # Fallback: just the name
        return credit_str.strip(), []


def categorize_roles(roles: list[str]) -> tuple[list[str], list[str]]:
    """
    Separate roles into two categories:
    - Pure roles (Producer, Composed By, etc.)
    - Instruments (Drums, Guitar, etc.)
    
    This is a simple heuristic - instrument names are typically nouns without "By"
    """
    role_keywords = {'by', 'producer', 'engineer', 'mastered', 'mixed', 'recorded', 
                     'written', 'composed', 'arranged', 'featuring', 'performer'}
    
    pure_roles = []
    instruments = []
    
    for role in roles:
        role_lower = role.lower()
        # If it contains a role keyword, it's a role
        if any(keyword in role_lower for keyword in role_keywords):
            pure_roles.append(role)
        else:
            # Otherwise, treat it as an instrument
            instruments.append(role)
    
    return pure_roles, instruments


def migrate_record_credits(client: Client, record: dict, dry_run: bool = False) -> dict:
    """
    Migrate one record's credits from JSON to relational model.
    Returns stats dict.
    """
    record_id = record['id']
    user_id = record['user_id']
    musicians = record.get('musicians')
    
    stats = {
        'record_id': record_id,
        'contributors_added': 0,
        'contributions_added': 0,
        'skipped': False,
        'error': None
    }
    
    if not musicians:
        stats['skipped'] = True
        return stats
    
    # Handle both old array format and new dict format
    if isinstance(musicians, list):
        # Old format: ["Name (Role)", ...]
        # Convert to new format structure
        musicians_dict = {"Other": {"General": musicians}}
    elif isinstance(musicians, dict):
        musicians_dict = musicians
    else:
        stats['error'] = f"Invalid musicians format: {type(musicians)}"
        return stats
    
    try:
        # Get category mappings
        categories_response = client.table('contribution_categories').select('*').execute()
        category_map = {
            (cat['main_category'], cat['sub_category']): cat['id']
            for cat in categories_response.data
        }
        
        # Process each credit
        for main_category, subcategories in musicians_dict.items():
            if main_category == '_role_index':
                continue  # Skip the index
            
            for sub_category, credits in subcategories.items():
                category_id = category_map.get((main_category, sub_category))
                
                if not category_id:
                    print(f"  ⚠️  Unknown category: {main_category} / {sub_category}")
                    continue
                
                for credit_str in credits:
                    name, roles = parse_credit_string(credit_str)
                    pure_roles, instruments = categorize_roles(roles)
                    
                    if dry_run:
                        print(f"  [DRY RUN] Would add: {name}")
                        print(f"    Category: {main_category} / {sub_category}")
                        print(f"    Roles: {pure_roles}")
                        print(f"    Instruments: {instruments}")
                        stats['contributors_added'] += 1
                        stats['contributions_added'] += 1
                        continue
                    
                    # Insert contributor (or get existing)
                    try:
                        contributor_response = client.table('contributors').upsert({
                            'name': name
                        }, on_conflict='name').execute()
                        
                        contributor_id = contributor_response.data[0]['id']
                        stats['contributors_added'] += 1
                    except Exception as e:
                        # Might already exist, try to get it
                        contributor_response = client.table('contributors').select('id').eq('name', name).execute()
                        if contributor_response.data:
                            contributor_id = contributor_response.data[0]['id']
                        else:
                            raise e
                    
                    # Insert contribution
                    contribution_data = {
                        'record_id': record_id,
                        'user_id': user_id,
                        'contributor_id': contributor_id,
                        'category_id': category_id,
                        'roles': pure_roles,
                        'instruments': instruments
                    }
                    
                    try:
                        client.table('contributions').upsert(
                            contribution_data,
                            on_conflict='record_id,contributor_id,category_id'
                        ).execute()
                        stats['contributions_added'] += 1
                    except Exception as e:
                        print(f"  ⚠️  Error inserting contribution: {e}")
        
        return stats
        
    except Exception as e:
        stats['error'] = str(e)
        return stats


def main():
    parser = argparse.ArgumentParser(description='Migrate credits to relational model')
    parser.add_argument('--user-id', required=True, help='User ID to migrate')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done without making changes')
    parser.add_argument('--test', type=int, metavar='N', help='Only migrate N records (for testing)')
    
    args = parser.parse_args()
    
    print("="*60)
    print("CREDITS MIGRATION TO RELATIONAL MODEL")
    print("="*60)
    print()
    
    client = get_supabase_client()
    
    # Fetch records
    print(f"Fetching records for user: {args.user_id}")
    query = client.table('vinyl_records').select('id, user_id, musicians').eq('user_id', args.user_id)
    
    if args.test:
        query = query.limit(args.test)
    
    records_response = query.execute()
    records = records_response.data
    
    print(f"Found {len(records)} records\n")
    
    if args.dry_run:
        print("Mode: DRY RUN (no changes will be made)\n")
    else:
        print("Mode: LIVE MIGRATION\n")
        confirm = input("Are you sure you want to proceed? (yes/no): ")
        if confirm.lower() != 'yes':
            print("Migration cancelled")
            return
    
    print("="*60)
    print("Processing records...")
    print("="*60)
    print()
    
    total_stats = {
        'processed': 0,
        'skipped': 0,
        'errors': 0,
        'contributors': 0,
        'contributions': 0
    }
    
    for i, record in enumerate(records, 1):
        artist = record.get('artist', 'Unknown')
        album = record.get('album', 'Unknown')
        
        print(f"[{i}/{len(records)}] {artist} - {album}")
        
        stats = migrate_record_credits(client, record, dry_run=args.dry_run)
        
        if stats['error']:
            print(f"  ❌ Error: {stats['error']}")
            total_stats['errors'] += 1
        elif stats['skipped']:
            print(f"  ⏭️  Skipped (no musicians data)")
            total_stats['skipped'] += 1
        else:
            print(f"  ✓ Added {stats['contributors_added']} contributors, {stats['contributions_added']} contributions")
            total_stats['contributors'] += stats['contributors_added']
            total_stats['contributions'] += stats['contributions_added']
        
        total_stats['processed'] += 1
    
    print()
    print("="*60)
    print("MIGRATION COMPLETE")
    print("="*60)
    print(f"Records processed: {total_stats['processed']}")
    print(f"Records skipped: {total_stats['skipped']}")
    print(f"Errors: {total_stats['errors']}")
    print(f"Contributors: {total_stats['contributors']}")
    print(f"Contributions: {total_stats['contributions']}")


if __name__ == '__main__':
    main()


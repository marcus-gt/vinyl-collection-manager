#!/usr/bin/env python3
"""
Quick script to verify if data was written to the new relational tables
"""

import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# Initialize Supabase client
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

# Your user ID
user_id = "50084d92-4bd9-4720-a577-566c2665e48d"

print("=" * 80)
print("CHECKING NEW RELATIONAL TABLES")
print("=" * 80)

# Check contributors
print("\n1. CONTRIBUTORS TABLE:")
try:
    result = supabase.table('contributors').select('*').limit(10).execute()
    print(f"   Total contributors found: {len(result.data)}")
    if result.data:
        for c in result.data[:5]:
            print(f"   - {c['name']} (ID: {c['id']})")
except Exception as e:
    print(f"   ERROR: {e}")

# Check contribution_categories
print("\n2. CONTRIBUTION_CATEGORIES TABLE:")
try:
    result = supabase.table('contribution_categories').select('*').limit(10).execute()
    print(f"   Total categories found: {len(result.data)}")
    if result.data:
        for c in result.data[:5]:
            print(f"   - {c['main_category']} > {c['sub_category']} (ID: {c['id']})")
except Exception as e:
    print(f"   ERROR: {e}")

# Check contributions
print("\n3. CONTRIBUTIONS TABLE:")
try:
    result = supabase.table('contributions').select('*').eq('user_id', user_id).limit(10).execute()
    print(f"   Total contributions found for your user: {len(result.data)}")
    if result.data:
        for c in result.data[:5]:
            print(f"   - Record: {c['record_id']}, Contributor: {c['contributor_id']}, Category: {c['category_id']}")
            print(f"     Roles: {c.get('roles', [])}")
            print(f"     Instruments: {c.get('instruments', [])}")
except Exception as e:
    print(f"   ERROR: {e}")

# Check most recent vinyl record
print("\n4. MOST RECENT VINYL RECORD:")
try:
    result = supabase.table('vinyl_records').select('id, artist, album, created_at').eq('user_id', user_id).order('created_at', desc=True).limit(1).execute()
    if result.data:
        record = result.data[0]
        print(f"   - {record['artist']} - {record['album']}")
        print(f"   - ID: {record['id']}")
        print(f"   - Created: {record['created_at']}")
        
        # Check if this record has contributions
        record_id = record['id']
        contrib_result = supabase.table('contributions').select('*').eq('record_id', record_id).execute()
        print(f"   - Contributions for this record: {len(contrib_result.data)}")
except Exception as e:
    print(f"   ERROR: {e}")

print("\n" + "=" * 80)


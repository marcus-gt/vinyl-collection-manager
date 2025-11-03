import os
from supabase import create_client, Client
from typing import Optional, Dict, Any
from datetime import datetime
from flask import session
import requests
import json

def get_supabase_client() -> Client:
    """Get a Supabase client with the current access token if available."""
    print("\n=== Getting Supabase Client ===")
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")  # This is the anon key
    access_token = session.get('access_token')
    
    print(f"URL: {url}")
    print(f"Access token present: {'Yes' if access_token else 'No'}")
    
    if not url or not key:
        print("Error: Missing Supabase configuration")
        raise ValueError("Missing Supabase configuration")
    
    try:
        # Create client with anon key
        client = create_client(url, key)
        print("Created Supabase client with anon key")
        
        # Set the auth token if available
        if access_token:
            print("Setting auth header with access token")
            client.postgrest.auth(access_token)
            print("Successfully set auth header")
        else:
            print("Warning: No access token available")
        
        return client
    except Exception as e:
        print(f"Error creating Supabase client: {str(e)}")
        import traceback
        traceback.print_exc()
        raise

# Initialize default Supabase client
supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

def refresh_session_token(refresh_token: str) -> Dict[str, Any]:
    """Refresh the Supabase session token using the refresh token"""
    try:
        if not refresh_token:
            print("No refresh token provided")
            return {"success": False, "error": "No refresh token provided"}
            
        url = os.getenv("SUPABASE_URL")
        if not url:
            print("Missing Supabase URL")
            return {"success": False, "error": "Missing Supabase configuration"}
            
        # Make a direct API call to Supabase Auth refresh endpoint
        refresh_url = f"{url}/auth/v1/token?grant_type=refresh_token"
        
        headers = {
            "Content-Type": "application/json",
            "ApiKey": os.getenv("SUPABASE_KEY")
        }
        
        payload = {
            "refresh_token": refresh_token
        }
        
        print(f"Refreshing token using URL: {refresh_url}")
        response = requests.post(refresh_url, headers=headers, json=payload)
        
        print(f"Refresh token response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("Token refreshed successfully")
            return {
                "success": True,
                "access_token": data["access_token"],
                "refresh_token": data["refresh_token"],
                "user": data.get("user", {})
            }
        else:
            error_msg = f"Failed to refresh token: {response.status_code}"
            try:
                error_data = response.json()
                error_msg = f"{error_msg} - {error_data.get('error', 'Unknown error')}"
            except:
                pass
                
            print(error_msg)
            return {"success": False, "error": error_msg}
            
    except Exception as e:
        print(f"Error refreshing token: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

def create_user(email: str, password: str) -> Dict[str, Any]:
    """Create a new user account."""
    try:
        # First sign up the user
        auth_response = supabase.auth.sign_up({
            "email": email,
            "password": password
        })
        
        if not auth_response.user:
            return {"success": False, "error": "Failed to create user"}
        
        # Get the access token
        session = auth_response.session
        if not session:
            return {"success": False, "error": "No session created"}
            
        # Create profile with the authenticated client
        profile_data = {
            'id': auth_response.user.id,
            'email': email,
            'created_at': datetime.utcnow().isoformat()
        }
        
        # Insert profile using the authenticated session
        profile_response = supabase.table('profiles').insert(profile_data).execute()
        
        return {"success": True, "user": auth_response.user}
    except Exception as e:
        return {"success": False, "error": str(e)}

def login_user(email: str, password: str) -> Dict[str, Any]:
    """Login a user."""
    try:
        response = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password
        })
        # Store both tokens in session
        session['access_token'] = response.session.access_token
        session['refresh_token'] = response.session.refresh_token
        return {"success": True, "session": response.session}
    except Exception as e:
        return {"success": False, "error": str(e)}

def get_user_collection(user_id: str) -> Dict[str, Any]:
    """Get a user's vinyl collection."""
    try:
        print("\n=== Fetching User Collection ===")
        print(f"User ID: {user_id}")
        
        # Get client with current session token
        client = get_supabase_client()
        print("Building query...")
        
        query = client.table('vinyl_records').select('*').eq('user_id', user_id)
        print(f"Query built: {query}")
        
        print("Executing query...")
        response = query.execute()
        print(f"Raw response: {response}")
        print(f"Response data type: {type(response.data)}")
        print(f"Number of records: {len(response.data)}")
        
        return {"success": True, "records": response.data}
    except Exception as e:
        print(f"Error fetching collection: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

def parse_credit_string(credit_str: str) -> tuple[str, list[str]]:
    """
    Parse a credit string like "Makaya McCraven (Drums, Producer, Mixed By)"
    or "Joel Ross (3) (Performer, Vibraphone)"
    Returns: (name, [roles/instruments])
    
    Handles names with disambiguation numbers like "Joel Ross (3)"
    by extracting everything before the LAST set of parentheses as the name.
    """
    import re
    # Match: everything up to the last '(' as name, content of last '()' as roles
    match = re.match(r'^(.+)\s*\(([^)]+)\)$', credit_str.strip())
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
    """
    role_keywords = {'by', 'producer', 'engineer', 'mastered', 'mixed', 'recorded', 
                     'written', 'composed', 'arranged', 'featuring', 'performer', 
                     'conductor', 'leader', 'edited', 'overdubbed'}
    
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


def insert_contributions_relational(client, record_id: str, user_id: str, musicians_data: dict) -> Dict[str, Any]:
    """
    Insert credits into the new relational model (contributors + contributions tables).
    """
    try:
        if not musicians_data or not isinstance(musicians_data, dict):
            return {"success": True, "contributors_added": 0, "contributions_added": 0}
        
        # Get category mappings
        categories_response = client.table('contribution_categories').select('*').execute()
        category_map = {
            (cat['main_category'], cat['sub_category']): cat['id']
            for cat in categories_response.data
        }
        
        stats = {"contributors_added": 0, "contributions_added": 0}
        
        # Process each credit
        for main_category, subcategories in musicians_data.items():
            if main_category == '_role_index':
                continue  # Skip the index if present
            
            for sub_category, credits in subcategories.items():
                category_id = category_map.get((main_category, sub_category))
                
                if not category_id:
                    print(f"  ⚠️  Unknown category: {main_category} / {sub_category}")
                    continue
                
                for credit_str in credits:
                    name, roles = parse_credit_string(credit_str)
                    pure_roles, instruments = categorize_roles(roles)
                    
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
                            print(f"  ⚠️  Error with contributor {name}: {e}")
                            continue
                    
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
                        print(f"  ⚠️  Error inserting contribution for {name}: {e}")
        
        return {"success": True, **stats}
        
    except Exception as e:
        print(f"Error inserting relational contributions: {e}")
        return {"success": False, "error": str(e)}


def add_record_to_collection(user_id: str, record_data: Dict[str, Any]) -> Dict[str, Any]:
    """Add a record to user's collection."""
    try:
        print("\n=== Adding Record to Collection ===")
        print(f"User ID: {user_id}")
        print(f"Raw record data: {record_data}")
        
        # Get authenticated client
        client = get_supabase_client()
        
        # Map fields from API response to database schema
        record_to_insert = {
            # Core fields
            'user_id': user_id,
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat(),
            'artist': record_data.get('artist'),
            'album': record_data.get('album'),
            'added_from': record_data.get('added_from', ''),
            
            # Master release fields
            'master_id': record_data.get('master_id'),
            'master_url': record_data.get('master_url'),
            'tracklist': json.dumps(record_data.get('tracklist', [])) if record_data.get('tracklist') else None,
            
            # Original/main release fields
            'year': record_data.get('year'),
            'label': record_data.get('label'),
            'country': record_data.get('country'),
            'master_format': record_data.get('master_format'),
            'original_release_id': record_data.get('original_release_id'),
            'original_release_url': record_data.get('original_release_url'),
            'original_catno': record_data.get('original_catno'),
            'original_release_date': record_data.get('original_release_date'),
            'original_identifiers': json.dumps(record_data.get('original_identifiers', [])) if record_data.get('original_identifiers') else None,
            
            # Current/specific release fields
            'current_release_id': record_data.get('current_release_id'),
            'current_release_url': record_data.get('current_release_url'),
            'current_release_year': record_data.get('current_release_year'),
            'current_release_format': record_data.get('current_release_format'),
            'current_label': record_data.get('current_label'),
            'current_catno': record_data.get('current_catno'),
            'current_country': record_data.get('current_country'),
            'current_release_date': record_data.get('current_release_date'),
            'current_identifiers': json.dumps(record_data.get('current_identifiers', [])) if record_data.get('current_identifiers') else None,
            
            # Shared fields
            'genres': record_data.get('genres', []),
            'styles': record_data.get('styles', []),
            'musicians': json.dumps(record_data.get('musicians', {})) if isinstance(record_data.get('musicians'), dict) else record_data.get('musicians', []),
            
            # Legacy fields
            'barcode': record_data.get('barcode')
        }
        
        print("\nPrepared record data:")
        for key, value in record_to_insert.items():
            print(f"{key}: {type(value).__name__} = {value}")
        
        print("\nSending to Supabase...")
        response = client.table('vinyl_records').insert(record_to_insert).execute()
        print(f"Supabase response: {response.data}")
        
        if not response.data:
            print("Error: No data returned from Supabase")
            return {"success": False, "error": "No data returned from database"}

        # Get the newly created record's ID
        new_record_id = response.data[0]['id']
        
        # Insert credits into relational model
        print("\nInserting credits into relational model...")
        musicians_data = record_data.get('musicians')
        if musicians_data and isinstance(musicians_data, dict):
            relational_result = insert_contributions_relational(client, new_record_id, user_id, musicians_data)
            if relational_result.get('success'):
                print(f"✓ Added {relational_result.get('contributors_added', 0)} contributors, "
                      f"{relational_result.get('contributions_added', 0)} contributions")
            else:
                print(f"⚠️ Warning: Failed to insert relational contributions: {relational_result.get('error')}")
        
        # Get custom columns and handle custom values
        custom_columns_response = client.table('custom_columns').select('*').eq('user_id', user_id).execute()
        if custom_columns_response.data:
            print("\nProcessing custom values...")
            now = datetime.utcnow().isoformat()
            
            # Get the custom values sent from frontend
            frontend_custom_values = record_data.get('customValues', {})
            print(f"Custom values from frontend: {frontend_custom_values}")
            
            # Collect custom values to insert
            custom_values = []
            for column in custom_columns_response.data:
                column_id = column['id']
                # Check if we have a value from the frontend
                if column_id in frontend_custom_values:
                    value = frontend_custom_values[column_id]
                    print(f"Using frontend value for {column['name']}: {value}")
                # If not, use default value if available
                elif column.get('default_value'):
                    value = column['default_value']
                    print(f"Using default value for {column['name']}: {value}")
                else:
                    print(f"No value for {column['name']}, skipping")
                    continue
                
                custom_values.append({
                    'record_id': new_record_id,
                    'column_id': column_id,
                    'value': value,
                    'created_at': now,
                    'updated_at': now
                })
            
            # Insert custom values if any exist
            if custom_values:
                print(f"Inserting {len(custom_values)} custom values")
                custom_values_response = client.table('custom_column_values').insert(custom_values).execute()
                print(f"Custom values response: {custom_values_response.data}")
            
        return {"success": True, "record": response.data[0]}
    except Exception as e:
        print(f"\nError adding record: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

def remove_record_from_collection(user_id: str, record_id: str) -> Dict[str, Any]:
    """Remove a record from user's collection."""
    try:
        print("\n=== Removing Record from Collection ===")
        print(f"User ID: {user_id}")
        print(f"Record ID: {record_id}")
        
        # Get authenticated client
        client = get_supabase_client()
        
        print("Executing delete query...")
        response = client.table('vinyl_records').delete().match({
            'id': record_id,
            'user_id': user_id
        }).execute()
        
        print(f"Delete response: {response.data}")
        
        if not response.data:
            print("No data returned from delete operation")
            return {"success": False, "error": "Record not found or already deleted"}
            
        return {"success": True}
    except Exception as e:
        print(f"Error removing record: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

def get_contributors_for_records(user_id: str, record_ids: list[str] = None):
    """
    Fetch contributors for records from the relational tables.
    Returns a dict mapping record_id to categorized contributors.
    """
    try:
        client = get_supabase_client()
        
        # Build query for contributions with joins
        query = client.table('contributions') \
            .select('*, contributors(name), contribution_categories(main_category, sub_category)') \
            .eq('user_id', user_id)
        
        # Filter by specific record_ids if provided
        if record_ids:
            query = query.in_('record_id', record_ids)
        
        response = query.execute()
        
        print(f"Contributors query returned {len(response.data) if response.data else 0} contributions")
        
        if not response.data:
            return {}
        
        # Organize contributors by record_id, then by category/subcategory
        contributors_by_record = {}
        
        for contrib in response.data:
            record_id = contrib['record_id']
            contributor_name = contrib['contributors']['name']
            main_cat = contrib['contribution_categories']['main_category']
            sub_cat = contrib['contribution_categories']['sub_category'] if contrib['contribution_categories']['sub_category'] else 'Other'
            
            # Initialize nested structure
            if record_id not in contributors_by_record:
                contributors_by_record[record_id] = {}
            if main_cat not in contributors_by_record[record_id]:
                contributors_by_record[record_id][main_cat] = {}
            if sub_cat not in contributors_by_record[record_id][main_cat]:
                contributors_by_record[record_id][main_cat][sub_cat] = []
            
            # Add contributor
            contributor_data = {
                'name': contributor_name,
                'roles': contrib['roles'] or [],
                'instruments': contrib['instruments'] or [],
                'notes': contrib['notes']
            }
            # Debug logging for Joel Ross
            if 'Joel Ross' in contributor_name:
                print(f"DEBUG - Joel Ross contributor: name={contributor_name}, roles={contrib['roles']}, instruments={contrib['instruments']}")
            contributors_by_record[record_id][main_cat][sub_cat].append(contributor_data)
        
        print(f"Organized contributors for {len(contributors_by_record)} records")
        return contributors_by_record
    
    except Exception as e:
        print(f"Error fetching contributors: {str(e)}")
        import traceback
        traceback.print_exc()
        return {} 

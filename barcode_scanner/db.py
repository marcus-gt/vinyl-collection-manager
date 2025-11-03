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

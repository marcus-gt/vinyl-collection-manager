import os
from supabase import create_client, Client
from typing import Optional, Dict, Any
from datetime import datetime
from flask import session

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
            'user_id': user_id,
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat(),
            'artist': record_data.get('artist'),
            'album': record_data.get('album'),
            'year': record_data.get('year'),
            'label': record_data.get('label'),
            'genres': record_data.get('genres', []),
            'styles': record_data.get('styles', []),
            'musicians': record_data.get('musicians', []),
            'master_url': record_data.get('master_url'),
            'current_release_url': record_data.get('current_release_url'),
            'current_release_year': record_data.get('current_release_year'),
            'barcode': record_data.get('barcode'),
            'notes': record_data.get('notes', '')
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
            
        return {"success": True, "record": response.data[0]}
    except Exception as e:
        print(f"\nError adding record: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

def remove_record_from_collection(user_id: str, record_id: str) -> Dict[str, Any]:
    """Remove a record from user's collection."""
    try:
        response = supabase.table('vinyl_records').delete().match({
            'id': record_id,
            'user_id': user_id
        }).execute()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

def update_record_notes(user_id: str, record_id: str, notes: str) -> Dict[str, Any]:
    """Update notes for a record in user's collection."""
    try:
        response = supabase.table('vinyl_records').update({
            'notes': notes,
            'updated_at': datetime.utcnow().isoformat()
        }).match({
            'id': record_id,
            'user_id': user_id
        }).execute()
        return {"success": True, "record": response.data[0]}
    except Exception as e:
        return {"success": False, "error": str(e)} 

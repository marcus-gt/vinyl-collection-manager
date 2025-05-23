import os
from pathlib import Path
from dotenv import load_dotenv
from datetime import timedelta, datetime
import requests
from functools import wraps
import jwt  # Add JWT import for token decoding

# Load environment variables first
parent_dir = str(Path(__file__).resolve().parent.parent)
dotenv_path = os.path.join(parent_dir, '.env')
load_dotenv(dotenv_path)

# Set environment variables if not set
if not os.getenv('FLASK_ENV'):
    os.environ['FLASK_ENV'] = 'development'

# Now import everything else
from flask import Flask, jsonify, request, session, send_from_directory, redirect
from flask_cors import CORS
import sys

sys.path.append(parent_dir)
from discogs_lookup import search_by_barcode, search_by_discogs_id, search_by_discogs_url, search_by_artist_album
from .db import (
    create_user,
    login_user,
    add_record_to_collection,
    get_user_collection,
    remove_record_from_collection,
    get_supabase_client,
    refresh_session_token
)
from .spotify import (
    get_spotify_auth_url,
    handle_spotify_callback,
    get_spotify_playlists,
    get_playlist_tracks,
    require_spotify_auth,
    refresh_spotify_token,
    get_album_from_url,
    subscribe_to_playlist,
    unsubscribe_from_playlist,
    get_subscribed_playlist,
    sync_subscribed_playlists
)

# Set up static file serving
static_folder = os.path.join(parent_dir, 'frontend', 'dist')
app = Flask(__name__, 
    static_folder=static_folder, 
    static_url_path='',  # Serve static files from root
    template_folder=static_folder
)

app.secret_key = os.getenv('FLASK_SECRET_KEY')

# Define allowed origins based on environment
allowed_origins = [
    "http://localhost:5173",  # Local development
    "http://localhost:10000",  # Local production build
    "https://vinyl-collection-manager.onrender.com",  # Production
]

# Configure CORS based on environment
if os.getenv('FLASK_ENV') == 'production':
    CORS(app,
         origins=["https://vinyl-collection-manager.onrender.com"],
         supports_credentials=True,
         expose_headers=["Set-Cookie"],
         allow_headers=["Content-Type", "Authorization", "Cookie"],
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
else:
    CORS(app,
         origins=allowed_origins,
         supports_credentials=True,
         expose_headers=["Set-Cookie"],
         allow_headers=["Content-Type", "Authorization", "Cookie"],
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])

# Add session configuration
print("\n=== Flask Configuration ===")
print(f"FLASK_ENV: {os.getenv('FLASK_ENV')}")
print(f"Running in {'production' if os.getenv('FLASK_ENV') == 'production' else 'development'} mode")

# Update session configuration with much longer lifetime
session_config = {
    'SESSION_COOKIE_SECURE': True,
    'SESSION_COOKIE_HTTPONLY': True,
    'SESSION_COOKIE_SAMESITE': 'None',
    'SESSION_COOKIE_PATH': '/',
    'PERMANENT_SESSION_LIFETIME': timedelta(days=365),  # Set to 1 year
    'SESSION_REFRESH_EACH_REQUEST': True
}

if os.getenv('FLASK_ENV') == 'production':
    session_config.update({
        'SESSION_COOKIE_DOMAIN': 'vinyl-collection-manager.onrender.com',
        'SESSION_COOKIE_NAME': 'session',
        'REMEMBER_COOKIE_SECURE': True,
        'REMEMBER_COOKIE_HTTPONLY': True,
        'REMEMBER_COOKIE_SAMESITE': 'None',
        'REMEMBER_COOKIE_DOMAIN': 'vinyl-collection-manager.onrender.com'
    })

app.config.update(**session_config)

print("\n=== Session Configuration ===")
print(f"SESSION_COOKIE_DOMAIN: {app.config.get('SESSION_COOKIE_DOMAIN', 'Not set - using request host')}")
print(f"SESSION_COOKIE_SECURE: {app.config['SESSION_COOKIE_SECURE']}")
print(f"SESSION_COOKIE_SAMESITE: {app.config['SESSION_COOKIE_SAMESITE']}")

# At the top of the file, after loading environment variables
print("\n=== Environment Configuration ===")
print(f"FLASK_ENV: {os.getenv('FLASK_ENV')}")
print(f"SPOTIFY_CLIENT_ID: {os.getenv('SPOTIFY_CLIENT_ID')}")
print(f"SPOTIFY_CLIENT_SECRET: {'Present' if os.getenv('SPOTIFY_CLIENT_SECRET') else 'Missing'}")
print(f"SPOTIFY_REDIRECT_URI: {os.getenv('SPOTIFY_REDIRECT_URI')}")

# Validate required environment variables
required_vars = [
    'FLASK_SECRET_KEY',
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
    'SPOTIFY_REDIRECT_URI'
]

missing_vars = [var for var in required_vars if not os.getenv(var)]
if missing_vars:
    print("\nERROR: Missing required environment variables:")
    for var in missing_vars:
        print(f"- {var}")
    sys.exit(1)

# Validate Spotify redirect URI format
spotify_redirect_uri = os.getenv('SPOTIFY_REDIRECT_URI')
if spotify_redirect_uri == 'None' or not isinstance(spotify_redirect_uri, str):
    print("\nERROR: Invalid SPOTIFY_REDIRECT_URI format")
    print(f"Current value: {spotify_redirect_uri}")
    sys.exit(1)

if os.getenv('FLASK_ENV') == 'production':
    if not spotify_redirect_uri.startswith('https://'):
        print("\nERROR: SPOTIFY_REDIRECT_URI must use HTTPS in production")
        print(f"Current value: {spotify_redirect_uri}")
        sys.exit(1)

print("\nConfiguration validated successfully")

def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({
                'success': False,
                'error': 'Not authenticated'
            }), 401
        return f(*args, **kwargs)
    return decorated_function

def check_token_expiration():
    """Check if the token is expired and refresh if needed"""
    try:
        # Only check if we have a token in the session
        if 'access_token' in session:
            # Try to decode the token to get expiry time
            # Note: This assumes JWT token format from Supabase
            token = session['access_token']
            try:
                # Just check if the token can be decoded
                decoded = jwt.decode(token, options={"verify_signature": False})
                
                # Check if token is about to expire (within 30 minutes)
                exp = decoded.get('exp')
                if exp:
                    now = datetime.utcnow().timestamp()
                    # If token expires in less than 30 minutes, refresh it
                    if exp - now < 1800:  # 30 minutes in seconds
                        print("Token about to expire, refreshing...")
                        refresh_result = refresh_session_token(session.get('refresh_token'))
                        if refresh_result['success']:
                            session['access_token'] = refresh_result['access_token']
                            session['refresh_token'] = refresh_result['refresh_token']
                            session.modified = True
                            print("Token refreshed successfully")
                        else:
                            print("Failed to refresh token")
            except jwt.PyJWTError as e:
                # If token is invalid, try to refresh it
                print(f"Invalid token: {str(e)}, attempting refresh...")
                refresh_result = refresh_session_token(session.get('refresh_token'))
                if refresh_result['success']:
                    session['access_token'] = refresh_result['access_token']
                    session['refresh_token'] = refresh_result['refresh_token']
                    session.modified = True
                    print("Token refreshed successfully after error")
                else:
                    print("Failed to refresh token after error")
                    # If refresh fails, clear the session to force re-login
                    session.pop('user_id', None)
                    session.pop('access_token', None)
                    session.pop('refresh_token', None)
    except Exception as e:
        print(f"Error checking token expiration: {str(e)}")

@app.before_request
def before_request():
    """Debug request information and ensure session is configured."""
    print("\n=== Request Debug ===")
    print(f"Request path: {request.path}")
    print(f"Request method: {request.method}")
    print(f"Request headers: {dict(request.headers)}")
    print(f"Request cookies: {request.cookies}")
    print(f"Current session before: {dict(session)}")
    
    # Ensure session is permanent
    if not session.get('_permanent'):
        session.permanent = True
        
    # Check and refresh token if needed
    if 'user_id' in session and request.method != 'OPTIONS':
        check_token_expiration()
        
    # Debug session configuration
    print("\n=== Session Configuration ===")
    print(f"SESSION_COOKIE_DOMAIN: {app.config.get('SESSION_COOKIE_DOMAIN')}")
    print(f"SESSION_COOKIE_SECURE: {app.config.get('SESSION_COOKIE_SECURE')}")
    print(f"SESSION_COOKIE_SAMESITE: {app.config.get('SESSION_COOKIE_SAMESITE')}")
    print(f"SESSION_COOKIE_PATH: {app.config.get('SESSION_COOKIE_PATH')}")
    print(f"SESSION_COOKIE_NAME: {app.config.get('SESSION_COOKIE_NAME')}")
    print(f"Request is secure: {request.is_secure}")
    print(f"Request scheme: {request.scheme}")
    print(f"X-Forwarded-Proto: {request.headers.get('X-Forwarded-Proto')}")

@app.after_request
def after_request(response):
    """Modify response headers for CORS and security."""
    origin = request.headers.get('Origin')
    
    if os.getenv('FLASK_ENV') == 'production':
        response.headers.update({
            'Access-Control-Allow-Origin': 'https://vinyl-collection-manager.onrender.com',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
            'Access-Control-Expose-Headers': 'Set-Cookie'
        })
        
        # Ensure cookie settings are correct
        if 'Set-Cookie' in response.headers:
            cookie_parts = [
                response.headers['Set-Cookie'].split(';')[0],  # Keep the session value
                'Domain=vinyl-collection-manager.onrender.com',
                'Path=/',
                'Secure',
                'HttpOnly',
                'SameSite=None',
                'Max-Age=31536000'  # Add one year expiration
            ]
            response.headers['Set-Cookie'] = '; '.join(cookie_parts)
    
    # Add security headers
    response.headers.update({
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN'
    })
    
    # Debug logging for cookie issues
    if 'Set-Cookie' in response.headers:
        print("\n=== Cookie Debug ===")
        print(f"Set-Cookie header: {response.headers['Set-Cookie']}")
        print(f"Request origin: {origin}")
        print(f"Request host: {request.host}")
        print(f"Session config: {app.config['SESSION_COOKIE_DOMAIN']}")
    
    return response

@app.before_request
def ensure_https():
    """Ensure all requests use HTTPS."""
    if request.headers.get('X-Forwarded-Proto', 'http') == 'http' and os.getenv('FLASK_ENV') == 'production':
        url = request.url.replace('http://', 'https://', 1)
        return redirect(url, code=301)

@app.before_request
def make_session_permanent():
    """Ensure session is permanent."""
    session.permanent = True
    # Print session info for debugging
    print("\n=== Session Debug ===")
    print(f"Current session: {dict(session)}")
    print(f"Session cookie name: {app.config.get('SESSION_COOKIE_NAME', 'session')}")
    print(f"Session cookie domain: {app.config.get('SESSION_COOKIE_DOMAIN', 'Not set')}")

# Frontend routes - these must be before API routes
@app.route('/')
@app.route('/login')
@app.route('/register')
@app.route('/collection')
@app.route('/scanner')
def serve_spa():
    """Serve the SPA for known frontend routes."""
    print("\n=== Serving SPA Route ===")
    print(f"Request path: {request.path}")
    print(f"Static folder: {app.static_folder}")
    print(f"Session: {dict(session)}")
    print(f"Request cookies: {request.cookies}")
    print(f"Request host: {request.host}")
    print(f"Request environ: {request.environ.get('SERVER_NAME')}")
    return send_from_directory(app.static_folder, 'index.html')

# Static files route
@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files."""
    print(f"\n=== Serving Static File ===")
    print(f"Requested filename: {filename}")
    print(f"Full path: {os.path.join(app.static_folder, filename)}")
    
    if filename.startswith('api/'):
        print("API route detected, passing through")
        return app.send_static_file(filename)
    
    try:
        full_path = os.path.join(app.static_folder, filename)
        print(f"Checking if file exists at: {full_path}")
        if os.path.exists(full_path):
            print("File exists, serving it")
            return send_from_directory(app.static_folder, filename)
    except Exception as e:
        print(f"Error checking/serving file: {str(e)}")
    
    print("Falling back to index.html")
    return send_from_directory(app.static_folder, 'index.html')

# API routes first (keep all existing API routes as they are)
@app.route('/api')
def api_index():
    """Test endpoint to verify server is running."""
    return jsonify({
        'status': 'ok',
        'message': 'Server is running'
    })

@app.route('/lookup/<barcode>')
def lookup(barcode):
    try:
        result = search_by_barcode(barcode)
        
        if result:
            response_data = {
                'success': True,
                'title': f"{result.get('artist')} - {result.get('album')}" if result.get('artist') and result.get('album') else result.get('title'),
                'year': result.get('year'),
                'format': ', '.join(result.get('format', [])),
                'label': result.get('label'),
                'web_url': result.get('uri'),
                'master_url': result.get('master_url'),
                'genres': result.get('genres'),
                'styles': result.get('styles'),
                'is_master': result.get('is_master', False),
                'release_year': result.get('release_year'),
                'release_url': result.get('release_url'),
                'musicians': result.get('musicians'),
                'added_from': result.get('added_from', 'barcode')
            }
            return jsonify(response_data)
        else:
            return jsonify({
                'success': False,
                'message': 'No results found'
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/auth/register', methods=['POST'])
def register():
    """Register a new user."""
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    
    if not email or not password:
        return jsonify({'success': False, 'error': 'Email and password required'}), 400
    
    result = create_user(email, password)
    if result['success']:
        return jsonify({'success': True, 'user': {
            'id': result['user'].id,
            'email': result['user'].email
        }}), 201
    return jsonify({'success': False, 'error': result['error']}), 400

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Login a user."""
    print("\n=== Login Attempt ===")
    print(f"Request Headers: {dict(request.headers)}")
    
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    
    if not email or not password:
        return jsonify({
            'success': False,
            'error': 'Email and password required'
        }), 400
    
    try:
        result = login_user(email, password)
        print(f"Login result: {result}")
        
        if result['success'] and result['session']:
            # Set session data BEFORE creating response
            session.permanent = True
            session['user_id'] = result['session'].user.id
            session['access_token'] = result['session'].access_token
            session['refresh_token'] = result['session'].refresh_token
            session.modified = True  # Ensure Flask knows to save the session
            
            print("\n=== Session After Login ===")
            print(f"Session data: {dict(session)}")
            
            response = jsonify({
                'success': True,
                'session': {
                    'access_token': result['session'].access_token,
                    'user': {
                        'id': result['session'].user.id,
                        'email': result['session'].user.email
                    }
                }
            })
            
            # Debug the cookie
            print("\n=== Cookie Debug ===")
            print(f"Session cookie: {session.get('user_id')}")
            print(f"Response cookies: {response.headers.get('Set-Cookie')}")
            
            return response
            
        return jsonify({
            'success': False,
            'error': result.get('error', 'Login failed')
        }), 401
        
    except Exception as e:
        print(f"Login error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Logout the current user."""
    session.clear()
    return jsonify({'success': True}), 200

@app.route('/api/auth/me')
def get_current_user():
    """Get current authenticated user."""
    print("\n=== Auth Check ===")
    print(f"Session data: {dict(session)}")
    print(f"Request cookies: {request.cookies}")
    
    try:
        user_id = session.get('user_id')
        
        if not user_id:
            # Don't clear the session, just return 401
            return jsonify({
                'success': False,
                'error': 'Not authenticated'
            }), 401
        
        client = get_supabase_client()
        
        try:
            response = client.table('users').select('*').eq('id', user_id).single().execute()
            
            if response.data:
                # Return both user data and session info
                return jsonify({
                    'success': True,
                    'user': response.data,
                    'session': {
                        'user': response.data,
                        'access_token': session.get('access_token')
                    }
                })
            
            # User not found in database
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 401
            
        except Exception as db_error:
            print(f"Database error: {str(db_error)}")
            return jsonify({
                'success': False,
                'error': 'Database error'
            }), 500
            
    except Exception as e:
        print(f"Unexpected error in get_current_user: {str(e)}")
        print(f"Error type: {type(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Server error'
        }), 500

@app.route('/api/auth/auto-sync', methods=['POST'])
@require_auth
def auto_sync_playlists():
    """Automatically sync Spotify playlists when a user logs in or returns after being idle"""
    print("\n=== Auto-Sync Playlists ===")
    
    try:
        # Just use the existing sync functionality
        return sync_playlists()
    except Exception as e:
        print(f"Error in auto-sync: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Failed to auto-sync playlists'
        }), 500

@app.route('/api/records', methods=['GET'])
@require_auth
def get_records():
    try:
        # Get authenticated client
        client = get_supabase_client()
        
        # Simplified query that includes the cache
        response = client.table('vinyl_records').select('*').eq(
            'user_id', session['user_id']
        ).execute()
        
        if response.data:
            return jsonify({
                'success': True,
                'data': response.data
            })
        return jsonify({
            'success': False,
            'error': 'No records found'
        })
    except Exception as e:
        print(f"Error fetching records: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch records'
        })

@app.route('/api/records', methods=['POST'])
@require_auth
def add_record():
    try:
        data = request.get_json()
        user_id = session.get('user_id')
        client = get_supabase_client()

        # Get custom columns to check for default values
        custom_columns = client.table('custom_columns').select('*').eq('user_id', user_id).execute()
        
        # Start with provided custom_values_cache or empty dict
        custom_values = data.get('custom_values_cache', {})
        
        # Only apply defaults if value not already set
        if custom_columns.data:
            for column in custom_columns.data:
                if column.get('defaultValue') and column['id'] not in custom_values:
                    custom_values[column['id']] = column['defaultValue']
        
        # Update data with final custom values
        data['custom_values_cache'] = custom_values
        
        # Create the record
        response = client.table('vinyl_records').insert({
            **data,
            'user_id': user_id
        }).execute()

        if response.data:
            return jsonify({
                'success': True,
                'data': response.data[0]
            }), 201
        return jsonify({
            'success': False,
            'error': 'Failed to add record'
        }), 400
    except Exception as e:
        print(f"Error adding record: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/records/<record_id>', methods=['DELETE'])
def delete_record(record_id):
    """Delete a record from the user's collection."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    
    result = remove_record_from_collection(user_id, record_id)
    if result['success']:
        return jsonify({'success': True}), 200
    return jsonify({'success': False, 'error': result['error']}), 400

@app.route('/api/lookup/barcode/<barcode>')
def lookup_barcode(barcode):
    try:
        print(f"\n=== Looking up barcode: {barcode} ===")
        # Handle UPC to EAN conversion
        search_barcodes = [barcode]
        if len(barcode) == 12:
            # If it's a 12-digit UPC, also try with a leading zero
            search_barcodes.append('0' + barcode)
            print(f"Added leading zero version: {search_barcodes[-1]}")
        elif len(barcode) == 13 and barcode.startswith('0'):
            # If it's a 13-digit EAN starting with 0, also try without it
            search_barcodes.append(barcode[1:])
            print(f"Added version without leading zero: {search_barcodes[-1]}")

        print(f"Trying barcodes: {search_barcodes}")

        # Try each barcode format
        for search_barcode in search_barcodes:
            print(f"\nSearching for barcode: {search_barcode}")
            result = search_by_barcode(search_barcode)
            print(f"Raw Discogs result: {result}")
            print(f"added_from in raw result: {result.get('added_from') if result else 'NO RESULT'}")
            
            if result:
                # Found a match, process it
                record = {
                    'artist': result.get('artist', 'Unknown Artist'),
                    'album': result.get('album'),
                    'year': result.get('year'),
                    'current_release_year': result.get('current_release_year') if result.get('added_from') == 'barcode' else None,
                    'barcode': barcode,
                    'genres': result.get('genres', []),
                    'styles': result.get('styles', []),
                    'musicians': result.get('musicians', []),
                    'master_url': result.get('master_url'),
                    'current_release_url': result.get('current_release_url') if result.get('added_from') == 'barcode' else None,
                    'label': result.get('label'),
                    'country': result.get('country'),
                    'added_from': result.get('added_from', 'barcode')
                }
                print(f"Processed record data: {record}")
                print(f"Final added_from value: {record['added_from']}")
                return jsonify({
                    'success': True,
                    'data': record
                })

        # No match found
        return jsonify({
            'success': False,
            'error': 'No record found for this barcode'
        }), 404

    except Exception as e:
        print(f"Error looking up barcode: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to lookup barcode'
        }), 500

@app.route('/api/custom-columns', methods=['GET'])
def get_custom_columns():
    """Get all custom columns for the current user."""
    print("\n=== Getting Custom Columns ===")
    user_id = session.get('user_id')
    print(f"User ID from session: {user_id}")
    print(f"Session data: {dict(session)}")
    
    if not user_id:
        print("Error: User not authenticated")
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    
    try:
        print("Getting Supabase client...")
        client = get_supabase_client()
        print("Got Supabase client, executing query...")
        
        response = client.table('custom_columns').select('*').eq('user_id', user_id).execute()
        print(f"Query response: {response}")
        print(f"Response data: {response.data}")
        
        if not response.data and response.data != []:  # Check if data is None or undefined, but allow empty list
            print("Error: No data returned from Supabase")
            return jsonify({'success': False, 'error': 'Failed to get columns'}), 500
        
        # Convert response data to camelCase
        response_data = []
        for column in response.data:
            column_data = dict(column)
            column_data['defaultValue'] = column_data.pop('default_value', None)
            column_data['applyToAll'] = column_data.pop('apply_to_all', False)
            response_data.append(column_data)
            
        return jsonify({'success': True, 'data': response_data}), 200
    except Exception as e:
        print(f"Error getting custom columns: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/custom-columns', methods=['POST'])
def create_custom_column():
    """Create a new custom column."""
    print("\n=== Creating Custom Column ===")
    user_id = session.get('user_id')
    print(f"User ID: {user_id}")
    access_token = session.get('access_token')
    print(f"Access token present: {'Yes' if access_token else 'No'}")
    print(f"Session data: {dict(session)}")
    
    if not user_id:
        print("Error: User not authenticated")
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    
    try:
        data = request.get_json()
        print(f"Request data: {data}")
        
        if not data or not data.get('name') or not data.get('type'):
            print("Error: Missing required fields")
            return jsonify({'success': False, 'error': 'Name and type are required'}), 400
        
        now = datetime.utcnow().isoformat()
        column_data = {
            'user_id': user_id,
            'name': data['name'],
            'type': data['type'],
            'options': data.get('options', []),
            'defaultValue': data.get('defaultValue'),
            'applyToAll': data.get('applyToAll', False),
            'created_at': now,
            'updated_at': now
        }
        print(f"Column data to insert: {column_data}")
        
        # Convert to snake_case for database
        db_column_data = {
            'user_id': column_data['user_id'],
            'name': column_data['name'],
            'type': column_data['type'],
            'options': column_data['options'],
            'default_value': column_data['defaultValue'],
            'apply_to_all': column_data['applyToAll'],
            'created_at': column_data['created_at'],
            'updated_at': column_data['updated_at']
        }
        
        print("Getting Supabase client...")
        client = get_supabase_client()
        print("Got Supabase client")
        
        print("Inserting data into custom_columns table...")
        response = client.table('custom_columns').insert(db_column_data).execute()
        print(f"Supabase response data: {response.data}")
        
        if not response.data:
            print("Error: No data returned from Supabase")
            return jsonify({'success': False, 'error': 'Failed to create column'}), 500
        
        # Convert response data back to camelCase for frontend
        response_data = response.data[0]
        response_data['defaultValue'] = response_data.pop('default_value', None)
        response_data['applyToAll'] = response_data.pop('apply_to_all', False)
        
        # If apply_to_all is true and there's a default value, apply it to all records
        if db_column_data['apply_to_all'] and db_column_data['default_value'] is not None:
            try:
                # Get all records for the user
                records_response = client.table('vinyl_records').select('id').eq('user_id', user_id).execute()
                if records_response.data:
                    # Create custom values for each record
                    values_data = [{
                        'record_id': record['id'],
                        'column_id': response.data[0]['id'],
                        'value': db_column_data['default_value'],
                        'created_at': now,
                        'updated_at': now
                    } for record in records_response.data]
                    
                    if values_data:
                        client.table('custom_column_values').insert(values_data).execute()
            except Exception as e:
                print(f"Warning: Failed to apply default values: {str(e)}")
                # Don't fail the request if applying defaults fails
            
        print("Successfully created custom column")
        return jsonify({'success': True, 'data': response_data}), 201
    except Exception as e:
        print(f"\nError creating custom column: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/custom-columns/<column_id>', methods=['PUT'])
def update_custom_column(column_id):
    """Update a custom column."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        print("Received update data:", data)  # Debug log
        
        update_data = {
            'name': data.get('name'),
            'type': data.get('type'),
            'options': data.get('options'),
            'option_colors': data.get('option_colors'),  # Add option_colors
            'default_value': data.get('defaultValue'),
            'apply_to_all': data.get('applyToAll'),
            'updated_at': datetime.utcnow().isoformat()
        }
        # Remove None values
        update_data = {k: v for k, v in update_data.items() if v is not None}
        
        print("Processed update data:", update_data)  # Debug log
        
        client = get_supabase_client()
        response = client.table('custom_columns').update(update_data).eq('id', column_id).eq('user_id', user_id).execute()
        
        print("Supabase response:", response.data)  # Debug log
        
        if not response.data:
            return jsonify({'success': False, 'error': 'Column not found'}), 404
        
        # If apply_to_all is true and there's a default value, apply it to all records
        if update_data.get('apply_to_all') and update_data.get('default_value') is not None:
            try:
                # Get all records for the user
                records_response = client.table('vinyl_records').select('id').eq('user_id', user_id).execute()
                if records_response.data:
                    now = datetime.utcnow().isoformat()
                    # Create or update custom values for each record
                    for record in records_response.data:
                        client.table('custom_column_values').upsert({
                            'record_id': record['id'],
                            'column_id': column_id,
                            'value': update_data['default_value'],
                            'updated_at': now
                        }).execute()
            except Exception as e:
                print(f"Warning: Failed to apply default values: {str(e)}")
                # Don't fail the request if applying defaults fails
            
        return jsonify({'success': True, 'data': response.data[0]}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/custom-columns/<column_id>', methods=['DELETE'])
def delete_custom_column(column_id):
    """Delete a custom column."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    
    try:
        client = get_supabase_client()
        response = client.table('custom_columns').delete().eq('id', column_id).eq('user_id', user_id).execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/records/<record_id>/custom-values', methods=['GET'])
def get_custom_values(record_id):
    """Get all custom values for a record."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    
    try:
        client = get_supabase_client()
        response = client.table('custom_column_values').select('*').eq('record_id', record_id).execute()
        return jsonify({'success': True, 'data': response.data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/records/<record_id>/custom-values', methods=['PUT'])
def update_custom_values(record_id):
    """Update custom values for a record."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    
    try:
        values = request.get_json()
        if not isinstance(values, dict):
            return jsonify({'success': False, 'error': 'Invalid data format'}), 400
        
        client = get_supabase_client()
        
        # Get existing values
        existing = client.table('custom_column_values').select('*').eq('record_id', record_id).execute()
        existing_map = {v['column_id']: v for v in existing.data}
        
        results = []
        for column_id, value in values.items():
            if column_id in existing_map:
                # Update existing value
                response = client.table('custom_column_values').update({
                    'value': value,
                    'updated_at': datetime.utcnow().isoformat()
                }).eq('record_id', record_id).eq('column_id', column_id).execute()
            else:
                # Insert new value
                response = client.table('custom_column_values').insert({
                    'record_id': record_id,
                    'column_id': column_id,
                    'value': value,
                    'created_at': datetime.utcnow().isoformat(),
                    'updated_at': datetime.utcnow().isoformat()
                }).execute()
            
            if response.data:
                results.extend(response.data)
        
        return jsonify({'success': True, 'data': results}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/lookup/discogs/<release_id>')
def lookup_discogs(release_id):
    """Look up a release by Discogs release ID."""
    try:
        print(f"\n=== Looking up Discogs release ID: {release_id} ===")
        result = search_by_discogs_id(release_id)
        print(f"Search result: {result}")
        
        if not result:
            return jsonify({
                'success': False,
                'message': 'No results found'
            })
            
        return jsonify(result)  # result already contains success and data fields with added_from
        
    except Exception as e:
        print(f"Error looking up Discogs release: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/lookup/discogs-url')
def lookup_discogs_url():
    """Look up a release by Discogs URL"""
    try:
        url = request.args.get('url')
        if not url:
            return jsonify({
                'success': False,
                'message': 'No URL provided'
            })
            
        result = search_by_discogs_url(url)
        if result and result.get('success'):
            # Ensure current_release fields are null for discogs_url method
            if result.get('data'):
                result['data']['current_release_url'] = None
                result['data']['current_release_year'] = None
                # Make sure country is included in the response
                if 'country' in result['data']:
                    result['data']['country'] = result['data']['country']
            return jsonify(result)
        else:
            return jsonify({
                'success': False,
                'message': 'No results found'
            })
            
    except Exception as e:
        print(f"Error looking up Discogs URL: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/lookup/artist-album')
def lookup_artist_album():
    """Look up a release by artist and album name"""
    try:
        artist = request.args.get('artist')
        album = request.args.get('album')
        
        if not artist or not album:
            return jsonify({
                'success': False,
                'error': 'Artist and album names are required'
            })
            
        result = search_by_artist_album(artist, album, source='discogs_url')
        if result and result.get('success'):
            # Ensure current_release fields are null for artist-album lookup
            if result.get('data'):
                result['data']['current_release_url'] = None
                result['data']['current_release_year'] = None
            return jsonify(result)
        else:
            # If no match was found, return a basic structure for manual entry
            return jsonify({
                'success': True,
                'data': {
                    'artist': artist,
                    'album': album,
                    'added_from': 'manual',
                    'genres': [],
                    'styles': [],
                    'musicians': [],
                    'current_release_url': None,
                    'current_release_year': None
                }
            })
            
    except Exception as e:
        print(f"Error looking up by artist/album: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Add Spotify endpoints
@app.route('/api/spotify/auth')
def spotify_auth():
    """Start Spotify OAuth flow"""
    print("\n=== Starting Spotify Auth ===")
    print(f"Session before: {dict(session)}")
    
    result = get_spotify_auth_url()
    print(f"Got auth URL result: {result}")
    
    # Since get_spotify_auth_url returns a Response object, we can just return it directly
    return result

@app.route('/api/spotify/callback')
def spotify_callback():
    """Handle Spotify OAuth callback"""
    error = request.args.get('error')
    if error:
        return jsonify({
            'success': False,
            'error': f'Spotify auth error: {error}'
        })

    code = request.args.get('code')
    if not code:
        return jsonify({
            'success': False,
            'error': 'No authorization code received'
        })

    result = handle_spotify_callback(code)
    if result['success']:
        return redirect('/collection')
    else:
        return jsonify(result)

@app.route('/api/spotify/playlists')
def spotify_playlists():
    """Get user's Spotify playlists"""
    print("\n=== Getting Spotify Playlists ===")
    print(f"Session data: {dict(session)}")
    
    # Check for Spotify authentication
    if 'spotify_access_token' not in session:
        print("No Spotify access token in session")
        return jsonify({
            'success': False,
            'needs_auth': True,
            'error': 'Not authenticated with Spotify'
        })

    # Try to get playlists
    try:
        result = get_spotify_playlists()
        if not result['success'] and result.get('needs_auth'):
            # Clear invalid tokens if authentication failed
            session.pop('spotify_access_token', None)
            session.pop('spotify_refresh_token', None)
            session.modified = True
        return jsonify(result)
    except Exception as e:
        print(f"Error getting playlists: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get playlists',
            'needs_auth': True
        })

@app.route('/api/spotify/playlists/<playlist_id>/tracks')
def spotify_playlist_tracks(playlist_id):
    """Get tracks from a specific playlist"""
    print(f"\n=== Getting Playlist Tracks: {playlist_id} ===")
    print(f"Session data: {dict(session)}")
    
    # Check for Spotify authentication
    if 'spotify_access_token' not in session:
        print("No Spotify access token in session")
        return jsonify({
            'success': False,
            'needs_auth': True,
            'error': 'Not authenticated with Spotify'
        })

    # Try to get playlist tracks
    try:
        result = get_playlist_tracks(playlist_id)
        if not result['success'] and result.get('needs_auth'):
            # Clear invalid tokens if authentication failed
            session.pop('spotify_access_token', None)
            session.pop('spotify_refresh_token', None)
            session.modified = True
        return jsonify(result)
    except Exception as e:
        print(f"Error getting playlist tracks: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get playlist tracks',
            'needs_auth': True
        })

@app.route('/api/spotify/album-from-url')
def spotify_album_from_url():
    """Get album information from a Spotify URL"""
    print("\n=== Getting Album from Spotify URL ===")
    print(f"Session data: {dict(session)}")
    
    url = request.args.get('url')
    if not url:
        return jsonify({
            'success': False,
            'error': 'No URL provided'
        })
        
    result = get_album_from_url(url)
    if result.get('success') and result.get('data'):
        # Ensure current_release fields are null for Spotify URL lookup
        result['data']['current_release_url'] = None
        result['data']['current_release_year'] = None
    return jsonify(result)

@app.route('/api/spotify/disconnect', methods=['POST'])
def spotify_disconnect():
    """Disconnect Spotify integration by clearing tokens"""
    print("\n=== Disconnecting Spotify ===")
    print(f"Session before: {dict(session)}")
    
    # Clear Spotify-related session data
    session.pop('spotify_access_token', None)
    session.pop('spotify_refresh_token', None)
    session.pop('spotify_token_type', None)
    session.pop('spotify_auth_started', None)
    session.modified = True
    
    print(f"Session after: {dict(session)}")
    
    return jsonify({
        'success': True,
        'message': 'Spotify disconnected successfully'
    })

@app.route('/api/spotify/playlist/subscribe', methods=['POST'])
@require_auth
def subscribe_playlist():
    """Subscribe to a Spotify playlist for automatic album imports"""
    try:
        data = request.get_json()
        if not data or 'playlist_id' not in data or 'playlist_name' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing playlist_id or playlist_name'
            }), 400
            
        result = subscribe_to_playlist(
            data['playlist_id'],
            data['playlist_name']
        )
        return jsonify(result)
    except Exception as e:
        print(f"Error subscribing to playlist: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to subscribe to playlist'
        }), 500

@app.route('/api/spotify/playlist/unsubscribe', methods=['POST'])
@require_auth
def unsubscribe_playlist():
    """Unsubscribe from the current Spotify playlist"""
    try:
        result = unsubscribe_from_playlist()
        return jsonify(result)
    except Exception as e:
        print(f"Error unsubscribing from playlist: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to unsubscribe from playlist'
        }), 500

@app.route('/api/spotify/playlist/subscription', methods=['GET'])
@require_auth
def get_playlist_subscription():
    """Get the currently subscribed playlist"""
    try:
        result = get_subscribed_playlist()
        return jsonify(result)
    except Exception as e:
        print(f"Error getting playlist subscription: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get playlist subscription'
        }), 500

@app.route('/api/spotify/playlist/sync', methods=['POST'])
@require_auth
def sync_playlists():
    """Manually trigger playlist sync"""
    try:
        result = sync_subscribed_playlists()
        return jsonify(result)
    except Exception as e:
        print(f"Error syncing playlists: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to sync playlists'
        }), 500

# Add new endpoint for automated sync
@app.route('/api/spotify/playlist/sync', methods=['POST'])
def automated_sync_playlists():
    """Automated playlist sync triggered by cron job"""
    # Verify sync key
    sync_key = request.headers.get('X-Sync-Key')
    if not sync_key or sync_key != os.getenv('SYNC_SECRET_KEY'):
        return jsonify({
            'success': False,
            'error': 'Unauthorized'
        }), 401

    try:
        result = sync_subscribed_playlists(is_automated=True)  # Pass flag to indicate automated sync
        return jsonify(result)
    except Exception as e:
        print(f"Error in automated playlist sync: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to sync playlists'
        }), 500

# Add session debug middleware
@app.before_request
def debug_session():
    """Debug session state before each request."""
    print("\n=== Session Debug ===")
    print(f"Endpoint: {request.endpoint}")
    print(f"Method: {request.method}")
    print(f"Session data: {dict(session)}")
    print(f"User ID in session: {session.get('user_id')}")
    print(f"Request cookies: {request.cookies}")
    print(f"Session cookie domain: {app.config.get('SESSION_COOKIE_DOMAIN')}")

@app.route('/api/column-filters', methods=['GET'])
@require_auth
def get_column_filters():
    """Get user's column filter preferences."""
    try:
        client = get_supabase_client()
        response = client.table('column_filters').select('*').eq(
            'user_id', session['user_id']
        ).execute()
        
        if response.data:
            # Convert to column_id: filter_value format
            filters = {
                item['column_id']: item['filter_value'] 
                for item in response.data
            }
            return jsonify({
                'success': True,
                'data': filters
            })
        return jsonify({
            'success': True,
            'data': {}
        })
    except Exception as e:
        print(f"Error fetching filters: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/column-filters', methods=['PUT'])
@require_auth
def update_column_filters():
    """Update user's column filter preferences."""
    try:
        filters = request.get_json()
        client = get_supabase_client()
        
        # Delete existing filters
        client.table('column_filters').delete().eq(
            'user_id', session['user_id']
        ).execute()
        
        # Insert new filters
        if filters:
            records = [
                {
                    'user_id': session['user_id'],
                    'column_id': col_id,
                    'filter_value': value
                }
                for col_id, value in filters.items()
                if value is not None  # Only store non-null filters
            ]
            if records:
                client.table('column_filters').insert(records).execute()
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error updating filters: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Add a new API endpoint to refresh token
@app.route('/api/auth/refresh', methods=['POST'])
def refresh_auth_token():
    """Refresh the authentication token"""
    try:
        refresh_token = session.get('refresh_token')
        if not refresh_token:
            return jsonify({
                'success': False,
                'error': 'No refresh token available'
            }), 401
            
        result = refresh_session_token(refresh_token)
        if result['success']:
            # Update session with new tokens
            session['access_token'] = result['access_token']
            session['refresh_token'] = result['refresh_token']
            session.modified = True
            
            return jsonify({
                'success': True,
                'message': 'Token refreshed successfully'
            })
        else:
            # If refresh fails, clear session
            session.pop('user_id', None)
            session.pop('access_token', None) 
            session.pop('refresh_token', None)
            session.modified = True
            
            return jsonify({
                'success': False,
                'error': 'Failed to refresh token'
            }), 401
    except Exception as e:
        print(f"Error refreshing token: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Server error'
        }), 500

if __name__ == '__main__':
    is_production = os.getenv('FLASK_ENV') == 'production'
    port = int(os.environ.get('PORT', 10000))

    if is_production:
        import gunicorn.app.base

        class StandaloneApplication(gunicorn.app.base.BaseApplication):
            def __init__(self, app, options=None):
                self.options = options or {}
                self.application = app
                super().__init__()

            def load_config(self):
                for key, value in self.options.items():
                    self.cfg.set(key.lower(), value)

            def load(self):
                return self.application

        options = {
            'bind': f'0.0.0.0:{port}',
            'workers': 4,
            'accesslog': '-',
            'errorlog': '-',
            'capture_output': True,
            'worker_class': 'sync'
        }

        StandaloneApplication(app, options).run()
    else:
        print("\nStarting development server...")
        print(f"Environment: {os.getenv('FLASK_ENV')}")
        print(f"Debug mode: True")
        print(f"Supabase URL: {os.getenv('SUPABASE_URL')}")
        
        print(f"\nServer will be available on port {port}")
        print("Press Ctrl+C to stop the server")
        
        app.run(
            debug=True,
            host='0.0.0.0',
            port=port
        ) 

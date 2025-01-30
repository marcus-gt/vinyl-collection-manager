import os
from pathlib import Path
from dotenv import load_dotenv
from datetime import timedelta

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
from discogs_lookup import search_by_barcode
from .db import (
    create_user,
    login_user,
    add_record_to_collection,
    get_user_collection,
    remove_record_from_collection,
    update_record_notes
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

# Configure CORS with dynamic origin
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

# Set session configuration based on environment
if os.getenv('FLASK_ENV') == 'production':
    session_config = {
        'SESSION_COOKIE_SECURE': True,
        'SESSION_COOKIE_HTTPONLY': True,
        'SESSION_COOKIE_SAMESITE': 'Lax',
        'SESSION_COOKIE_DOMAIN': 'vinyl-collection-manager.onrender.com',
        'SESSION_COOKIE_PATH': '/',
        'PERMANENT_SESSION_LIFETIME': timedelta(days=7),
        'SESSION_PROTECTION': 'strong',
        'SESSION_COOKIE_NAME': 'session',
        'SESSION_REFRESH_EACH_REQUEST': True
    }
else:
    session_config = {
        'SESSION_COOKIE_SECURE': True,
        'SESSION_COOKIE_HTTPONLY': True,
        'SESSION_COOKIE_SAMESITE': 'Lax',
        'SESSION_COOKIE_PATH': '/',
        'PERMANENT_SESSION_LIFETIME': timedelta(days=7),
        'SESSION_PROTECTION': 'strong',
        'SESSION_COOKIE_NAME': 'session',
        'SESSION_REFRESH_EACH_REQUEST': True
    }

app.config.update(**session_config)

print("\n=== Session Configuration ===")
print(f"SESSION_COOKIE_DOMAIN: {app.config.get('SESSION_COOKIE_DOMAIN', 'Not set - using request host')}")
print(f"SESSION_COOKIE_SECURE: {app.config['SESSION_COOKIE_SECURE']}")
print(f"SESSION_COOKIE_SAMESITE: {app.config['SESSION_COOKIE_SAMESITE']}")

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
        
    # Check if user is authenticated
    if 'user_id' in session:
        print("User is authenticated in session")
        
    # Debug session configuration
    print("\n=== Session Configuration ===")
    print(f"SESSION_COOKIE_DOMAIN: {app.config.get('SESSION_COOKIE_DOMAIN')}")
    print(f"SESSION_COOKIE_SECURE: {app.config.get('SESSION_COOKIE_SECURE')}")
    print(f"SESSION_COOKIE_SAMESITE: {app.config.get('SESSION_COOKIE_SAMESITE')}")
    print(f"SESSION_COOKIE_PATH: {app.config.get('SESSION_COOKIE_PATH')}")
    print(f"SESSION_COOKIE_NAME: {app.config.get('SESSION_COOKIE_NAME')}")

@app.after_request
def after_request(response):
    """Modify response headers for CORS and security."""
    origin = request.headers.get('Origin')
    if origin in allowed_origins:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        response.headers['Access-Control-Expose-Headers'] = 'Set-Cookie'
        
        # Add security headers
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        
        # Debug response
        print("\n=== Response Debug ===")
        print(f"Response headers: {dict(response.headers)}")
        print(f"Response status: {response.status}")
        print(f"Current session after: {dict(session)}")
        
        if 'Set-Cookie' in response.headers:
            print(f"Set-Cookie header: {response.headers['Set-Cookie']}")
    
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
                'musicians': result.get('musicians')
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
    print(f"Request Origin: {request.headers.get('Origin')}")
    
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    
    if not email or not password:
        print("Error: Missing email or password")
        return jsonify({'success': False, 'error': 'Email and password required'}), 400
    
    result = login_user(email, password)
    print(f"Login result: {result}")
    
    if result['success']:
        # Clear any existing session data
        session.clear()
        
        # Set new session data
        session['user_id'] = result['session'].user.id
        session['access_token'] = result['session'].access_token
        session['refresh_token'] = result['session'].refresh_token
        session.permanent = True
        
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
        
        print(f"Session after login: {dict(session)}")
        print(f"Response Headers: {dict(response.headers)}")
        return response, 200
        
    return jsonify({'success': False, 'error': result['error']}), 401

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Logout the current user."""
    session.clear()
    return jsonify({'success': True}), 200

@app.route('/api/auth/me', methods=['GET'])
def get_current_user():
    """Get the current authenticated user."""
    print("\n=== Checking Current User ===")
    print(f"Session data: {dict(session)}")
    
    user_id = session.get('user_id')
    access_token = session.get('access_token')
    
    if not user_id or not access_token:
        print("No authenticated user found in session")
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    
    # Get user email from JWT token
    try:
        import jwt
        decoded = jwt.decode(access_token, options={"verify_signature": False})
        email = decoded.get('email', 'unknown@email.com')
    except Exception as e:
        print(f"Error decoding JWT: {e}")
        email = 'unknown@email.com'
    
    # Return the current user's information
    return jsonify({
        'success': True,
        'user': {
            'id': user_id,
            'email': email,
            'access_token': access_token
        }
    }), 200

@app.route('/api/records', methods=['GET'])
def get_records():
    """Get all records for the current user."""
    print("\n=== Getting User Records ===")
    user_id = session.get('user_id')
    print(f"User ID from session: {user_id}")
    
    if not user_id:
        print("Error: Not authenticated")
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    
    result = get_user_collection(user_id)
    print(f"Get records result: {result}")
    
    if result['success']:
        return jsonify({'success': True, 'data': result['records']}), 200
    return jsonify({'success': False, 'error': result['error']}), 400

@app.route('/api/records', methods=['POST'])
def add_record():
    """Add a new record to the user's collection."""
    print("\n=== Adding Record to Collection ===")
    user_id = session.get('user_id')
    print(f"User ID from session: {user_id}")
    
    if not user_id:
        print("Error: User not authenticated")
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    
    try:
        record_data = request.get_json()
        print(f"Raw request data: {request.data}")
        print(f"Parsed record data: {record_data}")
        
        if not record_data:
            print("Error: No record data provided")
            return jsonify({'success': False, 'error': 'Record data required'}), 400
        
        # Log the record data before adding
        print("\nRecord data to be added:")
        for key, value in record_data.items():
            print(f"{key}: {type(value).__name__} = {value}")
        
        # Ensure required fields are present
        required_fields = ['artist', 'album']
        missing_fields = [field for field in required_fields if not record_data.get(field)]
        if missing_fields:
            error_msg = f"Missing required fields: {', '.join(missing_fields)}"
            print(f"Error: {error_msg}")
            return jsonify({'success': False, 'error': error_msg}), 400
        
        # Validate data types
        if not isinstance(record_data.get('genres', []), list):
            print("Error: genres must be a list")
            return jsonify({'success': False, 'error': 'genres must be a list'}), 400
            
        if not isinstance(record_data.get('styles', []), list):
            print("Error: styles must be a list")
            return jsonify({'success': False, 'error': 'styles must be a list'}), 400
            
        if not isinstance(record_data.get('musicians', []), list):
            print("Error: musicians must be a list")
            return jsonify({'success': False, 'error': 'musicians must be a list'}), 400
        
        result = add_record_to_collection(user_id, record_data)
        print(f"\nAdd record result: {result}")
        
        if result['success']:
            print("\nSuccessfully added record:")
            print(f"Record ID: {result['record'].get('id')}")
            return jsonify({'success': True, 'record': result['record']}), 201
            
        print(f"\nFailed to add record: {result['error']}")
        return jsonify({'success': False, 'error': result['error']}), 400
    except Exception as e:
        print(f"\nError adding record: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Failed to add record: {str(e)}'}), 500

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

@app.route('/api/records/<record_id>/notes', methods=['PUT'])
def update_notes(record_id):
    """Update notes for a record."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    
    data = request.get_json()
    notes = data.get('notes')
    if notes is None:
        return jsonify({'success': False, 'error': 'Notes required'}), 400
    
    result = update_record_notes(user_id, record_id, notes)
    if result['success']:
        return jsonify({'success': True, 'record': result['record']}), 200
    return jsonify({'success': False, 'error': result['error']}), 400

@app.route('/api/lookup/barcode/<barcode>', methods=['GET'])
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
            
            if result:
                # Found a match, process it
                record = {
                    'artist': result.get('artist', 'Unknown Artist'),
                    'album': result.get('album'),
                    'year': result.get('year'),
                    'release_year': result.get('release_year'),
                    'barcode': barcode,
                    'genres': result.get('genres', []),
                    'styles': result.get('styles', []),
                    'musicians': result.get('musicians', []),
                    'master_url': result.get('master_url'),
                    'release_url': result.get('main_release_url'),
                    'label': result.get('label')
                }
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

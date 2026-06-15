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

# parent_dir on sys.path so blueprints can import the top-level discogs_lookup module
sys.path.append(parent_dir)
from barcode_scanner.extensions import limiter
from barcode_scanner.auth_utils import check_token_expiration

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

# Bind the shared rate limiter (defined in extensions.py) to this app. It
# protects the unauthenticated public Discogs lookup endpoints from abuse;
# authenticated requests are exempted so bulk/batch imports are never throttled.
limiter.init_app(app)

# Register blueprints (route groups extracted from this module).
from barcode_scanner.blueprints.auth import bp as auth_bp
from barcode_scanner.blueprints.lookup import bp as lookup_bp
from barcode_scanner.blueprints.records import bp as records_bp
from barcode_scanner.blueprints.custom import bp as custom_bp
from barcode_scanner.blueprints.spotify import bp as spotify_bp
from barcode_scanner.blueprints.analytics import bp as analytics_bp
app.register_blueprint(auth_bp)
app.register_blueprint(lookup_bp)
app.register_blueprint(records_bp)
app.register_blueprint(custom_bp)
app.register_blueprint(spotify_bp)
app.register_blueprint(analytics_bp)

# Add session configuration
print("\n=== Flask Configuration ===")
print(f"FLASK_ENV: {os.getenv('FLASK_ENV')}")
print(f"Running in {'production' if os.getenv('FLASK_ENV') == 'production' else 'development'} mode")

# Update session configuration with much longer lifetime
# In development, use less strict settings to work with HTTP
if os.getenv('FLASK_ENV') == 'production':
    session_config = {
        'SESSION_COOKIE_SECURE': True,
        'SESSION_COOKIE_HTTPONLY': True,
        'SESSION_COOKIE_SAMESITE': 'None',
        'SESSION_COOKIE_PATH': '/',
        'PERMANENT_SESSION_LIFETIME': timedelta(days=30),  # Sliding 30-day expiry
        'SESSION_REFRESH_EACH_REQUEST': True,
        'SESSION_COOKIE_DOMAIN': 'vinyl-collection-manager.onrender.com',
        'SESSION_COOKIE_NAME': 'session',
        'REMEMBER_COOKIE_SECURE': True,
        'REMEMBER_COOKIE_HTTPONLY': True,
        'REMEMBER_COOKIE_SAMESITE': 'None',
        'REMEMBER_COOKIE_DOMAIN': 'vinyl-collection-manager.onrender.com'
    }
else:
    # Development mode - allow cookies over HTTP
    session_config = {
        'SESSION_COOKIE_SECURE': False,  # Allow HTTP in development
        'SESSION_COOKIE_HTTPONLY': True,
        'SESSION_COOKIE_SAMESITE': 'Lax',  # More permissive for local development
        'SESSION_COOKIE_PATH': '/',
        'PERMANENT_SESSION_LIFETIME': timedelta(days=30),
        'SESSION_REFRESH_EACH_REQUEST': True
    }

app.config.update(**session_config)

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


@app.before_request
def before_request():
    """Ensure session is configured and refresh the access token if needed."""
    # Ensure session is permanent
    if not session.get('_permanent'):
        session.permanent = True

    # Check and refresh token if needed
    if 'user_id' in session and request.method != 'OPTIONS':
        check_token_expiration()

@app.after_request
def after_request(response):
    """Modify response headers for CORS and security."""
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
                'Max-Age=2592000'  # 30 days, matches PERMANENT_SESSION_LIFETIME
            ]
            response.headers['Set-Cookie'] = '; '.join(cookie_parts)
    
    # Add security headers
    response.headers.update({
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN'
    })
    
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

# Frontend routes - these must be before API routes
@app.route('/')
@app.route('/login')
@app.route('/register')
@app.route('/collection')
@app.route('/scanner')
def serve_spa():
    """Serve the SPA for known frontend routes."""
    return send_from_directory(app.static_folder, 'index.html')

# Static files route
@app.route('/<path:filename>')
def serve_static(filename):
    """Serve a static file, falling back to the SPA index for client-side routes."""
    if filename.startswith('api/'):
        return app.send_static_file(filename)

    try:
        full_path = os.path.join(app.static_folder, filename)
        if os.path.exists(full_path):
            return send_from_directory(app.static_folder, filename)
    except Exception as e:
        print(f"Error serving static file {filename}: {str(e)}")

    return send_from_directory(app.static_folder, 'index.html')

# API routes first (keep all existing API routes as they are)
@app.route('/api')
def api_index():
    """Test endpoint to verify server is running."""
    return jsonify({
        'status': 'ok',
        'message': 'Server is running'
    })

if __name__ == '__main__':
    # This entrypoint runs the Flask development server (used by start_server.sh
    # via `python -m barcode_scanner.server`). In production, Render runs the app
    # through the gunicorn CLI (`gunicorn ... barcode_scanner.server:app`), so the
    # __main__ block is never executed there.
    port = int(os.environ.get('PORT', 3000))
    print(f"\nStarting development server on port {port} (FLASK_ENV={os.getenv('FLASK_ENV')})")
    print("Press Ctrl+C to stop the server")

    app.run(
        debug=True,
        host='0.0.0.0',
        port=port
    )


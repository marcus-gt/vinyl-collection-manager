import os
import base64
import json
import requests
from urllib.parse import urlencode
from flask import session, redirect, request, jsonify
from functools import wraps

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1"

# Debug environment variables
print("\n=== Spotify Configuration ===")
print(f"Environment variables:")
print(f"SPOTIFY_CLIENT_ID: {os.getenv('SPOTIFY_CLIENT_ID')}")
print(f"SPOTIFY_CLIENT_SECRET: {'Present' if os.getenv('SPOTIFY_CLIENT_SECRET') else 'Missing'}")
print(f"SPOTIFY_REDIRECT_URI: {os.getenv('SPOTIFY_REDIRECT_URI')}")

# Load and validate configuration
CLIENT_ID = os.getenv('SPOTIFY_CLIENT_ID')
CLIENT_SECRET = os.getenv('SPOTIFY_CLIENT_SECRET')
REDIRECT_URI = os.getenv('SPOTIFY_REDIRECT_URI')

if not all([CLIENT_ID, CLIENT_SECRET, REDIRECT_URI]):
    print("\nWARNING: Missing Spotify configuration!")
    print(f"CLIENT_ID: {'Present' if CLIENT_ID else 'Missing'}")
    print(f"CLIENT_SECRET: {'Present' if CLIENT_SECRET else 'Missing'}")
    print(f"REDIRECT_URI: {REDIRECT_URI}")

def require_spotify_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        print("\n=== Checking Spotify Auth ===")
        print(f"Session data: {dict(session)}")
        
        if 'spotify_access_token' not in session:
            print("No Spotify access token in session")
            session.modified = True
            return jsonify({
                'success': False,
                'error': 'Not authenticated with Spotify',
                'needs_auth': True
            }), 401
            
        # Check if token is expired
        try:
            headers = {
                'Authorization': f"Bearer {session['spotify_access_token']}"
            }
            response = requests.get(f"{SPOTIFY_API_BASE_URL}/me", headers=headers)
            
            if response.status_code == 401:
                print("Token expired, attempting refresh")
                refresh_result = refresh_spotify_token()
                if not refresh_result['success']:
                    print("Token refresh failed")
                    # Clear invalid tokens
                    session.pop('spotify_access_token', None)
                    session.pop('spotify_refresh_token', None)
                    session.modified = True
                    return jsonify({
                        'success': False,
                        'error': 'Not authenticated with Spotify',
                        'needs_auth': True
                    }), 401
                print("Token refreshed successfully")
            
        except Exception as e:
            print(f"Error checking token: {str(e)}")
            session.modified = True
            return jsonify({
                'success': False,
                'error': 'Failed to validate Spotify session',
                'needs_auth': True
            }), 401
            
        return f(*args, **kwargs)
    return decorated_function

def get_spotify_auth_url():
    """Generate the Spotify authorization URL"""
    print("\n=== Generating Spotify Auth URL ===")
    print(f"Using configuration:")
    print(f"CLIENT_ID: {CLIENT_ID}")
    print(f"REDIRECT_URI: {REDIRECT_URI}")
    
    try:
        if not CLIENT_ID:
            print("Error: Missing CLIENT_ID")
            return jsonify({
                'success': False,
                'error': 'Spotify CLIENT_ID is missing'
            })

        if not REDIRECT_URI:
            print("Error: Missing REDIRECT_URI")
            return jsonify({
                'success': False,
                'error': 'Spotify REDIRECT_URI is missing'
            })

        # Ensure REDIRECT_URI is a string and not None
        if REDIRECT_URI == 'None' or not isinstance(REDIRECT_URI, str):
            print(f"Error: Invalid REDIRECT_URI: {REDIRECT_URI}")
            return jsonify({
                'success': False,
                'error': 'Invalid redirect URI configuration'
            })

        params = {
            'client_id': CLIENT_ID,
            'response_type': 'code',
            'redirect_uri': REDIRECT_URI,
            'scope': 'playlist-read-private playlist-read-collaborative user-library-read',
            'show_dialog': True
        }
        
        auth_url = f"{SPOTIFY_AUTH_URL}?{urlencode(params)}"
        print(f"Generated Spotify auth URL: {auth_url}")
        
        # Set spotify_auth_started in session
        session['spotify_auth_started'] = True
        session.modified = True
        print(f"Session after setting spotify_auth_started: {dict(session)}")
        
        # Return the response directly
        response = jsonify({
            'success': True,
            'data': {
                'auth_url': auth_url
            }
        })
        
        # Ensure cookie settings
        if 'Set-Cookie' in response.headers:
            cookie = response.headers['Set-Cookie']
            if 'SameSite=' not in cookie:
                cookie += '; SameSite=None'
            if 'Secure' not in cookie:
                cookie += '; Secure'
            if 'HttpOnly' not in cookie:
                cookie += '; HttpOnly'
            response.headers['Set-Cookie'] = cookie
            
        return response
        
    except Exception as e:
        print(f"Error generating Spotify auth URL: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Failed to generate Spotify auth URL: {str(e)}'
        })

def handle_spotify_callback(code):
    """Handle the Spotify OAuth callback"""
    print("\n=== Handling Spotify Callback ===")
    print(f"Code received: {code[:10]}...")
    print(f"Using redirect URI: {REDIRECT_URI}")
    
    if not CLIENT_ID or not CLIENT_SECRET or not REDIRECT_URI:
        print("Error: Missing Spotify configuration")
        return {'success': False, 'error': 'Spotify configuration missing'}

    auth_header = base64.b64encode(
        f"{CLIENT_ID}:{CLIENT_SECRET}".encode()
    ).decode()

    headers = {
        'Authorization': f'Basic {auth_header}',
        'Content-Type': 'application/x-www-form-urlencoded'
    }

    data = {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': REDIRECT_URI
    }

    try:
        print("Making token request to Spotify...")
        response = requests.post(SPOTIFY_TOKEN_URL, headers=headers, data=data)
        print(f"Token response status: {response.status_code}")
        response.raise_for_status()
        token_info = response.json()
        
        print("Got token response from Spotify")
        
        # Store token info in session with explicit names
        session['spotify_access_token'] = token_info['access_token']
        session['spotify_refresh_token'] = token_info.get('refresh_token')
        session['spotify_token_type'] = token_info.get('token_type', 'Bearer')
        session.modified = True
        
        print("Stored Spotify tokens in session")
        print(f"Session data: {dict(session)}")
        
        return {'success': True}
    except requests.exceptions.RequestException as e:
        print(f"Error getting Spotify token: {str(e)}")
        if hasattr(e.response, 'text'):
            print(f"Error response: {e.response.text}")
        return {'success': False, 'error': 'Failed to authenticate with Spotify'}

def refresh_spotify_token():
    """Refresh the Spotify access token"""
    print("\n=== Refreshing Spotify Token ===")
    print(f"Session before refresh: {dict(session)}")
    
    if 'spotify_refresh_token' not in session:
        print("No Spotify refresh token in session")
        return {'success': False, 'error': 'No refresh token available'}

    auth_header = base64.b64encode(
        f"{CLIENT_ID}:{CLIENT_SECRET}".encode()
    ).decode()

    headers = {
        'Authorization': f'Basic {auth_header}',
        'Content-Type': 'application/x-www-form-urlencoded'
    }

    data = {
        'grant_type': 'refresh_token',
        'refresh_token': session['spotify_refresh_token']
    }

    try:
        response = requests.post(SPOTIFY_TOKEN_URL, headers=headers, data=data)
        response.raise_for_status()
        token_info = response.json()
        
        print("Got new token from Spotify")
        
        # Update token in session with explicit names
        session['spotify_access_token'] = token_info['access_token']
        if 'refresh_token' in token_info:
            session['spotify_refresh_token'] = token_info['refresh_token']
        session.modified = True
        
        print(f"Session after refresh: {dict(session)}")
        
        return {'success': True}
    except requests.exceptions.RequestException as e:
        print(f"Error refreshing token: {str(e)}")
        # Clear invalid tokens
        session.pop('spotify_access_token', None)
        session.pop('spotify_refresh_token', None)
        session.modified = True
        return {'success': False, 'error': 'Failed to refresh token'}

def get_spotify_playlists():
    """Get user's Spotify playlists"""
    print("\n=== Getting Spotify Playlists ===")
    print(f"Session data: {dict(session)}")
    
    if 'spotify_access_token' not in session:
        print("No Spotify access token in session")
        session.modified = True
        return {
            'success': False,
            'error': 'Not authenticated with Spotify',
            'needs_auth': True
        }

    headers = {
        'Authorization': f"Bearer {session['spotify_access_token']}"
    }

    try:
        print("Making request to Spotify API...")
        response = requests.get(f"{SPOTIFY_API_BASE_URL}/me/playlists", headers=headers)
        
        # If token expired, try to refresh it
        if response.status_code == 401:
            print("Token expired, attempting refresh")
            refresh_result = refresh_spotify_token()
            if not refresh_result['success']:
                print("Token refresh failed")
                session.modified = True
                return {
                    'success': False,
                    'error': 'Not authenticated with Spotify',
                    'needs_auth': True
                }
            
            # Retry with new token
            print("Retrying with new token")
            headers['Authorization'] = f"Bearer {session['spotify_access_token']}"
            response = requests.get(f"{SPOTIFY_API_BASE_URL}/me/playlists", headers=headers)
        
        response.raise_for_status()
        playlists = response.json()
        
        print(f"Got {len(playlists['items'])} playlists")
        session.modified = True
        
        return {
            'success': True,
            'data': [{
                'id': playlist['id'],
                'name': playlist['name'],
                'tracks': playlist['tracks']['total']
            } for playlist in playlists['items']]
        }
    except requests.exceptions.RequestException as e:
        print(f"Error getting playlists: {str(e)}")
        if isinstance(e, requests.exceptions.HTTPError) and e.response.status_code == 401:
            # Clear invalid tokens
            session.pop('spotify_access_token', None)
            session.pop('spotify_refresh_token', None)
            session.modified = True
            return {
                'success': False,
                'error': 'Not authenticated with Spotify',
                'needs_auth': True
            }
        return {'success': False, 'error': 'Failed to get playlists', 'needs_auth': True}

def get_playlist_tracks(playlist_id):
    """Get tracks from a specific playlist"""
    if 'spotify_access_token' not in session:
        return {'success': False, 'error': 'Not authenticated with Spotify', 'needs_auth': True}

    headers = {
        'Authorization': f"Bearer {session['spotify_access_token']}"
    }

    try:
        response = requests.get(
            f"{SPOTIFY_API_BASE_URL}/playlists/{playlist_id}/tracks",
            headers=headers
        )
        
        # If token expired, try to refresh it
        if response.status_code == 401:
            refresh_result = refresh_spotify_token()
            if not refresh_result['success']:
                return refresh_result
            
            # Retry with new token
            headers['Authorization'] = f"Bearer {session['spotify_access_token']}"
            response = requests.get(
                f"{SPOTIFY_API_BASE_URL}/playlists/{playlist_id}/tracks",
                headers=headers
            )
        
        response.raise_for_status()
        tracks = response.json()
        
        # Extract unique albums
        albums = {}
        for item in tracks['items']:
            if not item['track']:
                continue
                
            album = item['track']['album']
            if album['id'] not in albums:
                albums[album['id']] = {
                    'id': album['id'],
                    'name': album['name'],
                    'artist': album['artists'][0]['name'],
                    'release_date': album['release_date'],
                    'total_tracks': album['total_tracks'],
                    'image_url': album['images'][0]['url'] if album['images'] else None
                }
        
        return {
            'success': True,
            'data': list(albums.values())
        }
    except requests.exceptions.RequestException as e:
        print(f"Error getting playlist tracks: {str(e)}")
        return {'success': False, 'error': 'Failed to get playlist tracks', 'needs_auth': True} 

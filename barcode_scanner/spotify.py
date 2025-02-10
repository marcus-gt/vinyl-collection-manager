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

CLIENT_ID = os.getenv('SPOTIFY_CLIENT_ID')
CLIENT_SECRET = os.getenv('SPOTIFY_CLIENT_SECRET')
REDIRECT_URI = os.getenv('SPOTIFY_REDIRECT_URI')

def require_spotify_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        print("\n=== Checking Spotify Auth ===")
        print(f"Session data: {dict(session)}")
        
        if 'spotify_token' not in session:
            print("No Spotify token in session")
            return jsonify({
                'success': False,
                'error': 'Not authenticated with Spotify',
                'needs_auth': True
            }), 401
            
        # Check if token is expired
        try:
            headers = {
                'Authorization': f"Bearer {session['spotify_token']}"
            }
            response = requests.get(f"{SPOTIFY_API_BASE_URL}/me", headers=headers)
            
            if response.status_code == 401:
                print("Token expired, attempting refresh")
                refresh_result = refresh_spotify_token()
                if not refresh_result['success']:
                    print("Token refresh failed")
                    # Clear invalid tokens
                    session.pop('spotify_token', None)
                    session.pop('spotify_refresh_token', None)
                    return jsonify({
                        'success': False,
                        'error': 'Not authenticated with Spotify',
                        'needs_auth': True
                    }), 401
                print("Token refreshed successfully")
            
        except Exception as e:
            print(f"Error checking token: {str(e)}")
            return jsonify({
                'success': False,
                'error': 'Failed to validate Spotify session'
            }), 500
            
        return f(*args, **kwargs)
    return decorated_function

def get_spotify_auth_url():
    """Generate the Spotify authorization URL"""
    params = {
        'client_id': CLIENT_ID,
        'response_type': 'code',
        'redirect_uri': REDIRECT_URI,
        'scope': 'playlist-read-private playlist-read-collaborative user-library-read',
        'show_dialog': True
    }
    return f"{SPOTIFY_AUTH_URL}?{urlencode(params)}"

def handle_spotify_callback(code):
    """Handle the Spotify OAuth callback"""
    print("\n=== Handling Spotify Callback ===")
    print(f"Code received: {code[:10]}...")  # Only print first 10 chars for security
    
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
        response = requests.post(SPOTIFY_TOKEN_URL, headers=headers, data=data)
        response.raise_for_status()
        token_info = response.json()
        
        print("Got token response from Spotify")
        
        # Store token info in session
        session['spotify_token'] = token_info['access_token']
        session['spotify_refresh_token'] = token_info.get('refresh_token')
        session['spotify_token_type'] = token_info.get('token_type', 'Bearer')
        session.modified = True  # Ensure session is saved
        
        print("Stored tokens in session")
        print(f"Session data: {dict(session)}")
        
        return {'success': True}
    except requests.exceptions.RequestException as e:
        print(f"Error getting Spotify token: {str(e)}")
        return {'success': False, 'error': 'Failed to authenticate with Spotify'}

def refresh_spotify_token():
    """Refresh the Spotify access token"""
    print("\n=== Refreshing Spotify Token ===")
    print(f"Session before refresh: {dict(session)}")
    
    if 'spotify_refresh_token' not in session:
        print("No refresh token in session")
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
        
        # Update token in session
        session['spotify_token'] = token_info['access_token']
        if 'refresh_token' in token_info:
            session['spotify_refresh_token'] = token_info['refresh_token']
        session.modified = True  # Ensure session is saved
        
        print(f"Session after refresh: {dict(session)}")
        
        return {'success': True}
    except requests.exceptions.RequestException as e:
        print(f"Error refreshing token: {str(e)}")
        # Clear invalid tokens
        session.pop('spotify_token', None)
        session.pop('spotify_refresh_token', None)
        session.modified = True
        return {'success': False, 'error': 'Failed to refresh token'}

def get_spotify_playlists():
    """Get user's Spotify playlists"""
    print("\n=== Getting Spotify Playlists ===")
    print(f"Session data: {dict(session)}")
    
    if 'spotify_token' not in session:
        print("No Spotify token in session")
        return {
            'success': False,
            'error': 'Not authenticated with Spotify',
            'needs_auth': True
        }

    headers = {
        'Authorization': f"Bearer {session['spotify_token']}"
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
                return {
                    'success': False,
                    'error': 'Not authenticated with Spotify',
                    'needs_auth': True
                }
            
            # Retry with new token
            print("Retrying with new token")
            headers['Authorization'] = f"Bearer {session['spotify_token']}"
            response = requests.get(f"{SPOTIFY_API_BASE_URL}/me/playlists", headers=headers)
        
        response.raise_for_status()
        playlists = response.json()
        
        print(f"Got {len(playlists['items'])} playlists")
        
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
            session.pop('spotify_token', None)
            session.pop('spotify_refresh_token', None)
            session.modified = True
            return {
                'success': False,
                'error': 'Not authenticated with Spotify',
                'needs_auth': True
            }
        return {'success': False, 'error': 'Failed to get playlists'}

def get_playlist_tracks(playlist_id):
    """Get tracks from a specific playlist"""
    if 'spotify_token' not in session:
        return {'success': False, 'error': 'Not authenticated with Spotify'}

    headers = {
        'Authorization': f"Bearer {session['spotify_token']}"
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
            headers['Authorization'] = f"Bearer {session['spotify_token']}"
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
        return {'success': False, 'error': 'Failed to get playlist tracks'} 

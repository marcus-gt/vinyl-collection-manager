import os
import base64
import json
import requests
from urllib.parse import urlencode
from flask import session, redirect, request, jsonify
from functools import wraps
from .db import get_supabase_client
from datetime import datetime
import sys
from pathlib import Path

# Add the parent directory to sys.path
parent_dir = str(Path(__file__).parent.parent)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

from discogs_lookup import search_by_artist_album
from discogs_data import get_album_data_from_id

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

def get_spotify_tokens_from_db(user_id):
    """Get Spotify tokens from the database"""
    try:
        client = get_supabase_client()
        response = client.table('spotify_tokens').select('*').eq('user_id', user_id).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None
    except Exception as e:
        print(f"Error getting Spotify tokens from DB: {str(e)}")
        return None

def save_spotify_tokens_to_db(user_id, access_token, refresh_token):
    """Save or update Spotify tokens in the database"""
    try:
        client = get_supabase_client()
        
        # Check if tokens already exist for this user
        existing = client.table('spotify_tokens').select('*').eq('user_id', user_id).execute()
        
        if existing.data and len(existing.data) > 0:
            # Update existing tokens
            response = client.table('spotify_tokens').update({
                'access_token': access_token,
                'refresh_token': refresh_token
            }).eq('user_id', user_id).execute()
        else:
            # Insert new tokens
            response = client.table('spotify_tokens').insert({
                'user_id': user_id,
                'access_token': access_token,
                'refresh_token': refresh_token
            }).execute()
            
        return True
    except Exception as e:
        print(f"Error saving Spotify tokens to DB: {str(e)}")
        return False

def remove_spotify_tokens_from_db(user_id):
    """Remove Spotify tokens from the database"""
    try:
        client = get_supabase_client()
        response = client.table('spotify_tokens').delete().eq('user_id', user_id).execute()
        return True
    except Exception as e:
        print(f"Error removing Spotify tokens from DB: {str(e)}")
        return False

def require_spotify_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        print("\n=== Checking Spotify Auth ===")
        
        # Get user_id from session
        user_id = session.get('user_id')
        if not user_id:
            print("No user_id in session")
            return jsonify({
                'success': False,
                'error': 'Not authenticated',
                'needs_auth': True
            }), 401
            
        # Try to get tokens from database first
        db_tokens = get_spotify_tokens_from_db(user_id)
        if db_tokens:
            print("Found Spotify tokens in database")
            session['spotify_access_token'] = db_tokens['access_token']
            session['spotify_refresh_token'] = db_tokens['refresh_token']
            session.modified = True
            
        if 'spotify_access_token' not in session:
            print("No Spotify access token available")
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
                    remove_spotify_tokens_from_db(user_id)
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
        
        # Store tokens in session
        session['spotify_access_token'] = token_info['access_token']
        session['spotify_refresh_token'] = token_info.get('refresh_token')
        session.modified = True
        
        # Store tokens in database
        user_id = session.get('user_id')
        if user_id:
            save_spotify_tokens_to_db(
                user_id,
                token_info['access_token'],
                token_info.get('refresh_token')
            )
        
        print("Stored Spotify tokens in session and database")
        
        return {'success': True}
    except requests.exceptions.RequestException as e:
        print(f"Error getting Spotify token: {str(e)}")
        if hasattr(e.response, 'text'):
            print(f"Error response: {e.response.text}")
        return {'success': False, 'error': 'Failed to authenticate with Spotify'}

def refresh_spotify_token():
    """Refresh the Spotify access token"""
    print("\n=== Refreshing Spotify Token ===")
    
    user_id = session.get('user_id')
    if not user_id:
        print("No user_id in session")
        return {'success': False, 'error': 'Not authenticated'}
        
    # Try to get refresh token from database first
    db_tokens = get_spotify_tokens_from_db(user_id)
    if db_tokens and db_tokens['refresh_token']:
        refresh_token = db_tokens['refresh_token']
    else:
        refresh_token = session.get('spotify_refresh_token')
        
    if not refresh_token:
        print("No refresh token available")
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
        'refresh_token': refresh_token
    }

    try:
        response = requests.post(SPOTIFY_TOKEN_URL, headers=headers, data=data)
        response.raise_for_status()
        token_info = response.json()
        
        print("Got new token from Spotify")
        
        # Update tokens in session
        session['spotify_access_token'] = token_info['access_token']
        if 'refresh_token' in token_info:
            session['spotify_refresh_token'] = token_info['refresh_token']
            refresh_token = token_info['refresh_token']
        session.modified = True
        
        # Update tokens in database
        save_spotify_tokens_to_db(
            user_id,
            token_info['access_token'],
            refresh_token
        )
        
        print("Updated tokens in session and database")
        
        return {'success': True}
    except requests.exceptions.RequestException as e:
        print(f"Error refreshing token: {str(e)}")
        # Clear invalid tokens
        session.pop('spotify_access_token', None)
        session.pop('spotify_refresh_token', None)
        session.modified = True
        remove_spotify_tokens_from_db(user_id)
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
            'needs_auth': True,
            'error': 'Not authenticated with Spotify'
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
                    'needs_auth': True,
                    'error': 'Not authenticated with Spotify'
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
                'needs_auth': True,
                'error': 'Not authenticated with Spotify'
            }
        return {
            'success': False,
            'needs_auth': True,
            'error': 'Failed to get playlists'
        }

def get_playlist_tracks(playlist_id):
    """Get tracks from a specific playlist"""
    print("\n=== Getting Playlist Tracks ===")
    print(f"Session data: {dict(session)}")
    
    if 'spotify_access_token' not in session:
        print("No Spotify access token in session")
        session.modified = True
        return {
            'success': False,
            'needs_auth': True,
            'error': 'Not authenticated with Spotify'
        }

    headers = {
        'Authorization': f"Bearer {session['spotify_access_token']}"
    }

    try:
        print(f"Making request to Spotify API for playlist {playlist_id}...")
        response = requests.get(
            f"{SPOTIFY_API_BASE_URL}/playlists/{playlist_id}/tracks",
            headers=headers
        )
        
        # If token expired, try to refresh it
        if response.status_code == 401:
            print("Token expired, attempting refresh")
            refresh_result = refresh_spotify_token()
            if not refresh_result['success']:
                print("Token refresh failed")
                session.modified = True
                return {
                    'success': False,
                    'needs_auth': True,
                    'error': 'Not authenticated with Spotify'
                }
            
            # Retry with new token
            print("Retrying with new token")
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
        if isinstance(e, requests.exceptions.HTTPError) and e.response.status_code == 401:
            # Clear invalid tokens
            session.pop('spotify_access_token', None)
            session.pop('spotify_refresh_token', None)
            session.modified = True
            return {
                'success': False,
                'needs_auth': True,
                'error': 'Not authenticated with Spotify'
            }
        return {
            'success': False,
            'needs_auth': True,
            'error': 'Failed to get playlist tracks'
        }

def get_album_from_url(url):
    """Get album information from a Spotify URL"""
    print("\n=== Getting Album from Spotify URL ===")
    print(f"Session data: {dict(session)}")
    
    if 'spotify.com/track/' in url:
        track_id = url.split('track/')[1].split('?')[0].split('/')[0]
        endpoint = f"{SPOTIFY_API_BASE_URL}/tracks/{track_id}"
    elif 'spotify.com/album/' in url:
        album_id = url.split('album/')[1].split('?')[0].split('/')[0]
        endpoint = f"{SPOTIFY_API_BASE_URL}/albums/{album_id}"
    else:
        return {
            'success': False,
            'error': 'Invalid Spotify URL. Must be a track or album URL.'
        }

    headers = {
        'Authorization': f"Bearer {session['spotify_access_token']}"
    }

    response = requests.get(endpoint, headers=headers)
    
    # Handle token expiration
    if response.status_code == 401:
        print("Token expired, attempting refresh")
        refresh_result = refresh_spotify_token()
        if not refresh_result['success']:
            print("Token refresh failed")
            session.modified = True
            return {
                'success': False,
                'needs_auth': True,
                'error': 'Not authenticated with Spotify'
            }
        
        # Retry with new token
        headers['Authorization'] = f"Bearer {session['spotify_access_token']}"
        response = requests.get(endpoint, headers=headers)

    response.raise_for_status()
    data = response.json()

    # For tracks, we need to get the album information
    if 'spotify.com/track/' in url:
        album_id = data['album']['id']
        album_response = requests.get(
            f"{SPOTIFY_API_BASE_URL}/albums/{album_id}",
            headers=headers
        )
        album_response.raise_for_status()
        data = album_response.json()

    # Extract the relevant information
    album_info = {
        'name': data['name'],
        'artist': data['artists'][0]['name'],  # Using first artist
        'release_date': data['release_date']
    }

    return {
        'success': True,
        'data': album_info
    }

def subscribe_to_playlist(playlist_id: str, playlist_name: str):
    """Subscribe to a Spotify playlist for automatic album imports"""
    print("\n=== Subscribing to Spotify Playlist ===")
    
    user_id = session.get('user_id')
    if not user_id:
        return {
            'success': False,
            'error': 'Not authenticated'
        }
    
    try:
        client = get_supabase_client()
        
        # Update or insert subscription
        response = client.table('spotify_playlist_subscriptions').upsert({
            'user_id': user_id,
            'playlist_id': playlist_id,
            'playlist_name': playlist_name,
            'last_checked_at': datetime.utcnow().isoformat()
        }).execute()
        
        return {
            'success': True,
            'message': 'Successfully subscribed to playlist'
        }
    except Exception as e:
        print(f"Error subscribing to playlist: {str(e)}")
        return {
            'success': False,
            'error': 'Failed to subscribe to playlist'
        }

def unsubscribe_from_playlist():
    """Unsubscribe from the current Spotify playlist"""
    print("\n=== Unsubscribing from Spotify Playlist ===")
    
    user_id = session.get('user_id')
    if not user_id:
        return {
            'success': False,
            'error': 'Not authenticated'
        }
    
    try:
        client = get_supabase_client()
        
        # Delete subscription
        response = client.table('spotify_playlist_subscriptions').delete().eq('user_id', user_id).execute()
        
        return {
            'success': True,
            'message': 'Successfully unsubscribed from playlist'
        }
    except Exception as e:
        print(f"Error unsubscribing from playlist: {str(e)}")
        return {
            'success': False,
            'error': 'Failed to unsubscribe from playlist'
        }

def get_subscribed_playlist():
    """Get the currently subscribed playlist for the user"""
    print("\n=== Getting Subscribed Playlist ===")
    
    user_id = session.get('user_id')
    if not user_id:
        return {
            'success': False,
            'error': 'Not authenticated'
        }
    
    try:
        client = get_supabase_client()
        
        # Get subscription
        response = client.table('spotify_playlist_subscriptions').select('*').eq('user_id', user_id).execute()
        
        if response.data and len(response.data) > 0:
            return {
                'success': True,
                'data': response.data[0]
            }
        else:
            return {
                'success': True,
                'data': None
            }
    except Exception as e:
        print(f"Error getting subscribed playlist: {str(e)}")
        return {
            'success': False,
            'error': 'Failed to get subscribed playlist'
        }

def sync_subscribed_playlists():
    """Sync all subscribed playlists (to be called by cron job)"""
    print("\n=== Syncing Subscribed Playlists ===")
    
    try:
        client = get_supabase_client()
        added_albums = []  # Track added albums
        
        # Get all subscriptions
        subscriptions = client.table('spotify_playlist_subscriptions').select('*').execute()
        print(f"Found {len(subscriptions.data)} subscriptions")
        
        for sub in subscriptions.data:
            try:
                print(f"\nProcessing subscription for user {sub['user_id']}")
                
                # Get user's Spotify tokens
                tokens = get_spotify_tokens_from_db(sub['user_id'])
                if not tokens:
                    print(f"No Spotify tokens found for user {sub['user_id']}")
                    continue
                
                # Set up session for this user
                session['spotify_access_token'] = tokens['access_token']
                session['spotify_refresh_token'] = tokens['refresh_token']
                session['user_id'] = sub['user_id']
                session.modified = True
                
                # Get playlist tracks
                tracks_response = get_playlist_tracks(sub['playlist_id'])
                if not tracks_response['success']:
                    print(f"Failed to get tracks for playlist {sub['playlist_id']}")
                    continue
                
                print(f"Found {len(tracks_response['data'])} tracks in playlist")
                
                # Get already processed albums
                processed = client.table('spotify_processed_albums').select('album_id').eq(
                    'user_id', sub['user_id']
                ).eq('playlist_id', sub['playlist_id']).execute()
                
                processed_ids = set(item['album_id'] for item in processed.data)
                print(f"Found {len(processed_ids)} already processed albums")
                
                # Process new albums
                for album in tracks_response['data']:
                    if album['id'] not in processed_ids:
                        print(f"\nProcessing new album: {album['name']} by {album['artist']}")
                        
                        # Look up in Discogs
                        lookup_response = search_by_artist_album(album['artist'], album['name'])
                        print(f"Discogs lookup response: {lookup_response}")
                        
                        if lookup_response['success'] and lookup_response['data']:
                            # Add to collection
                            add_response = client.table('vinyl_records').insert({
                                'user_id': sub['user_id'],
                                'artist': lookup_response['data']['artist'],
                                'album': lookup_response['data']['album'],
                                'year': lookup_response['data']['year'],
                                'label': lookup_response['data']['label'],
                                'genres': lookup_response['data']['genres'],
                                'styles': lookup_response['data']['styles'],
                                'musicians': lookup_response['data']['musicians'],
                                'master_url': lookup_response['data']['master_url'],
                                'current_release_url': lookup_response['data']['current_release_url'],
                                'current_release_year': lookup_response['data']['current_release_year'],
                                'created_at': datetime.utcnow().isoformat(),
                                'updated_at': datetime.utcnow().isoformat()
                            }).execute()
                            
                            print(f"Add to collection response: {add_response}")
                            
                            if add_response.data:
                                # Mark as processed
                                client.table('spotify_processed_albums').insert({
                                    'user_id': sub['user_id'],
                                    'playlist_id': sub['playlist_id'],
                                    'album_id': album['id']
                                }).execute()
                                print(f"Successfully added album: {album['name']}")
                                # Track added album
                                added_albums.append({
                                    'artist': lookup_response['data']['artist'],
                                    'album': lookup_response['data']['album']
                                })
                            else:
                                print(f"Failed to add album: {album['name']}")
                        else:
                            print(f"Could not find album in Discogs: {album['name']}")
                
                # Update last checked timestamp
                client.table('spotify_playlist_subscriptions').update({
                    'last_checked_at': datetime.utcnow().isoformat()
                }).eq('id', sub['id']).execute()
                print(f"Updated last_checked_at for subscription {sub['id']}")
                
            except Exception as e:
                print(f"Error processing subscription: {str(e)}")
                import traceback
                traceback.print_exc()
                continue
        
        return {
            'success': True,
            'message': 'Successfully synced subscribed playlists',
            'data': {
                'added_albums': added_albums,
                'total_added': len(added_albums)
            }
        }
    except Exception as e:
        print(f"Error syncing subscribed playlists: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'success': False,
            'error': 'Failed to sync subscribed playlists'
        }

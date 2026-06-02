"""Spotify OAuth, playlist browsing, album lookup, subscriptions and sync."""

import os

from flask import Blueprint, jsonify, request, session, redirect

from barcode_scanner.auth_utils import require_auth
from barcode_scanner.spotify import (
    get_spotify_auth_url,
    handle_spotify_callback,
    get_spotify_playlists,
    get_playlist_tracks,
    get_album_from_url,
    get_album_from_url_public,
    subscribe_to_playlist,
    unsubscribe_from_playlist,
    get_subscribed_playlist,
    sync_subscribed_playlists,
)

bp = Blueprint('spotify', __name__)


@bp.route('/api/spotify/auth')
def spotify_auth():
    """Start Spotify OAuth flow."""
    # get_spotify_auth_url returns a Response object, so return it directly
    return get_spotify_auth_url()


@bp.route('/api/spotify/callback')
def spotify_callback():
    """Handle Spotify OAuth callback."""
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


@bp.route('/api/spotify/playlists')
def spotify_playlists():
    """Get user's Spotify playlists."""
    # Check for Spotify authentication
    if 'spotify_access_token' not in session:
        return jsonify({
            'success': False,
            'needs_auth': True,
            'error': 'Not authenticated with Spotify'
        })

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


@bp.route('/api/spotify/playlists/<playlist_id>/tracks')
def spotify_playlist_tracks(playlist_id):
    """Get tracks from a specific playlist."""
    # Check for Spotify authentication
    if 'spotify_access_token' not in session:
        return jsonify({
            'success': False,
            'needs_auth': True,
            'error': 'Not authenticated with Spotify'
        })

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


@bp.route('/api/spotify/album-from-url')
def spotify_album_from_url():
    """Get album information from a Spotify URL."""
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


@bp.route('/api/spotify/album-from-url-public')
def spotify_album_from_url_public():
    """Get album information from a Spotify URL using public API (no auth required)."""
    url = request.args.get('url')
    if not url:
        return jsonify({
            'success': False,
            'error': 'No URL provided'
        })

    result = get_album_from_url_public(url)
    if result.get('success') and result.get('data'):
        # Ensure current_release fields are null for Spotify URL lookup
        result['data']['current_release_url'] = None
        result['data']['current_release_year'] = None
    return jsonify(result)


@bp.route('/api/spotify/disconnect', methods=['POST'])
def spotify_disconnect():
    """Disconnect Spotify integration by clearing tokens."""
    session.pop('spotify_access_token', None)
    session.pop('spotify_refresh_token', None)
    session.pop('spotify_token_type', None)
    session.pop('spotify_auth_started', None)
    session.modified = True

    return jsonify({
        'success': True,
        'message': 'Spotify disconnected successfully'
    })


@bp.route('/api/spotify/playlist/subscribe', methods=['POST'])
@require_auth
def subscribe_playlist():
    """Subscribe to a Spotify playlist for automatic album imports."""
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


@bp.route('/api/spotify/playlist/unsubscribe', methods=['POST'])
@require_auth
def unsubscribe_playlist():
    """Unsubscribe from the current Spotify playlist."""
    try:
        result = unsubscribe_from_playlist()
        return jsonify(result)
    except Exception as e:
        print(f"Error unsubscribing from playlist: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to unsubscribe from playlist'
        }), 500


@bp.route('/api/spotify/playlist/subscription', methods=['GET'])
@require_auth
def get_playlist_subscription():
    """Get the currently subscribed playlist."""
    try:
        result = get_subscribed_playlist()
        return jsonify(result)
    except Exception as e:
        print(f"Error getting playlist subscription: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get playlist subscription'
        }), 500


@bp.route('/api/spotify/playlist/sync', methods=['POST'])
@require_auth
def sync_playlists():
    """Manually trigger playlist sync."""
    try:
        result = sync_subscribed_playlists()
        return jsonify(result)
    except Exception as e:
        print(f"Error syncing playlists: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to sync playlists'
        }), 500


# Automated sync endpoint hit by the Supabase cron job (sync_spotify_playlists_cron).
# Must stay on a distinct path from the manual user sync above to avoid a route collision.
@bp.route('/api/spotify/playlist/sync/automated', methods=['POST'])
def automated_sync_playlists():
    """Automated playlist sync triggered by cron job."""
    # Verify sync key
    sync_key = request.headers.get('X-Sync-Key')
    if not sync_key or sync_key != os.getenv('SYNC_SECRET_KEY'):
        return jsonify({
            'success': False,
            'error': 'Unauthorized'
        }), 401

    try:
        result = sync_subscribed_playlists(is_automated=True)
        return jsonify(result)
    except Exception as e:
        print(f"Error in automated playlist sync: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to sync playlists'
        }), 500

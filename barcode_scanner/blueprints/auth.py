"""Authentication routes: register, login, logout, current user, token refresh,
and the post-login Spotify auto-sync trigger."""

from flask import Blueprint, jsonify, request, session

from barcode_scanner.auth_utils import require_auth
from barcode_scanner.db import (
    create_user,
    login_user,
    get_supabase_client,
    refresh_session_token,
)
from barcode_scanner.spotify import sync_subscribed_playlists

bp = Blueprint('auth', __name__)


@bp.route('/api/auth/register', methods=['POST'])
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


@bp.route('/api/auth/login', methods=['POST'])
def login():
    """Login a user."""
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

        if result['success'] and result['session']:
            # Set session data BEFORE creating response
            session.permanent = True
            session['user_id'] = result['session'].user.id
            session['access_token'] = result['session'].access_token
            session['refresh_token'] = result['session'].refresh_token
            session.modified = True  # Ensure Flask knows to save the session

            # The access token lives only in the httpOnly session cookie; it is
            # deliberately not returned in the body to keep it out of reach of JS/XSS.
            response = jsonify({
                'success': True,
                'session': {
                    'user': {
                        'id': result['session'].user.id,
                        'email': result['session'].user.email
                    }
                }
            })

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


@bp.route('/api/auth/logout', methods=['POST'])
def logout():
    """Logout the current user."""
    session.clear()
    return jsonify({'success': True}), 200


@bp.route('/api/auth/me')
def get_current_user():
    """Get current authenticated user."""
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
            response = client.table('profiles').select('*').eq('id', user_id).single().execute()

            if response.data:
                # Access token stays in the httpOnly session cookie, not the body.
                return jsonify({
                    'success': True,
                    'user': response.data,
                    'session': {
                        'user': response.data
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
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Server error'
        }), 500


@bp.route('/api/auth/auto-sync', methods=['POST'])
@require_auth
def auto_sync_playlists():
    """Automatically sync Spotify playlists when a user logs in or returns after being idle."""
    try:
        result = sync_subscribed_playlists()
        return jsonify(result)
    except Exception as e:
        print(f"Error in auto-sync: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Failed to auto-sync playlists'
        }), 500


@bp.route('/api/auth/refresh', methods=['POST'])
def refresh_auth_token():
    """Refresh the authentication token."""
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

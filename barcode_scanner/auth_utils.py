"""Authentication helpers shared across blueprints.

Lives outside ``server`` to avoid circular imports: blueprints import
``require_auth`` from here, and ``server`` imports ``check_token_expiration``
for its before_request hook.
"""

from functools import wraps
from datetime import datetime

import jwt
from flask import session, jsonify

from barcode_scanner.db import refresh_session_token


def require_auth(f):
    """Reject the request with 401 unless a user is authenticated."""
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
    """Refresh the Supabase access token if it is close to expiring."""
    try:
        # Only check if we have a token in the session
        if 'access_token' in session:
            token = session['access_token']
            try:
                # Decode without verifying the signature, only to read exp
                decoded = jwt.decode(token, options={"verify_signature": False})

                exp = decoded.get('exp')
                if exp:
                    now = datetime.utcnow().timestamp()
                    # If token expires in less than 30 minutes, refresh it
                    if exp - now < 1800:
                        refresh_result = refresh_session_token(session.get('refresh_token'))
                        if refresh_result['success']:
                            session['access_token'] = refresh_result['access_token']
                            session['refresh_token'] = refresh_result['refresh_token']
                            session.modified = True
            except jwt.PyJWTError:
                # Token unreadable - try a refresh, and clear session if that fails
                refresh_result = refresh_session_token(session.get('refresh_token'))
                if refresh_result['success']:
                    session['access_token'] = refresh_result['access_token']
                    session['refresh_token'] = refresh_result['refresh_token']
                    session.modified = True
                else:
                    session.pop('user_id', None)
                    session.pop('access_token', None)
                    session.pop('refresh_token', None)
    except Exception as e:
        print(f"Error checking token expiration: {str(e)}")

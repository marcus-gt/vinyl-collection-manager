"""Shared Flask extensions and small request helpers.

Kept in a separate module so blueprints can import the limiter and helpers
without importing ``server`` (which would create a circular import). The
``Limiter`` is created without an app here and bound to the app in
``server.py`` via ``limiter.init_app(app)``.
"""

from flask import session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address


def is_authenticated_request():
    """True when there is a logged-in user in the session.

    Used to exempt authenticated requests from the public lookup rate limits
    so bulk/batch imports are never throttled.
    """
    return 'user_id' in session


limiter = Limiter(
    key_func=get_remote_address,
    storage_uri="memory://",
    default_limits=[],
)

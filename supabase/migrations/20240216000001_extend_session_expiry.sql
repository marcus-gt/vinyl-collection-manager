-- Set session expiry to 1 year (in seconds)
ALTER SYSTEM SET session.expiry = '31536000';

-- Set refresh token expiry to 1 year (in seconds)
ALTER SYSTEM SET auth.refresh_token_expiry = '31536000';

-- Set access token expiry to 24 hours (in seconds)
-- This means the token will be silently refreshed every 24 hours
ALTER SYSTEM SET auth.access_token_expiry = '86400';

-- Enable persistent sessions
ALTER SYSTEM SET auth.enable_persistent_sessions = 'true'; 

-- Extend JWT token expiry time to 90 days (in seconds)
-- 90 days = 60 * 60 * 24 * 90 = 7,776,000 seconds
ALTER SYSTEM SET pgsodium.jwt_secret_expiry = '7776000s';
SELECT set_config('auth.jwt_exp', '7776000', false);

-- Set refresh token duration to 90 days
ALTER SYSTEM SET pgsodium.jwt_secret_key_expiry = '7776000s';

-- Disable inactivity timeout
ALTER SYSTEM SET auth.inactivity_timeout = '0s';

-- Ensure the auth.inactivity_timeout is set to 0
UPDATE auth.config
SET inactivity_timeout = 0
WHERE inactivity_timeout IS NOT NULL;

-- Set token refresh interval to 30 seconds to prevent replay attacks
-- but give adequate time for token refresh operations
UPDATE auth.config
SET token_refresh_interval = 30
WHERE token_refresh_interval IS NOT NULL;

-- Note: Some of these settings might need to be applied through the Supabase dashboard:
-- 1. Go to Authentication > URL Configuration
-- 2. Under "User Sessions", set "Time-box user sessions" to 0 (never)
-- 3. Under "User Sessions", set "Inactivity timeout" to 0 (never)
-- 4. Under "Refresh Tokens", set "Refresh token reuse interval" to 30 seconds 

-- Set JWT expiration time to 24 hours (in seconds)
SELECT set_config('jwt.expiry', '86400', false);

-- Note: This setting might need to be applied through the Supabase dashboard:
-- 1. Go to Authentication > Policies
-- 2. Set "JWT expiry" to 86400 (24 hours) 

-- Create the cron job function
CREATE OR REPLACE FUNCTION public.sync_spotify_playlists_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  sync_url text;
  sync_key text;
BEGIN
  -- Get the sync URL and key from vault or environment
  sync_url := current_setting('app.settings.api_url', true) || '/api/spotify/playlist/sync';
  sync_key := current_setting('app.settings.sync_secret_key', true);

  -- Make HTTP request to sync endpoint
  PERFORM
    net.http_post(
      url := sync_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Sync-Key', sync_key
      )
    );
END;
$$;

-- Create the cron job schedule (runs every hour)
SELECT cron.schedule(
  'spotify-playlist-sync',  -- unique job name
  '0 * * * *',            -- every hour (cron schedule expression)
  'SELECT public.sync_spotify_playlists_cron();'
);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.sync_spotify_playlists_cron() TO postgres;
GRANT EXECUTE ON FUNCTION public.sync_spotify_playlists_cron() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_spotify_playlists_cron() TO service_role; 

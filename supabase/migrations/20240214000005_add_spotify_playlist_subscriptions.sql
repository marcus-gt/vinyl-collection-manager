-- Create spotify_playlist_subscriptions table
CREATE TABLE spotify_playlist_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    playlist_id TEXT NOT NULL,
    playlist_name TEXT NOT NULL,
    last_checked_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(user_id)
);

-- Create table to track processed albums
CREATE TABLE spotify_processed_albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    playlist_id TEXT NOT NULL,
    album_id TEXT NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(user_id, playlist_id, album_id)
);

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_spotify_playlist_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_spotify_playlist_subscriptions_updated_at
    BEFORE UPDATE ON spotify_playlist_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_spotify_playlist_subscriptions_updated_at();

-- Enable Row Level Security
ALTER TABLE spotify_playlist_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE spotify_processed_albums ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for spotify_playlist_subscriptions
CREATE POLICY "Users can view their own playlist subscriptions"
    ON spotify_playlist_subscriptions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own playlist subscriptions"
    ON spotify_playlist_subscriptions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own playlist subscriptions"
    ON spotify_playlist_subscriptions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own playlist subscriptions"
    ON spotify_playlist_subscriptions FOR DELETE
    USING (auth.uid() = user_id);

-- Create RLS policies for spotify_processed_albums
CREATE POLICY "Users can view their own processed albums"
    ON spotify_processed_albums FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own processed albums"
    ON spotify_processed_albums FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own processed albums"
    ON spotify_processed_albums FOR DELETE
    USING (auth.uid() = user_id);

-- Add helpful comments
COMMENT ON TABLE spotify_playlist_subscriptions IS 'Stores user subscriptions to Spotify playlists for automatic album imports';
COMMENT ON TABLE spotify_processed_albums IS 'Tracks which albums have been processed from subscribed playlists to avoid duplicates'; 

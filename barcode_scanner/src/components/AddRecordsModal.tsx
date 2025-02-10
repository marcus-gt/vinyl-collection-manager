import React, { useState } from 'react';
import { Box, Text, Group, TextInput, Button, Divider } from '@mantine/core';
import { spotifyApi } from '../services/spotifyApi';
import { showNotification } from '@mantine/notifications';

const AddRecordsModal = () => {
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [isLoadingAlbumLookup, setIsLoadingAlbumLookup] = useState(false);

  const handleSpotifyUrlLookup = async () => {
    if (!spotifyUrl) return;
    
    setIsLoadingAlbumLookup(true);
    try {
      const result = await spotifyApi.getAlbumFromUrl(spotifyUrl);
      if (result.success && result.data) {
        setTitle(result.data.name);
        setArtist(result.data.artist);
        setReleaseDate(result.data.release_date);
        setSpotifyUrl('');
        showNotification({
          title: 'Success',
          message: 'Album information retrieved successfully',
          color: 'green'
        });
      } else if (result.needs_auth) {
        setShowSpotifyConnect(true);
      } else {
        showNotification({
          title: 'Error',
          message: result.error || 'Failed to get album information',
          color: 'red'
        });
      }
    } catch (error) {
      console.error('Error looking up Spotify URL:', error);
      showNotification({
        title: 'Error',
        message: 'Failed to get album information',
        color: 'red'
      });
    } finally {
      setIsLoadingAlbumLookup(false);
    }
  };

  return (
    <Box mb="md">
      <Text size="sm" mb={5}>Or paste a Spotify album/track URL:</Text>
      <Group>
        <TextInput
          placeholder="https://open.spotify.com/album/..."
          value={spotifyUrl}
          onChange={(e) => setSpotifyUrl(e.target.value)}
          style={{ flex: 1 }}
          disabled={isLoadingAlbumLookup}
        />
        <Button
          onClick={handleSpotifyUrlLookup}
          loading={isLoadingAlbumLookup}
          disabled={!spotifyUrl}
        >
          Lookup
        </Button>
      </Group>
    </Box>
    <Divider my="md" />
  );
};

export default AddRecordsModal; 

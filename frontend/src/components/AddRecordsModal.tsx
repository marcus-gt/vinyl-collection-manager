import { useState, useEffect, useRef } from 'react';
import { Modal, Title, TextInput, Button, Paper, Stack, Text, Group, Alert, Loader, Box, Tabs, Select, ScrollArea, Divider } from '@mantine/core';
import { IconX, IconBrandSpotify } from '@tabler/icons-react';
import { lookup, records, spotify } from '../services/api';
import type { VinylRecord } from '../types';
import { BarcodeScanner } from './BarcodeScanner';

interface AddRecordsModalProps {
  opened: boolean;
  onClose: () => void;
}

export function AddRecordsModal({ opened, onClose }: AddRecordsModalProps) {
  const [barcode, setBarcode] = useState('');
  const [discogsUrl, setDiscogsUrl] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [record, setRecord] = useState<VinylRecord | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerKey, setScannerKey] = useState(0);
  const [showManualForm, setShowManualForm] = useState(false);
  const [recordsChanged, setRecordsChanged] = useState(false);
  const [manualRecord, setManualRecord] = useState<Partial<VinylRecord> & {
    genresText?: string;
    stylesText?: string;
    musiciansText?: string;
  }>({
    artist: '',
    album: '',
    year: undefined,
    label: '',
    genres: [],
    styles: [],
    musicians: [],
    genresText: '',
    stylesText: '',
    musiciansText: ''
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<Array<{
    id: string;
    name: string;
    tracks: number;
  }>>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [playlistAlbums, setPlaylistAlbums] = useState<Array<{
    id: string;
    name: string;
    artist: string;
    release_date: string;
    total_tracks: number;
    image_url: string | null;
  }>>([]);
  const [loadingSpotify, setLoadingSpotify] = useState(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const [isSpotifyAuthenticated, setIsSpotifyAuthenticated] = useState(false);
  const [isLoadingSpotifyAuth, setIsLoadingSpotifyAuth] = useState(false);
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [isLoadingAlbumLookup, setIsLoadingAlbumLookup] = useState(false);

  // Reset state when modal is opened
  useEffect(() => {
    if (opened) {
      console.log('Modal opened, resetting states');
      setBarcode('');
      setDiscogsUrl('');
      setArtist('');
      setAlbum('');
      setError(null);
      setSuccess(null);
      setRecord(null);
      setIsScanning(false);
      setShowManualForm(false);
      setRecordsChanged(false);
      setManualRecord({
        artist: '',
        album: '',
        year: undefined,
        label: '',
        genres: [],
        styles: [],
        musicians: [],
        genresText: '',
        stylesText: '',
        musiciansText: ''
      });
      // Reset Spotify states
      setSpotifyPlaylists([]);
      setSelectedPlaylist(null);
      setPlaylistAlbums([]);
      setLoadingSpotify(false);
      setSpotifyError(null);
      setIsSpotifyAuthenticated(false);
      console.log('States reset complete');
    }
  }, [opened]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLoading(false);
      setError('Search aborted');
    }
  };

  const handleScan = async (scannedBarcode: string) => {
    setBarcode(scannedBarcode);
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await lookup.byBarcode(scannedBarcode, abortControllerRef.current.signal);
      if (response.success && response.data) {
        setRecord(response.data);
        setError(null);
      } else {
        setError(response.error || 'Failed to find record');
        setRecord(null);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError('Failed to lookup barcode');
      setRecord(null);
    } finally {
      if (abortControllerRef.current) {
        abortControllerRef.current = null;
      }
      setLoading(false);
    }
  };

  const handleManualLookup = async () => {
    if (!barcode.trim()) {
      setError('Please enter a barcode');
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await lookup.byBarcode(barcode, abortControllerRef.current.signal);
      if (response.success && response.data) {
        setRecord(response.data);
        setError(null);
      } else {
        setError(response.error || 'Failed to find record');
        setRecord(null);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError('Failed to lookup barcode');
      setRecord(null);
    } finally {
      if (abortControllerRef.current) {
        abortControllerRef.current = null;
      }
      setLoading(false);
    }
  };

  const handleDiscogsLookup = async () => {
    if (!discogsUrl.trim()) {
      setError('Please enter a Discogs URL');
      return;
    }

    if (!discogsUrl.includes('discogs.com/release/') && !discogsUrl.includes('discogs.com/master/')) {
      setError('Invalid Discogs URL. Please use a release or master URL');
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await lookup.byDiscogsUrl(discogsUrl, abortControllerRef.current.signal);
      if (response.success && response.data) {
        setRecord(response.data);
        setError(null);
      } else {
        setError(response.error || 'Failed to find record');
        setRecord(null);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError('Failed to lookup Discogs release');
      setRecord(null);
    } finally {
      if (abortControllerRef.current) {
        abortControllerRef.current = null;
      }
      setLoading(false);
    }
  };

  const handleArtistAlbumLookup = async () => {
    if (!artist.trim() || !album.trim()) {
      setError('Please enter both artist and album name');
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await lookup.byArtistAlbum(artist, album, abortControllerRef.current.signal);
      if (response.success && response.data) {
        setRecord(response.data);
        setError(null);
      } else {
        setError("Couldn't find record");
        setRecord(null);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError("Couldn't find record");
      setRecord(null);
    } finally {
      if (abortControllerRef.current) {
        abortControllerRef.current = null;
      }
      setLoading(false);
    }
  };

  const handleAddBasicInfo = () => {
    if (!artist.trim() || !album.trim()) {
      setError('Please enter both artist and album name');
      return;
    }
    
    setManualRecord({
      artist: artist.trim(),
      album: album.trim(),
      year: undefined,
      label: '',
      genres: [],
      styles: [],
      musicians: [],
      genresText: '',
      stylesText: '',
      musiciansText: ''
    });
    
    setShowManualForm(true);
  };

  const handleModalClose = () => {
    console.log('Modal closing, recordsChanged:', recordsChanged);
    if (recordsChanged) {
      console.log('Changes detected, triggering table refresh');
      const refreshEvent = new CustomEvent('vinyl-collection-table-refresh');
      window.dispatchEvent(refreshEvent);
      console.log('Table refresh event dispatched:', refreshEvent);
    } else {
      console.log('No changes detected, skipping table refresh');
    }
    onClose();
  };

  const handleManualSubmit = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      // If we're in the manual form, use all the info, otherwise just use artist and album
      const recordToSubmit = showManualForm ? {
        artist: manualRecord.artist,
        album: manualRecord.album,
        year: manualRecord.year,
        label: manualRecord.label,
        genres: manualRecord.genresText?.split(',').map(g => g.trim()).filter(Boolean) || [],
        styles: manualRecord.stylesText?.split(',').map(s => s.trim()).filter(Boolean) || [],
        musicians: manualRecord.musiciansText?.split(',').map(m => m.trim()).filter(Boolean) || []
      } : {
        artist: artist.trim(),
        album: album.trim()
      };

      console.log('Submitting record:', recordToSubmit);
      const response = await records.add(recordToSubmit);
      console.log('Submit response:', response);

      if (response.success) {
        console.log('Record added successfully, setting recordsChanged to true');
        setSuccess('Added to collection!');
        setRecordsChanged(true);  // Record was successfully added
        // Reset form
        setArtist('');
        setAlbum('');
        setRecord(null);
        if (showManualForm) {
          setShowManualForm(false);
          setManualRecord({
            artist: '',
            album: '',
            year: undefined,
            label: '',
            genres: [],
            styles: [],
            musicians: [],
            genresText: '',
            stylesText: '',
            musiciansText: ''
          });
        }
        // Clear success message after delay
        setTimeout(() => {
          setSuccess(null);
        }, 3000);
      } else {
        console.log('Failed to add record:', response.error);
        setError(response.error || 'Failed to add to collection');
      }
    } catch (err) {
      console.error('Error adding record:', err);
      setError('Failed to add to collection');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCollection = async () => {
    if (!record) return;
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const recordData = {
        artist: record.artist,
        album: record.album,
        year: record.year,
        current_release_year: record.current_release_year,
        barcode: record.barcode,
        genres: record.genres || [],
        styles: record.styles || [],
        musicians: record.musicians || [],
        master_url: record.master_url,
        current_release_url: record.current_release_url,
        label: record.label
      };

      console.log('Adding record from search:', recordData);
      const response = await records.add(recordData);
      console.log('Add response:', response);

      if (response.success) {
        console.log('Record added successfully, setting recordsChanged to true');
        setSuccess('Added to collection!');
        setRecordsChanged(true);  // Record was successfully added
        // Reset for next scan
        setRecord(null);
        setBarcode('');
        setScannerKey(prev => prev + 1);
        // Clear success message after delay
        setTimeout(() => {
          setSuccess(null);
        }, 3000);
      } else {
        console.log('Failed to add record:', response.error);
        setError(response.error || 'Failed to add to collection');
      }
    } catch (err) {
      console.error('Error adding record:', err);
      setError('Failed to add to collection');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setRecord(null);
    setBarcode('');
    setError(null);
    setSuccess(null);
    setScannerKey(prev => prev + 1);
  };

  const handleSpotifyAuth = async () => {
    setIsLoadingSpotifyAuth(true);
    setSpotifyError(null);
    try {
      console.log('Getting Spotify auth URL...');
      const response = await spotify.getAuthUrl();
      console.log('Auth URL response:', response);
      
      if (!response.success) {
        console.error('Failed to get auth URL:', response.error);
        setSpotifyError(response.error || 'Failed to get Spotify authorization URL');
        return;
      }
      
      if (!response.data?.auth_url) {
        console.error('No auth URL in response:', response);
        setSpotifyError('Invalid response from server');
        return;
      }
      
      // Store current location to return after auth
      localStorage.setItem('spotify_auth_return_path', window.location.pathname);
      console.log('Stored return path:', window.location.pathname);
      
      // Redirect to Spotify auth
      console.log('Redirecting to Spotify auth URL:', response.data.auth_url);
      window.location.href = response.data.auth_url;
    } catch (err) {
      console.error('Failed to start Spotify authorization:', err);
      setSpotifyError('Failed to start Spotify authorization');
    } finally {
      setIsLoadingSpotifyAuth(false);
    }
  };

  const checkSpotifyAuth = async () => {
    setLoadingSpotify(true);
    setSpotifyError(null);
    try {
      const response = await spotify.getPlaylists();
      setIsSpotifyAuthenticated(!response.needs_auth);
      if (!response.needs_auth && response.success) {
        setSpotifyPlaylists(response.data || []);
      }
    } catch (err) {
      console.log('Failed to check Spotify auth:', err);
      setIsSpotifyAuthenticated(false);
    } finally {
      setLoadingSpotify(false);
    }
  };

  const handleSpotifyTabChange = (value: string | null) => {
    if (value === 'spotify') {
      checkSpotifyAuth();
    }
  };

  const handlePlaylistSelect = async (playlistId: string) => {
    setSelectedPlaylist(playlistId);
    setLoadingSpotify(true);
    setSpotifyError(null);
    try {
      const response = await spotify.getPlaylistTracks(playlistId);
      if (response.success && response.data) {
        setPlaylistAlbums(response.data);
      } else {
        setSpotifyError(response.error || 'Failed to load playlist tracks');
      }
    } catch (err) {
      setSpotifyError('Failed to load playlist tracks');
    } finally {
      setLoadingSpotify(false);
    }
  };

  const handleAddSpotifyAlbum = async (album: {
    name: string;
    artist: string;
    release_date: string;
  }) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await lookup.byArtistAlbum(album.artist, album.name);
      if (response.success && response.data) {
        const addResponse = await records.add(response.data);
        if (addResponse.success) {
          setSuccess('Added to collection!');
          setRecordsChanged(true);
        } else {
          setError(addResponse.error || 'Failed to add to collection');
        }
      } else {
        setError("Couldn't find record in Discogs");
      }
    } catch (err) {
      setError('Failed to add album');
    } finally {
      setLoading(false);
    }
  };

  const handleSpotifyUrlLookup = async () => {
    if (!spotifyUrl) return;
    
    setIsLoadingAlbumLookup(true);
    try {
      const result = await spotify.getAlbumFromUrl(spotifyUrl);
      if (result.success && result.data) {
        // First try to find the record in Discogs
        const lookupResponse = await lookup.byArtistAlbum(result.data.artist, result.data.name);
        if (lookupResponse.success && lookupResponse.data) {
          // Add the record to the collection
          const addResponse = await records.add(lookupResponse.data);
          if (addResponse.success) {
            setSuccess('Added to collection!');
            setRecordsChanged(true);
            setSpotifyUrl('');
          } else {
            setSpotifyError(addResponse.error || 'Failed to add to collection');
          }
        } else {
          setSpotifyError("Couldn't find record in Discogs");
        }
      } else if (result.needs_auth) {
        setIsSpotifyAuthenticated(false);
        setSpotifyError('Please connect to Spotify first');
      } else {
        setSpotifyError(result.error || 'Failed to get album information');
      }
    } catch (error) {
      console.error('Error looking up Spotify URL:', error);
      setSpotifyError('Failed to get album information');
    } finally {
      setIsLoadingAlbumLookup(false);
    }
  };

  // Update the useEffect to handle Spotify auth callback
  useEffect(() => {
    // Check for Spotify callback code
    const urlParams = new URLSearchParams(window.location.search);
    const spotifyCode = urlParams.get('code');
    const returnPath = localStorage.getItem('spotify_auth_return_path');
    
    if (spotifyCode) {
      // Clear the URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      // Clear stored return path
      localStorage.removeItem('spotify_auth_return_path');
      // Load playlists since we just authenticated
      checkSpotifyAuth();
      // Return to previous location if available
      if (returnPath) {
        window.location.href = returnPath;
      }
    }
  }, []);

  return (
    <Modal
      opened={opened}
      onClose={handleModalClose}
      title={
        <Group justify="space-between" align="center">
          <Text>Add Records</Text>
          {loading && <Loader size="sm" />}
        </Group>
      }
      size="lg"
      styles={{
        inner: {
          '@media (max-width: 48em)': {
            padding: 0
          }
        },
        body: {
          '@media (max-width: 48em)': {
            padding: '0.5rem'
          }
        },
        content: {
          '@media (max-width: 48em)': {
            width: '100vw',
            height: '100vh',
            margin: 0,
            maxWidth: 'none',
            maxHeight: 'none'
          }
        }
      }}
    >
      <Stack>
        <Paper withBorder shadow="md" p="md" radius="md">
          <Stack>
            <Tabs 
              defaultValue="barcode" 
              onChange={handleSpotifyTabChange}
            >
              <Tabs.List style={{ flexWrap: 'nowrap' }}>
                <Tabs.Tab 
                  value="barcode" 
                  style={{ 
                    minWidth: 0,
                    padding: '8px 12px'
                  }}
                >
                  Scan
                </Tabs.Tab>
                <Tabs.Tab 
                  value="discogs" 
                  style={{ 
                    minWidth: 0,
                    padding: '8px 12px'
                  }}
                >
                  URL
                </Tabs.Tab>
                <Tabs.Tab 
                  value="search" 
                  style={{ 
                    minWidth: 0,
                    padding: '8px 12px'
                  }}
                >
                  Manual
                </Tabs.Tab>
                <Tabs.Tab 
                  value="spotify" 
                  style={{ 
                    minWidth: 0,
                    padding: '8px 12px'
                  }}
                >
                  Spotify
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="barcode" pt="xs">
                {isScanning ? (
                  <>
                    <BarcodeScanner 
                      key={scannerKey}
                      onScan={handleScan} 
                      isScanning={isScanning} 
                      isLoading={loading}
                    />
                    {barcode && (
                      <>
                        <Text ta="center" size="sm" fw={500} mt="xs">
                          Captured barcode: {barcode}
                        </Text>
                        {loading && (
                          <Box mt="xs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                            <Loader size="sm" />
                            <Text size="sm" c="dimmed">
                              Looking up record in Discogs...
                            </Text>
                          </Box>
                        )}
                      </>
                    )}
                    <Button 
                      color="red" 
                      onClick={() => {
                        setIsScanning(false);
                        setError(null);
                        setSuccess(null);
                      }}
                    >
                      Stop Scanning
                    </Button>
                  </>
                ) : (
                  <Stack>
                    <TextInput
                      label="Barcode"
                      placeholder="Enter or scan barcode"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleManualLookup()}
                      disabled={loading}
                    />
                    <Group grow>
                      <Button 
                        onClick={handleManualLookup} 
                        loading={loading}
                        disabled={!barcode.trim()}
                      >
                        Look up Record
                      </Button>
                      <Button 
                        onClick={() => {
                          setIsScanning(true);
                          setError(null);
                          setSuccess(null);
                        }} 
                        variant="light"
                        disabled={loading}
                      >
                        Start Camera
                      </Button>
                    </Group>
                  </Stack>
                )}
              </Tabs.Panel>

              <Tabs.Panel value="discogs" pt="xs">
                <Stack>
                  <TextInput
                    label="Discogs Release URL"
                    placeholder="https://www.discogs.com/release/123456"
                    value={discogsUrl}
                    onChange={(e) => setDiscogsUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleDiscogsLookup()}
                    disabled={loading}
                  />
                  <Button 
                    onClick={handleDiscogsLookup}
                    loading={loading}
                    disabled={!discogsUrl.trim()}
                  >
                    Look up Release
                  </Button>
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="search" pt="xs">
                <Stack>
                  <TextInput
                    label="Artist"
                    placeholder="Enter artist name"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    disabled={loading}
                  />
                  <TextInput
                    label="Album"
                    placeholder="Enter album name"
                    value={album}
                    onChange={(e) => setAlbum(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleArtistAlbumLookup()}
                    disabled={loading}
                  />
                  <Group>
                    <Button 
                      onClick={handleArtistAlbumLookup}
                      loading={loading}
                      disabled={!artist.trim() || !album.trim()}
                    >
                      Get Record Info
                    </Button>
                    <Button
                      variant="light"
                      onClick={handleAddBasicInfo}
                      disabled={!artist.trim() || !album.trim() || loading}
                    >
                      Add Info Manually
                    </Button>
                    <Button
                      onClick={handleManualSubmit}
                      loading={loading}
                      disabled={!artist.trim() || !album.trim()}
                    >
                      Add to Collection
                    </Button>
                  </Group>
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="spotify" pt="xs">
                <Stack>
                  {loadingSpotify ? (
                    <Stack align="center" gap="md">
                      <Loader size="sm" />
                      <Text c="dimmed" size="sm">Checking Spotify connection...</Text>
                    </Stack>
                  ) : !isSpotifyAuthenticated ? (
                    <Stack align="center" gap="md">
                      <Text c="dimmed" size="sm">Connect your Spotify account to import albums from your playlists</Text>
                      <Button
                        leftSection={<IconBrandSpotify size={20} />}
                        onClick={handleSpotifyAuth}
                        loading={isLoadingSpotifyAuth}
                      >
                        Connect Spotify
                      </Button>
                    </Stack>
                  ) : (
                    <>
                      <Box mb="md">
                        <Text size="sm" mb={5}>Paste a Spotify album/track URL:</Text>
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

                      <Title order={4} mb="md">Add from Playlists</Title>
                      <Select
                        label="Select Playlist"
                        placeholder="Choose a playlist"
                        data={spotifyPlaylists.map(playlist => ({
                          value: playlist.id,
                          label: `${playlist.name} (${playlist.tracks} tracks)`
                        }))}
                        value={selectedPlaylist}
                        onChange={(value) => value && handlePlaylistSelect(value)}
                        searchable
                        withAsterisk={false}
                      />
                      {playlistAlbums.length > 0 && (
                        <Stack>
                          <Text size="sm" fw={500}>Albums in Playlist</Text>
                          <ScrollArea h={300}>
                            {playlistAlbums.map(album => (
                              <Paper
                                key={album.id}
                                withBorder
                                p="xs"
                                mb="xs"
                              >
                                <Group justify="space-between">
                                  <Box>
                                    <Text size="sm" fw={500}>{album.name}</Text>
                                    <Text size="xs" c="dimmed">{album.artist}</Text>
                                    <Text size="xs" c="dimmed">
                                      Released: {new Date(album.release_date).getFullYear()}
                                    </Text>
                                  </Box>
                                  <Button
                                    size="xs"
                                    variant="light"
                                    onClick={() => handleAddSpotifyAlbum(album)}
                                    loading={loading}
                                  >
                                    Add
                                  </Button>
                                </Group>
                              </Paper>
                            ))}
                          </ScrollArea>
                        </Stack>
                      )}
                    </>
                  )}
                  {spotifyError && spotifyError !== 'Not authenticated with Spotify' && (
                    <Alert color="red" title="Error" variant="light">
                      {spotifyError}
                    </Alert>
                  )}
                </Stack>
              </Tabs.Panel>
            </Tabs>

            {loading && (
              <Group justify="center">
                <Button 
                  variant="light" 
                  color="red" 
                  onClick={handleCancel}
                  leftSection={<IconX size={16} />}
                >
                  Cancel Search
                </Button>
              </Group>
            )}

            {error && (
              <Alert color="red" title="Error" variant="light">
                {error}
              </Alert>
            )}

            {success && (
              <Alert color="green" title="Success" variant="light">
                {success}
              </Alert>
            )}

            {showManualForm && (
              <Paper withBorder p="md" mt="md">
                <Stack>
                  <Title order={4}>Additional Information</Title>
                  <Text c="dimmed" size="sm" mb="md">Optional</Text>
                  <TextInput
                    label="Year"
                    type="number"
                    value={manualRecord.year || ''}
                    onChange={(e) => setManualRecord(prev => ({ ...prev, year: parseInt(e.target.value) || undefined }))}
                    disabled={loading}
                  />
                  <TextInput
                    label="Label"
                    value={manualRecord.label || ''}
                    onChange={(e) => setManualRecord(prev => ({ ...prev, label: e.target.value }))}
                    disabled={loading}
                  />
                  <TextInput
                    label="Genres"
                    placeholder="Rock, Jazz, Classical..."
                    description="Separate multiple genres with commas"
                    value={manualRecord.genresText}
                    onChange={(e) => setManualRecord(prev => ({ ...prev, genresText: e.target.value }))}
                    disabled={loading}
                  />
                  <TextInput
                    label="Styles"
                    placeholder="Hard Rock, Fusion, Baroque..."
                    description="Separate multiple styles with commas"
                    value={manualRecord.stylesText}
                    onChange={(e) => setManualRecord(prev => ({ ...prev, stylesText: e.target.value }))}
                    disabled={loading}
                  />
                  <TextInput
                    label="Musicians"
                    placeholder="John Coltrane (Saxophone), Miles Davis (Trumpet)..."
                    description="Separate multiple musicians with commas"
                    value={manualRecord.musiciansText}
                    onChange={(e) => setManualRecord(prev => ({ ...prev, musiciansText: e.target.value }))}
                    disabled={loading}
                  />
                  <Group>
                    <Button
                      variant="light"
                      onClick={() => {
                        setShowManualForm(false);
                        setManualRecord({
                          artist: '',
                          album: '',
                          year: undefined,
                          label: '',
                          genres: [],
                          styles: [],
                          musicians: [],
                          genresText: '',
                          stylesText: '',
                          musiciansText: ''
                        });
                      }}
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            )}

            {record && (
              <Paper withBorder p="md">
                <Stack>
                  <div>
                    <Text fw={500} size="lg">{record.artist} - {record.album}</Text>
                    {record.genres && <Text size="sm">Genres: {record.genres.join(', ')}</Text>}
                    {record.styles && <Text size="sm">Styles: {record.styles.join(', ')}</Text>}
                    {record.musicians && <Text size="sm">Musicians: {record.musicians.join(', ')}</Text>}
                    {record.year && <Text size="sm">Original Release Year: {record.year}</Text>}
                    {record.current_release_year && <Text size="sm">Current Release Year: {record.current_release_year}</Text>}
                    {record.label && <Text size="sm">Label: {record.label}</Text>}
                    <Group gap="xs" mt="xs">
                      {record.master_url && (
                        <Button 
                          component="a" 
                          href={record.master_url} 
                          target="_blank" 
                          variant="light" 
                          size="xs"
                        >
                          View Master
                        </Button>
                      )}
                      {record.current_release_url && (
                        <Button 
                          component="a" 
                          href={record.current_release_url} 
                          target="_blank" 
                          variant="light" 
                          size="xs"
                        >
                          View Release
                        </Button>
                      )}
                    </Group>
                  </div>

                  <Group>
                    <Button 
                      onClick={handleAddToCollection} 
                      loading={loading}
                    >
                      Add to Collection
                    </Button>
                    <Button 
                      variant="light" 
                      onClick={handleClear}
                      disabled={loading}
                    >
                      {isScanning ? 'New Scan' : 'Clear'}
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            )}
          </Stack>
        </Paper>
      </Stack>
    </Modal>
  );
} 

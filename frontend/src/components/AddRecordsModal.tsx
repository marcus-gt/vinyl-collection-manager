import { useState, useEffect, useRef } from 'react';
import { Modal, Title, TextInput, Button, Paper, Stack, Text, Group, Alert, Loader, Box, Tabs, Select, Divider, ScrollArea, Checkbox, MultiSelect, ActionIcon } from '@mantine/core';
import { IconX, IconBrandSpotify } from '@tabler/icons-react';
import { lookup, records, spotify, customColumns as customColumnsApi } from '../services/api';
import type { VinylRecord, CustomColumn } from '../types';
import { BarcodeScanner } from './BarcodeScanner';
import { notifications } from '@mantine/notifications';

interface AddRecordsModalProps {
  opened: boolean;
  onClose: () => void;
}

interface ManualRecordForm {
  artist: string;
  album: string;
  year?: number;
  label?: string;
  genres: string[];
  styles: string[];
  musicians: string[];
  genresText: string;
  stylesText: string;
  musiciansText: string;
}

export function AddRecordsModal({ opened, onClose }: AddRecordsModalProps) {
  const [barcode, setBarcode] = useState('');
  const [discogsUrl, setDiscogsUrl] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [urlOrBarcode, setUrlOrBarcode] = useState(''); // Unified field for URL or barcode
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [success, setSuccess] = useState<string | undefined>(undefined);
  const [record, setRecord] = useState<VinylRecord | undefined>(undefined);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerKey, setScannerKey] = useState(0);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualRecord, setManualRecord] = useState<ManualRecordForm>({
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
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<Array<{
    id: string;
    name: string;
    tracks: number;
  }>>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | undefined>(undefined);
  const [loadingSpotify, setLoadingSpotify] = useState(false);
  const [isSpotifyAuthenticated, setIsSpotifyAuthenticated] = useState(false);
  const [isLoadingSpotifyAuth, setIsLoadingSpotifyAuth] = useState(false);
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [subscribedPlaylist, setSubscribedPlaylist] = useState<{
    playlist_id: string;
    playlist_name: string;
    last_checked_at: string;
  } | undefined>(undefined);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [playlistAlbums, setPlaylistAlbums] = useState<Array<{
    id: string;
    name: string;
    artist: string;
    release_date: string;
    total_tracks: number;
    image_url: string | null;
  }>>([]);
  const [modalContent, setModalContent] = useState<{
    title: string;
    content: React.ReactNode;
  } | undefined>(undefined);
  const [showModal, setShowModal] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [recordsChanged, setRecordsChanged] = useState(false);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);

  // Reset state when modal is opened
  useEffect(() => {
    if (opened) {
      console.log('Modal opened, resetting states');
      setBarcode('');
      setDiscogsUrl('');
      setArtist('');
      setAlbum('');
      setUrlOrBarcode('');
      setError(undefined);
      setSuccess(undefined);
      setRecord(undefined);
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
      setSelectedPlaylist(undefined);
      setLoadingSpotify(false);
      setIsSpotifyAuthenticated(false);
      console.log('States reset complete');
    }
  }, [opened]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = undefined;
      }
    };
  }, []);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = undefined;
      setLoading(false);
      setError('Search aborted');
    }
  };

  // Add useEffect to load custom columns
  useEffect(() => {
    const loadCustomColumns = async () => {
      try {
        const response = await customColumnsApi.getAll();
        if (response.success && response.data) {
          setCustomColumns(response.data);
        }
      } catch (err) {
        console.error('Failed to load custom columns:', err);
      }
    };
    loadCustomColumns();
  }, []);

  // Helper function to get default values
  const getRecordWithDefaults = (recordData: VinylRecord) => {
    const customValues: Record<string, string> = {};
    
    // Add default values from custom columns
    customColumns.forEach(column => {
      if (column.defaultValue) {
        customValues[column.id] = column.defaultValue;
      }
    });

    return {
      ...recordData,
      custom_values_cache: customValues
    };
  };

  const handleScan = async (scannedBarcode: string) => {
    setBarcode(scannedBarcode);
    setUrlOrBarcode(scannedBarcode); // Also populate unified field
    setLoading(true);
    setError(undefined);
    setSuccess(undefined);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await lookup.byBarcode(scannedBarcode, abortControllerRef.current.signal);
      if (response.success && response.data) {
        setRecord(getRecordWithDefaults(response.data));
        setError(undefined);
      } else {
        setError(response.error || 'Failed to find record');
        setRecord(undefined);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError('Failed to lookup barcode');
      setRecord(undefined);
    } finally {
      if (abortControllerRef.current) {
        abortControllerRef.current = undefined;
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
    setError(undefined);
    setSuccess(undefined);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await lookup.byBarcode(barcode, abortControllerRef.current.signal);
      if (response.success && response.data) {
        setRecord(getRecordWithDefaults(response.data));
        setError(undefined);
      } else {
        setError(response.error || 'Failed to find record');
        setRecord(undefined);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError('Failed to lookup barcode');
      setRecord(undefined);
    } finally {
      if (abortControllerRef.current) {
        abortControllerRef.current = undefined;
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
    setError(undefined);
    setSuccess(undefined);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await lookup.byDiscogsUrl(discogsUrl, abortControllerRef.current.signal);
      if (response.success && response.data) {
        setRecord(getRecordWithDefaults(response.data));
        setError(undefined);
      } else {
        setError(response.error || 'Failed to find record');
        setRecord(undefined);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError('Failed to lookup Discogs release');
      setRecord(undefined);
    } finally {
      if (abortControllerRef.current) {
        abortControllerRef.current = undefined;
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
    setError(undefined);
    setSuccess(undefined);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await lookup.byArtistAlbum(artist, album, abortControllerRef.current.signal);
      if (response.success && response.data) {
        setRecord(getRecordWithDefaults(response.data));
        setError(undefined);
      } else {
        setError("Couldn't find record");
        setRecord(undefined);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError("Couldn't find record");
      setRecord(undefined);
    } finally {
      if (abortControllerRef.current) {
        abortControllerRef.current = undefined;
      }
      setLoading(false);
    }
  };

  // Unified search handler that detects input type and routes accordingly
  const handleUnifiedSearch = async () => {
    // Priority 1: URL or Barcode field
    if (urlOrBarcode.trim()) {
      const input = urlOrBarcode.trim();
      
      // Detect Discogs URL
      if (input.includes('discogs.com')) {
        if (!input.includes('discogs.com/release/') && !input.includes('discogs.com/master/')) {
          setError('Invalid Discogs URL. Please use a release or master URL');
          return;
        }
        setDiscogsUrl(input);
        await handleDiscogsLookupDirect(input);
        return;
      }
      
      // Detect Spotify URL
      if (input.includes('spotify.com')) {
        setSpotifyUrl(input);
        await handleSpotifyUrlLookupDirect(input);
        return;
      }
      
      // Detect Barcode (sequence of numbers)
      if (/^\d+$/.test(input)) {
        setBarcode(input);
        await handleBarcodeLookupDirect(input);
        return;
      }
      
      setError('Invalid input. Please enter a Discogs URL, Spotify URL, or numeric barcode');
      return;
    }
    
    // Priority 2: Artist + Album (both required)
    if (artist.trim() && album.trim()) {
      await handleArtistAlbumLookup();
      return;
    }
    
    // No valid input
    setError('Please enter either a URL/barcode OR both artist and album name');
  };

  // Direct lookup handlers (without state dependencies)
  const handleBarcodeLookupDirect = async (barcodeValue: string) => {
    setLoading(true);
    setError(undefined);
    setSuccess(undefined);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await lookup.byBarcode(barcodeValue, abortControllerRef.current.signal);
      if (response.success && response.data) {
        setRecord(getRecordWithDefaults(response.data));
        setError(undefined);
      } else {
        setError(response.error || 'Failed to find record');
        setRecord(undefined);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError('Failed to lookup barcode');
      setRecord(undefined);
    } finally {
      if (abortControllerRef.current) {
        abortControllerRef.current = undefined;
      }
      setLoading(false);
    }
  };

  const handleDiscogsLookupDirect = async (url: string) => {
    setLoading(true);
    setError(undefined);
    setSuccess(undefined);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await lookup.byDiscogsUrl(url, abortControllerRef.current.signal);
      if (response.success && response.data) {
        setRecord(getRecordWithDefaults(response.data));
        setError(undefined);
      } else {
        setError(response.error || 'Failed to find record');
        setRecord(undefined);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError('Failed to lookup Discogs release');
      setRecord(undefined);
    } finally {
      if (abortControllerRef.current) {
        abortControllerRef.current = undefined;
      }
      setLoading(false);
    }
  };

  const handleSpotifyUrlLookupDirect = async (url: string) => {
    setLoading(true);
    setError(undefined);
    setSuccess(undefined);
    
    abortControllerRef.current = new AbortController();
    
    try {
      // First, get album info from Spotify
      const spotifyResponse = await spotify.getAlbumFromUrlPublic(url, abortControllerRef.current.signal);
      if (!spotifyResponse.success || !spotifyResponse.data) {
        setError(spotifyResponse.error || 'Failed to find album on Spotify');
        setRecord(undefined);
        return;
      }
      
      // Extract artist and album from Spotify data
      const { artist: spotifyArtist, album: spotifyAlbum } = spotifyResponse.data;
      
      // Then use that info to search Discogs
      const discogsResponse = await lookup.byArtistAlbum(
        spotifyArtist, 
        spotifyAlbum, 
        abortControllerRef.current.signal
      );
      
      if (discogsResponse.success && discogsResponse.data) {
        setRecord(getRecordWithDefaults(discogsResponse.data));
        setError(undefined);
      } else {
        setError(`Found on Spotify: ${spotifyArtist} - ${spotifyAlbum}, but couldn't find on Discogs`);
        setRecord(undefined);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError('Failed to lookup album');
      setRecord(undefined);
    } finally {
      if (abortControllerRef.current) {
        abortControllerRef.current = undefined;
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
    setError(undefined);
    setSuccess(undefined);
    
    try {
      const recordToSubmit: VinylRecord = {
        artist: manualRecord.artist,
        album: manualRecord.album,
        genres: [],           // Required but can be empty
        styles: [],           // Required but can be empty
        musicians: [],        // Required but can be empty
        added_from: 'manual', // Required
        custom_values_cache: {}, // Required but can be empty
        // Optional fields
        year: manualRecord.year,
        label: manualRecord.label,
        master_url: undefined,
        current_release_url: undefined
      };

      if (!recordToSubmit.artist || !recordToSubmit.album) {
        setError('Artist and album are required');
        return;
      }

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
        setRecord(undefined);
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
          setSuccess(undefined);
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
    setError(undefined);
    setSuccess(undefined);
    
    try {
      // Create a record with custom values
      const recordData: VinylRecord = {
        artist: record.artist,
        album: record.album,
        year: record.year,
        current_release_year: record.current_release_year,
        barcode: record.barcode,
        genres: record.genres || [],
        styles: record.styles || [],
        musicians: record.musicians || [],
        master_url: record.master_url || undefined,
        master_format: record.master_format,
        current_release_url: record.current_release_url || undefined,
        current_release_format: record.current_release_format,
        label: record.label,
        country: record.country,
        added_from: record.added_from || 'manual',
        // Use the custom values from the record, not empty object
        custom_values_cache: record.custom_values_cache
      };

      console.log('Adding record with custom values:', recordData);
      const response = await records.add(recordData);

      if (response.success) {
        setSuccess('Added to collection!');
        setRecordsChanged(true);
        setRecord(undefined);
        setBarcode('');
        setScannerKey(prev => prev + 1);
        setTimeout(() => setSuccess(undefined), 3000);
      } else {
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
    setRecord(undefined);
    setBarcode('');
    setError(undefined);
    setSuccess(undefined);
    setScannerKey(prev => prev + 1);
  };

  const handleSpotifyAuth = async () => {
    setIsLoadingSpotifyAuth(true);
    setError(undefined);
    try {
      console.log('Getting Spotify auth URL...');
      const response = await spotify.getAuthUrl();
      
      if (!response.success) {
        console.error('Failed to get auth URL:', response.error);
        setError(response.error || 'Failed to get Spotify authorization URL');
        return;
      }
      
      if (!response.data?.auth_url) {
        console.error('No auth URL in response:', response);
        setError('Invalid response from server');
        return;
      }

      window.location.href = response.data.auth_url;
    } catch (err) {
      console.error('Failed to start Spotify authorization:', err);
      setError('Failed to start Spotify authorization');
    } finally {
      setIsLoadingSpotifyAuth(false);
    }
  };

  const checkSpotifyAuth = async () => {
    setLoadingSpotify(true);
    setError(undefined);
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
      loadSubscribedPlaylist();
    }
  };

  const handleSpotifyUrlLookup = async () => {
    if (!spotifyUrl) return;
    
    setLoading(true);
    setError(undefined);
    setSuccess(undefined);
    
    try {
      const result = await spotify.getAlbumFromUrl(spotifyUrl);
      if (result.success && result.data) {
        setRecord({
          artist: result.data.artist,
          album: result.data.name,
          genres: [],
          styles: [],
          musicians: [],
          added_from: 'spotify',
          custom_values_cache: {},
          master_url: undefined,
          current_release_url: undefined
        });
        setSpotifyUrl('');
        setError(undefined);
      } else if (result.needs_auth) {
        setIsSpotifyAuthenticated(false);
      } else {
        setError(result.error || 'Failed to get album information');
      }
    } catch (err) {
      setError('Failed to lookup album');
    } finally {
      setLoading(false);
    }
  };

  // Add useEffect to check if Spotify authentication is forcing syncs
  useEffect(() => {
    if (opened) {
      // Check for any URL parameters that might be part of a Spotify auth flow
      const urlParams = new URLSearchParams(window.location.search);
      const spotifyCode = urlParams.get('code');
      
      if (spotifyCode) {
        console.log('Detected Spotify auth code - clearing URL to prevent auth loops');
        // Clear URL parameters without refreshing the page to avoid auth loops
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [opened]);

  // Update the useEffect to handle Spotify auth callback
  useEffect(() => {
    // Check for Spotify callback code
    const urlParams = new URLSearchParams(window.location.search);
    const spotifyCode = urlParams.get('code');
    const returnPath = localStorage.getItem('spotify_auth_return_path');
    
    if (spotifyCode) {
      console.log('Processing Spotify auth callback');
      // Clear the URL parameters without triggering navigation
      window.history.replaceState({}, document.title, window.location.pathname);
      // Clear stored return path
      localStorage.removeItem('spotify_auth_return_path');
      
      // Add a delay before loading playlists to avoid race conditions with auth context
      setTimeout(() => {
        // Load playlists since we just authenticated
        checkSpotifyAuth();
        
        // Return to previous location if available, but only if not already on the correct page
        if (returnPath && window.location.pathname !== returnPath) {
          window.location.href = returnPath;
        }
      }, 2000);
    }
  }, []);

  // Add function to load subscribed playlist
  const loadSubscribedPlaylist = async () => {
    try {
      const response = await spotify.getSubscribedPlaylist();
      if (response.success && response.data) {
        setSubscribedPlaylist(response.data);
      } else {
        setSubscribedPlaylist(undefined);
      }
    } catch (err) {
      console.error('Failed to load subscribed playlist:', err);
      setSubscribedPlaylist(undefined);
    }
  };

  // Add subscription handling
  const handleSubscribe = async (playlistId: string) => {
    setIsSubscribing(true);
    try {
      const playlist = spotifyPlaylists.find(p => p.id === playlistId);
      if (!playlist) return;

      const response = await spotify.subscribeToPlaylist(playlist.id, playlist.name);
      if (response.success) {
        notifications.show({
          title: 'Success',
          message: `Subscribed to playlist: ${playlist.name}`,
          color: 'green'
        });
        await loadSubscribedPlaylist();
      } else {
        notifications.show({
          title: 'Error',
          message: response.error || 'Failed to subscribe to playlist',
          color: 'red'
        });
      }
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: 'Failed to subscribe to playlist',
        color: 'red'
      });
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleUnsubscribe = async () => {
    setIsSubscribing(true);
    try {
      const response = await spotify.unsubscribeFromPlaylist();
      if (response.success) {
        notifications.show({
          title: 'Success',
          message: 'Unsubscribed from playlist',
          color: 'green'
        });
        setSubscribedPlaylist(undefined);
        setSelectedPlaylist(undefined);
      } else {
        notifications.show({
          title: 'Error',
          message: response.error || 'Failed to unsubscribe from playlist',
          color: 'red'
        });
      }
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: 'Failed to unsubscribe from playlist',
        color: 'red'
      });
    } finally {
      setIsSubscribing(false);
    }
  };

  const handlePlaylistSelect = async (value: string | null, _item?: any) => {
    // Convert null to undefined for our internal state
    setSelectedPlaylist(value ?? undefined);
    
    if (!value) {
      setPlaylistAlbums([]);
      return;
    }

    setLoadingSpotify(true);
    setError(undefined);
    try {
      const response = await spotify.getPlaylistTracks(value);
      if (response.success && response.data) {
        setPlaylistAlbums(response.data);
      } else {
        setError(response.error || 'Failed to load playlist tracks');
      }
    } catch (err) {
      setError('Failed to load playlist tracks');
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
    setError(undefined);
    setSuccess(undefined);
    
    try {
      const lookupResponse = await lookup.byArtistAlbum(album.artist, album.name);
      if (lookupResponse.success && lookupResponse.data) {
        // For spotify_list_sub, keep master_url only
        const recordData: VinylRecord = {
          ...lookupResponse.data,
          added_from: 'spotify_list',  // Force 'spotify_list' as the source
          master_url: lookupResponse.data.master_url || undefined,
          current_release_url: undefined  // Always null for spotify_list
        };
        const response = await records.add(recordData);
        if (response.success) {
          setSuccess('Added to collection!');
          setRecordsChanged(true);
          notifications.show({
            title: 'Success',
            message: 'Record added to collection',
            color: 'green'
          });
        } else {
          setError(response.error || 'Failed to add record');
          notifications.show({
            title: 'Error',
            message: response.error || 'Failed to add record',
            color: 'red'
          });
        }
      } else {
        setError(lookupResponse.error || 'Failed to find album in Discogs');
        notifications.show({
          title: 'Error',
          message: lookupResponse.error || 'Failed to find album in Discogs',
          color: 'red'
        });
      }
    } catch (err) {
      console.error('Error adding album:', err);
      setError('Failed to add record');
      notifications.show({
        title: 'Error',
        message: 'Failed to add record',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSyncPlaylists = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await spotify.syncPlaylists();
      if (response.success && response.data) {
        const { added_albums, failed_lookups, total_added } = response.data;
        const total_failed = failed_lookups?.length || 0;

        // Show notification
        notifications.show({
          title: 'Sync Complete',
          message: total_added > 0 
            ? `Added ${total_added} albums to your collection${total_failed > 0 ? ` (${total_failed} not found)` : ''}`
            : 'No new albums to add',
          color: total_added > 0 ? 'green' : 'blue'
        });

        // Show modal with details if there are any results
        if (total_added > 0 || total_failed > 0) {
          setModalContent({
            title: total_added > 0 
              ? `Added ${total_added} albums${total_failed > 0 ? ` (${total_failed} not found)` : ''}`
              : 'Sync Results',
            content: (
              <Stack>
                {added_albums.length > 0 && (
                  <>
                    <Text fw={500}>Successfully Added:</Text>
                    {added_albums.map((album, index) => (
                      <Text key={index} size="sm">
                        {album.artist} - {album.album}
                      </Text>
                    ))}
                  </>
                )}
                
                {failed_lookups && failed_lookups.length > 0 && (
                  <>
                    <Divider my="sm" label={`${failed_lookups.length} Albums Not Found`} labelPosition="center" />
                    <Text c="dimmed" size="sm" mb="xs">
                      The following albums couldn't be found in Discogs:
                    </Text>
                    {failed_lookups.map((failed, index) => (
                      <Text key={`failed-${index}`} size="sm" c="dimmed">
                        {failed.artist} - {failed.album}
                      </Text>
                    ))}
                  </>
                )}
              </Stack>
            )
          });
          setShowModal(true);
          setRecordsChanged(true);
        }
      } else {
        setError(response.error || 'Failed to sync playlists');
      }
    } catch (err) {
      console.error('Error syncing playlists:', err);
      setError('Failed to sync playlists');
    } finally {
      setLoading(false);
    }
  };

  const handleSpotifyDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const response = await spotify.disconnectSpotify();
      if (response.success) {
        setIsSpotifyAuthenticated(false);
        setSelectedPlaylist(undefined);
        setPlaylistAlbums([]);
        notifications.show({
          title: 'Success',
          message: 'Spotify disconnected successfully',
          color: 'green'
        });
      } else {
        notifications.show({
          title: 'Error',
          message: response.error || 'Failed to disconnect Spotify',
          color: 'red'
        });
      }
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: 'Failed to disconnect Spotify',
        color: 'red'
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <>
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
                defaultValue="add" 
                onChange={handleSpotifyTabChange}
              >
                <Tabs.List style={{ flexWrap: 'nowrap' }}>
                  <Tabs.Tab 
                    value="add" 
                    style={{ 
                      minWidth: 0,
                      padding: '8px 12px'
                    }}
                  >
                    Add Record
                  </Tabs.Tab>
                  <Tabs.Tab 
                    value="spotify" 
                    style={{ 
                      minWidth: 0,
                      padding: '8px 12px'
                    }}
                  >
                    Spotify Playlists
                  </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="add" pt="xs">
                  {isScanning ? (
                    <>
                      <BarcodeScanner 
                        key={scannerKey}
                        onScan={handleScan} 
                        isScanning={isScanning} 
                        isLoading={loading}
                      />
                      {urlOrBarcode && (
                        <>
                          <Text ta="center" size="sm" fw={500} mt="xs">
                            Captured barcode: {urlOrBarcode}
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
                          setError(undefined);
                          setSuccess(undefined);
                        }}
                        fullWidth
                      >
                        Stop Scanning
                      </Button>
                    </>
                  ) : (
                    <Stack>
                      <TextInput
                        label="URL or Barcode"
                        placeholder="Discogs URL, Spotify URL, or numeric barcode"
                        description={urlOrBarcode.trim() && artist.trim() && album.trim() ? "⚠️ URL/Barcode will be used (has priority over artist/album)" : undefined}
                        value={urlOrBarcode}
                        onChange={(e) => setUrlOrBarcode(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleUnifiedSearch()}
                        disabled={loading}
                        rightSection={
                          urlOrBarcode ? (
                            <ActionIcon
                              onClick={() => setUrlOrBarcode('')}
                              variant="subtle"
                              color="gray"
                              size="sm"
                              disabled={loading}
                            >
                              <IconX size={16} />
                            </ActionIcon>
                          ) : null
                        }
                      />
                      
                      <Divider label="OR" labelPosition="center" />
                      
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
                        onKeyDown={(e) => e.key === 'Enter' && handleUnifiedSearch()}
                        disabled={loading}
                      />
                      
                      <Group grow>
                        <Button 
                          onClick={() => {
                            setIsScanning(true);
                            setError(undefined);
                            setSuccess(undefined);
                          }} 
                          variant="light"
                          disabled={loading}
                        >
                          Start Camera
                        </Button>
                        <Button 
                          onClick={handleUnifiedSearch} 
                          loading={loading}
                          disabled={!urlOrBarcode.trim() && (!artist.trim() || !album.trim())}
                        >
                          Search
                        </Button>
                      </Group>
                    </Stack>
                  )}
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
                            />
                            <Button
                              onClick={handleSpotifyUrlLookup}
                              disabled={!spotifyUrl}
                            >
                              Lookup
                            </Button>
                          </Group>
                        </Box>
                        <Divider my="md" />

                        <Title order={4} mb="md">Browse Playlists</Title>
                        <Select
                          label="Select Playlist"
                          placeholder="Choose a playlist to view albums"
                          data={spotifyPlaylists.map(playlist => ({
                            value: playlist.id,
                            label: `${playlist.name} (${playlist.tracks} tracks)`
                          }))}
                          value={selectedPlaylist}
                          onChange={handlePlaylistSelect}
                          searchable
                          clearable
                        />

                        {playlistAlbums.length > 0 && (
                          <Stack mt="md">
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
                          </Stack>
                        )}

                        <Divider my="xl" label="Or Subscribe to a Playlist" labelPosition="center" />

                        <Title order={4} mb="md">Playlist Subscription</Title>
                        <Text size="sm" c="dimmed" mb="md">
                          Subscribe to a playlist to automatically import new albums when they're added.
                        </Text>

                        {loadingSpotify ? (
                          <Stack align="center" gap="md">
                            <Loader size="sm" />
                            <Text c="dimmed" size="sm">Loading playlists...</Text>
                          </Stack>
                        ) : (
                          <>
                            {subscribedPlaylist ? (
                              <Paper withBorder p="md" mb="md">
                                <Stack>
                                  <Group justify="space-between">
                                    <div>
                                      <Text size="sm" fw={500}>Currently Subscribed</Text>
                                      <Text size="sm">{subscribedPlaylist.playlist_name}</Text>
                                      <Text size="xs" c="dimmed">
                                        Last checked: {new Date(subscribedPlaylist.last_checked_at).toLocaleString()}
                                      </Text>
                                    </div>
                                    <Stack gap="xs">
                                      <Button
                                        variant="light"
                                        size="xs"
                                        onClick={handleSyncPlaylists}
                                        loading={loading}
                                      >
                                        Sync Now
                                      </Button>
                                      <Button
                                        variant="light"
                                        color="red"
                                        size="xs"
                                        onClick={handleUnsubscribe}
                                        loading={isSubscribing}
                                      >
                                        Unsubscribe
                                      </Button>
                                    </Stack>
                                  </Group>
                                </Stack>
                              </Paper>
                            ) : (
                              <Select
                                label="Select Playlist to Subscribe"
                                placeholder="Choose a playlist"
                                data={spotifyPlaylists.map(playlist => ({
                                  value: playlist.id,
                                  label: `${playlist.name} (${playlist.tracks} tracks)`
                                }))}
                                value={selectedPlaylist}
                                onChange={(value) => value && handleSubscribe(value)}
                                searchable
                                clearable
                                disabled={isSubscribing}
                              />
                            )}
                            <Text size="xs" c="dimmed" mt={5}>
                              {subscribedPlaylist 
                                ? 'New albums added to this playlist will be automatically imported into your collection.'
                                : 'Select a playlist to automatically import new albums when they are added.'}
                            </Text>
                          </>
                        )}

                        {isSpotifyAuthenticated && (
                          <Group justify="flex-end" mb="md">
                            <Button
                              variant="light"
                              color="red"
                              onClick={handleSpotifyDisconnect}
                              loading={isDisconnecting}
                            >
                              Disconnect Spotify
                            </Button>
                          </Group>
                        )}
                      </>
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
                      {record.master_format && <Text size="sm">Original Format: {record.master_format}</Text>}
                      {record.current_release_year && <Text size="sm">Current Release Year: {record.current_release_year}</Text>}
                      {record.current_release_format && <Text size="sm">Current Release Format: {record.current_release_format}</Text>}
                      {record.label && <Text size="sm">Label: {record.label}</Text>}
                      {record.country && <Text size="sm">Country: {record.country}</Text>}
                      
                      {/* Add custom column preview */}
                      {customColumns.length > 0 && record.custom_values_cache && (
                        <>
                          <Divider my="sm" label="Custom Fields" labelPosition="center" />
                          {customColumns.map(column => {
                            const value = record.custom_values_cache[column.id];
                            if (!value) return null;

                            // Format display value based on column type
                            if (column.type === 'boolean') {
                              return (
                                <Box key={column.id} mt="xs">
                                  <Group gap="xs">
                                    <Text size="sm" fw={500}>{column.name}:</Text>
                                    <Checkbox
                                      checked={value === 'true'}
                                      onChange={(e) => {
                                        const newValue = e.currentTarget.checked.toString();
                                        setRecord(prev => prev ? {
                                          ...prev,
                                          custom_values_cache: {
                                            ...prev.custom_values_cache,
                                            [column.id]: newValue
                                          }
                                        } : undefined);
                                      }}
                                      size="sm"
                                    />
                                  </Group>
                                </Box>
                              );
                            } else if (column.type === 'single-select' || column.type === 'multi-select') {
                              // For multi-select, split by comma
                              const values = column.type === 'multi-select' ? value.split(',') : [value];
                              return (
                                <Box key={column.id} mt="xs">
                                  <Text size="sm" fw={500} mb={4}>{column.name}:</Text>
                                  {column.type === 'single-select' ? (
                                    <Select
                                      data={column.options || []}
                                      value={value}
                                      onChange={(newValue) => {
                                        setRecord(prev => prev ? {
                                          ...prev,
                                          custom_values_cache: {
                                            ...prev.custom_values_cache,
                                            [column.id]: newValue || ''
                                          }
                                        } : undefined);
                                      }}
                                      size="xs"
                                      clearable
                                      styles={{
                                        input: {
                                          minHeight: '28px'
                                        }
                                      }}
                                    />
                                  ) : (
                                    <MultiSelect
                                      data={column.options || []}
                                      value={values}
                                      onChange={(newValues) => {
                                        setRecord(prev => prev ? {
                                          ...prev,
                                          custom_values_cache: {
                                            ...prev.custom_values_cache,
                                            [column.id]: newValues.join(',')
                                          }
                                        } : undefined);
                                      }}
                                      size="xs"
                                      clearable
                                      styles={{
                                        input: {
                                          minHeight: '28px'
                                        }
                                      }}
                                    />
                                  )}
                                </Box>
                              );
                            } else if (column.type === 'number') {
                              return (
                                <Box key={column.id} mt="xs">
                                  <Text size="sm" fw={500} mb={4}>{column.name}:</Text>
                                  <TextInput
                                    type="number"
                                    value={value}
                                    onChange={(e) => {
                                      setRecord(prev => prev ? {
                                        ...prev,
                                        custom_values_cache: {
                                          ...prev.custom_values_cache,
                                          [column.id]: e.target.value
                                        }
                                      } : undefined);
                                    }}
                                    size="xs"
                                    styles={{
                                      input: {
                                        minHeight: '28px'
                                      }
                                    }}
                                  />
                                </Box>
                              );
                            }

                            return (
                              <Box key={column.id} mt="xs">
                                <Text size="sm" fw={500} mb={4}>{column.name}:</Text>
                                <TextInput
                                  value={value}
                                  onChange={(e) => {
                                    setRecord(prev => prev ? {
                                      ...prev,
                                      custom_values_cache: {
                                        ...prev.custom_values_cache,
                                        [column.id]: e.target.value
                                      }
                                    } : undefined);
                                  }}
                                  size="xs"
                                  styles={{
                                    input: {
                                      minHeight: '28px'
                                    }
                                  }}
                                />
                              </Box>
                            );
                          })}
                        </>
                      )}

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

      {/* Add Results Modal */}
      <Modal
        opened={showModal}
        onClose={() => setShowModal(false)}
        title={modalContent?.title || ''}
        size="md"
      >
        {modalContent?.content}
      </Modal>
    </>
  );
} 

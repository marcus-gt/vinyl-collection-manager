import { useState, useEffect, useRef } from 'react';
import { Modal, Title, TextInput, Button, Paper, Stack, Text, Group, Alert, Loader, Box, Tabs } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { lookup, records } from '../services/api';
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
  const [recordsAdded, setRecordsAdded] = useState(false);
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

  // Reset state when modal is opened
  useEffect(() => {
    if (opened) {
      setBarcode('');
      setDiscogsUrl('');
      setArtist('');
      setAlbum('');
      setError(null);
      setSuccess(null);
      setRecord(null);
      setIsScanning(false);
      setShowManualForm(false);
      setRecordsAdded(false);
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
    if (recordsAdded) {
      // Only trigger table refresh if records were added
      window.dispatchEvent(new CustomEvent('refresh-table-data'));
    }
    onClose();
  };

  const handleManualSubmit = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const recordToSubmit = {
        ...manualRecord,
        genres: manualRecord.genresText?.split(',').map(g => g.trim()).filter(Boolean) || [],
        styles: manualRecord.stylesText?.split(',').map(s => s.trim()).filter(Boolean) || [],
        musicians: manualRecord.musiciansText?.split(',').map(m => m.trim()).filter(Boolean) || []
      };

      const { genresText, stylesText, musiciansText, ...submitData } = recordToSubmit;

      const response = await records.add(submitData);
      if (response.success) {
        setSuccess('Added to collection!');
        setRecordsAdded(true);
        // Reset form
        setArtist('');
        setAlbum('');
        setRecord(null);
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
        // Clear success message after delay
        setTimeout(() => {
          setSuccess(null);
        }, 3000);
      } else {
        setError(response.error || 'Failed to add to collection');
      }
    } catch (err) {
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

      const response = await records.add(recordData);
      if (response.success) {
        setSuccess('Added to collection!');
        setRecordsAdded(true);
        // Reset for next scan
        setRecord(null);
        setBarcode('');
        setScannerKey(prev => prev + 1);
        // Clear success message after delay
        setTimeout(() => {
          setSuccess(null);
        }, 3000);
      } else {
        setError(response.error || 'Failed to add to collection');
      }
    } catch (err) {
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
            <Tabs defaultValue="barcode">
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
                      Add Manually
                    </Button>
                  </Group>
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
                      onClick={handleManualSubmit}
                      loading={loading}
                    >
                      Add to Collection
                    </Button>
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

import { useState, useEffect, useRef } from 'react';
import { Container, Title, TextInput, Button, Paper, Stack, Text, Group, Alert, Loader, Box, Table, ScrollArea, Tabs } from '@mantine/core';
import { IconExternalLink, IconX } from '@tabler/icons-react';
import { lookup, records } from '../services/api';
import type { VinylRecord } from '../types';
import { BarcodeScanner } from '../components/BarcodeScanner';

export function Scanner() {
  const [barcode, setBarcode] = useState('');
  const [discogsUrl, setDiscogsUrl] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [record, setRecord] = useState<VinylRecord | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerKey, setScannerKey] = useState(0); // Used to reset scanner state
  const [recentRecords, setRecentRecords] = useState<VinylRecord[]>([]);
  const [showManualForm, setShowManualForm] = useState(false);
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

  useEffect(() => {
    loadRecentRecords();
    return () => {
      // Cleanup: abort any pending requests when component unmounts
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const loadRecentRecords = async () => {
    try {
      const response = await records.getAll();
      if (response.success && response.data) {
        // Sort by created_at and take the last 5
        const sorted = [...response.data].sort((a, b) => 
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        ).slice(0, 5);
        setRecentRecords(sorted);
      }
    } catch (err) {
      console.error('Error loading recent records:', err);
    }
  };

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
    
    // Create new AbortController for this request
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
        // Request was cancelled, already handled
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
    
    // Create new AbortController for this request
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
        // Request was cancelled, already handled
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

    // Validate URL format
    if (!discogsUrl.includes('discogs.com/release/') && !discogsUrl.includes('discogs.com/master/')) {
      setError('Invalid Discogs URL. Please use a release or master URL (e.g., https://www.discogs.com/release/123456 or https://www.discogs.com/master/123456)');
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    // Create new AbortController for this request
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
        // Request was cancelled, already handled
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
    
    // Create new AbortController for this request
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
        // Request was cancelled, already handled
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
    
    // Set the initial values in the manual record
    setManualRecord({
      artist: artist.trim(),  // We'll still store these but won't show input fields
      album: album.trim(),    // We'll use the values from the search form
      year: undefined,
      label: '',
      genres: [],
      styles: [],
      musicians: [],
      genresText: '',
      stylesText: '',
      musiciansText: ''
    });
    
    // Show the manual form
    setShowManualForm(true);
  };

  const handleManualSubmit = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Ensure all required fields are present
      const recordData: VinylRecord = {
        artist: manualRecord.artist || '',  // Provide default value
        album: manualRecord.album || '',    // Provide default value
        year: manualRecord.year,
        genres: manualRecord.genres || [],
        styles: manualRecord.styles || [],
        musicians: manualRecord.musicians || [],
        master_url: undefined,
        current_release_url: undefined,
        label: manualRecord.label,
        country: undefined,
        added_from: 'manual',
        custom_values_cache: {}  // Required empty object
      };

      const response = await records.add(recordData);
      if (response.success) {
        setSuccess('Added to collection!');
        // Refresh recent records
        await loadRecentRecords();
        // Reset fields
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
      console.log('Starting add to collection...', {
        recordData: record,
        timestamp: new Date().toISOString()
      });

      const recordData: VinylRecord = {
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
        label: record.label,
        country: record.country,
        added_from: record.added_from || 'manual',
        custom_values_cache: {}  // Required empty object
      };

      console.log('Prepared record data:', recordData);
      
      const response = await records.add(recordData);
      console.log('Add record response:', response);

      if (response.success) {
        setSuccess('Added to collection!');
        // Refresh recent records
        await loadRecentRecords();
        // Reset for next scan
        setRecord(null);
        setBarcode('');
        // Reset scanner state to allow new scan
        setScannerKey(prev => prev + 1);
      } else {
        console.error('Failed to add record:', response.error);
        setError(response.error || 'Failed to add to collection');
        // Add retry logic
        if (response.error?.includes('security policy')) {
          console.log('Detected security policy error, retrying in 1 second...');
          setTimeout(async () => {
            try {
              console.log('Retrying add to collection...');
              const retryResponse = await records.add(recordData);
              if (retryResponse.success) {
                setSuccess('Added to collection!');
                await loadRecentRecords();
                setRecord(null);
                setBarcode('');
                setScannerKey(prev => prev + 1);
                setError(null);
              } else {
                console.error('Retry failed:', retryResponse.error);
                setError('Failed to add to collection after retry');
              }
            } catch (retryErr) {
              console.error('Retry error:', retryErr);
              setError('Failed to add to collection after retry');
            }
          }, 1000);
        }
      }
    } catch (err) {
      console.error('Error adding to collection:', {
        error: err,
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
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
    // Reset scanner state to allow new scan
    setScannerKey(prev => prev + 1);
  };

  return (
    <Container 
      fluid 
      px={{ base: 'xs', sm: 'md' }}
    >
      <Box maw={600} mx="auto">
        <Title ta="center" mb="xl">Add Records</Title>

        <Paper withBorder shadow="md" p="md" radius="md" mb="xl">
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
      </Box>

      {recentRecords.length > 0 && (
        <Paper withBorder shadow="md" p="md" radius="md">
          <Title order={3} mb="md">Last 5 Scans</Title>
          <ScrollArea>
            <Table striped highlightOnHover verticalSpacing="xs" style={{ minWidth: 700 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ whiteSpace: 'nowrap' }}>Artist</Table.Th>
                  <Table.Th style={{ whiteSpace: 'nowrap' }}>Album</Table.Th>
                  <Table.Th style={{ whiteSpace: 'nowrap' }}>Label</Table.Th>
                  <Table.Th w={80} style={{ whiteSpace: 'nowrap' }}>Year</Table.Th>
                  <Table.Th w={80} style={{ whiteSpace: 'nowrap' }}>Release</Table.Th>
                  <Table.Th w={120} style={{ whiteSpace: 'nowrap' }}>Links</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {recentRecords.map((record) => (
                  <Table.Tr key={record.id}>
                    <Table.Td style={{ maxWidth: '150px' }}>
                      <Text lineClamp={1} title={record.artist}>
                        {record.artist}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ maxWidth: '150px' }}>
                      <Text lineClamp={1} title={record.album}>
                        {record.album}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ maxWidth: '120px' }}>
                      <Text lineClamp={1} title={record.label || '-'}>
                        {record.label || '-'}
                      </Text>
                    </Table.Td>
                    <Table.Td>{record.year || '-'}</Table.Td>
                    <Table.Td>{record.current_release_year || '-'}</Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        {record.master_url && (
                          <Button
                            component="a"
                            href={record.master_url}
                            target="_blank"
                            variant="subtle"
                            size="compact-xs"
                            px={4}
                            rightSection={<IconExternalLink size={12} />}
                          >
                            M
                          </Button>
                        )}
                        {record.current_release_url && (
                          <Button
                            component="a"
                            href={record.current_release_url}
                            target="_blank"
                            variant="subtle"
                            size="compact-xs"
                            px={4}
                            rightSection={<IconExternalLink size={12} />}
                          >
                            R
                          </Button>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      )}
    </Container>
  );
}

export default Scanner; 

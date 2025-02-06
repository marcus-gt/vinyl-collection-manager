import { useState, useEffect } from 'react';
import { Container, Title, TextInput, Button, Paper, Stack, Text, Group, Alert, Loader, Box, Table, ScrollArea, Tabs } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { lookup, records } from '../services/api';
import type { VinylRecord } from '../types';
import { BarcodeScanner } from '../components/BarcodeScanner';

export function Scanner() {
  const [barcode, setBarcode] = useState('');
  const [discogsUrl, setDiscogsUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [record, setRecord] = useState<VinylRecord | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerKey, setScannerKey] = useState(0); // Used to reset scanner state
  const [recentRecords, setRecentRecords] = useState<VinylRecord[]>([]);

  useEffect(() => {
    loadRecentRecords();
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

  const handleScan = async (scannedBarcode: string) => {
    setBarcode(scannedBarcode);
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await lookup.byBarcode(scannedBarcode);
      if (response.success && response.data) {
        setRecord(response.data);
        setError(null);
      } else {
        setError(response.error || 'Failed to find record');
        setRecord(null);
      }
    } catch (err) {
      setError('Failed to lookup barcode');
      setRecord(null);
    } finally {
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
    
    try {
      const response = await lookup.byBarcode(barcode);
      if (response.success && response.data) {
        setRecord(response.data);
        setError(null);
      } else {
        setError(response.error || 'Failed to find record');
        setRecord(null);
      }
    } catch (err) {
      setError('Failed to lookup barcode');
      setRecord(null);
    } finally {
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
    
    try {
      const response = await lookup.byDiscogsUrl(discogsUrl);
      if (response.success && response.data) {
        setRecord(response.data);
        setError(null);
      } else {
        setError(response.error || 'Failed to find record');
        setRecord(null);
      }
    } catch (err) {
      setError('Failed to lookup Discogs release');
      setRecord(null);
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
        <Title ta="center" mb="xl">Add Record to Collection</Title>

        <Paper withBorder shadow="md" p="md" radius="md" mb="xl">
          <Stack>
            <Tabs defaultValue="barcode">
              <Tabs.List>
                <Tabs.Tab value="barcode">Scan Barcode</Tabs.Tab>
                <Tabs.Tab value="discogs">Discogs Link</Tabs.Tab>
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
                  <>
                    <Group grow>
                      <TextInput
                        label="Barcode"
                        placeholder="Enter or scan barcode"
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleManualLookup()}
                        disabled={loading}
                      />
                    </Group>
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
                  </>
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
            </Tabs>

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

import { useEffect, useState, useMemo } from 'react';
import { Container, Title, TextInput, Button, Group, Stack, Text, ActionIcon, Modal, Tooltip, Popover, Box, Badge, Checkbox } from '@mantine/core';
import { IconTrash, IconExternalLink, IconDownload, IconX, IconSearch, IconFilter, IconPlus } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { records, customColumns as customColumnsApi } from '../services/api';
import type { VinylRecord, CustomColumn, CustomColumnValue } from '../types';
import { CustomColumnManager } from '../components/CustomColumnManager';
import { AddRecordsModal } from '../components/AddRecordsModal';
import { useDebouncedCallback } from 'use-debounce';
import { PILL_COLORS } from '../types';
import { ResizableTable } from '../components/ResizableTable';
import { SortingState, ColumnDef, Row } from '@tanstack/react-table';

const PAGE_SIZE = 40;

// Create a service for custom values
const customValuesService = {
  getForRecord: async (recordId: string): Promise<{ success: boolean; data?: CustomColumnValue[] }> => {
    try {
      const response = await fetch(`/api/records/${recordId}/custom-values`, {
        method: 'GET',
        credentials: 'include'
      });
      const data = await response.json();
      return data;
    } catch (err) {
      console.error(`Failed to get custom values for record ${recordId}:`, err);
      return { success: false };
    }
  },
  update: async (recordId: string, values: Record<string, string>): Promise<{ success: boolean }> => {
    try {
      const response = await fetch(`/api/records/${recordId}/custom-values`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(values)
      });
      const data = await response.json();
      return data;
    } catch (err) {
      console.error(`Failed to update custom values for record ${recordId}:`, err);
      return { success: false };
    }
  },
  getAllForRecords: async (recordIds: string[]): Promise<Record<string, CustomColumnValue[]>> => {
    try {
      const results: Record<string, CustomColumnValue[]> = {};
      // Fetch custom values for each record in parallel
      await Promise.all(recordIds.map(async (recordId) => {
        const response = await customValuesService.getForRecord(recordId);
        if (response.success && response.data) {
          results[recordId] = response.data;
        }
      }));
      return results;
    } catch (err) {
      console.error('Failed to load custom values for records:', err);
      return {};
    }
  }
};

function Collection() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userRecords, setUserRecords] = useState<VinylRecord[]>([]);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRecord, setEditingRecord] = useState<VinylRecord | null>(null);
  const [editingNotes, setEditingNotes] = useState('');
  const [sortStatus, setSortStatus] = useState<SortingState>([{ id: 'artist', desc: false }]);
  const [addRecordsModalOpened, setAddRecordsModalOpened] = useState(false);
  const [customColumnManagerOpened, setCustomColumnManagerOpened] = useState(false);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);

  useEffect(() => {
    loadRecords();
    loadCustomColumns();

    // Add event listeners for data updates
    const handleCustomValuesUpdate = () => {
      console.log('Custom values update event received');
      loadRecords();
    };

    const handleTableRefresh = () => {
      console.log('Table refresh event received, reloading records...');
      loadRecords();
      loadCustomColumns();
      console.log('Records reload initiated');
    };

    const handleExportCSV = () => {
      console.log('Export CSV event received');
      handleDownloadCSV();
    };

    // Add event listeners
    window.addEventListener('custom-values-updated', handleCustomValuesUpdate);
    window.addEventListener('vinyl-collection-table-refresh', handleTableRefresh);
    window.addEventListener('export-collection-csv', handleExportCSV);

    // Cleanup function
    return () => {
      console.log('Removing event listeners');
      window.removeEventListener('custom-values-updated', handleCustomValuesUpdate);
      window.removeEventListener('vinyl-collection-table-refresh', handleTableRefresh);
      window.removeEventListener('export-collection-csv', handleExportCSV);
    };
  }, []);

  const loadRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('=== Loading Records and Custom Values ===');
      const response = await records.getAll();
      
      if (response.success && response.data) {
        // First, get all record IDs
        const recordIds = response.data.map(record => record.id!).filter(Boolean);
        console.log(`Found ${recordIds.length} records, fetching their custom values...`);

        // Fetch custom values for all records in parallel
        const customValuesPromises = recordIds.map(id => customValuesService.getForRecord(id));
        const customValuesResponses = await Promise.all(customValuesPromises);
        
        // Create a map of record ID to custom values
        const customValuesMap = new Map<string, Record<string, string>>();
        customValuesResponses.forEach((cvResponse, index) => {
          if (cvResponse.success && cvResponse.data) {
            const recordId = recordIds[index];
            const values: Record<string, string> = {};
            cvResponse.data.forEach(cv => {
              values[cv.column_id] = cv.value;
            });
            customValuesMap.set(recordId, values);
          }
        });

        console.log('Custom values map:', Object.fromEntries(customValuesMap));

        // Merge custom values into records
        const recordsWithCustomValues = response.data.map(record => ({
          ...record,
          customValues: customValuesMap.get(record.id!) || {}
        }));

        console.log('Records with custom values:', recordsWithCustomValues);
        setUserRecords(recordsWithCustomValues);
      } else {
        setError(response.error || 'Failed to load records');
      }
    } catch (err) {
      console.error('Error loading records:', err);
      setError(err instanceof Error ? err.message : 'Failed to load records');
    } finally {
      setLoading(false);
    }
  };

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

  const handleUpdateNotes = async () => {
    if (!editingRecord?.id) return;
    
    setLoading(true);
    try {
      const response = await records.updateNotes(editingRecord.id, editingNotes);
      if (response.success && response.data) {
        setUserRecords(prevRecords => 
          prevRecords.map(record => 
            record.id === editingRecord.id ? response.data! : record
          )
        );
        setEditingRecord(null);
        notifications.show({
          title: 'Success',
          message: 'Notes updated successfully',
          color: 'green'
        });
      } else {
        setError(response.error || 'Failed to update notes');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update notes');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (record: VinylRecord) => {
    console.log('Delete initiated for record:', record);
    
    if (!record.id) {
      console.error('No record ID found:', record);
      return;
    }

    if (!window.confirm('Are you sure you want to delete this record?')) {
      console.log('Delete cancelled by user');
      return;
    }

    console.log('Starting delete process for record ID:', record.id);
    setLoading(true);
    try {
      // First load fresh data to ensure we have the latest state
      const currentData = await records.getAll();
      console.log('Current data from server:', currentData);
      
      if (currentData.success && currentData.data) {
        setUserRecords(currentData.data);
      }

      console.log('Calling delete API...');
      const response = await records.delete(record.id);
      console.log('Delete API response:', response);
      
      if (response.success) {
        console.log('Delete successful, reloading data...');
        // Reload the full data after successful deletion
        const refreshedData = await records.getAll();
        console.log('Refreshed data:', refreshedData);
        
        if (refreshedData.success && refreshedData.data) {
          setUserRecords(refreshedData.data);
          notifications.show({
            title: 'Success',
            message: 'Record deleted successfully',
            color: 'green'
          });
        } else {
          console.error('Failed to reload data after deletion');
          notifications.show({
            title: 'Warning',
            message: 'Record may have been deleted but failed to refresh data',
            color: 'yellow'
          });
        }
      } else {
        console.error('Delete failed:', response.error);
        setError(response.error || 'Failed to delete record');
        notifications.show({
          title: 'Error',
          message: response.error || 'Failed to delete record',
          color: 'red'
        });
      }
    } catch (err) {
      console.error('Error during delete:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete record';
      setError(errorMessage);
      notifications.show({
        title: 'Error',
        message: errorMessage,
        color: 'red'
      });
    } finally {
      setLoading(false);
      console.log('Delete process completed');
    }
  };

  const handleDownloadCSV = () => {
    // Define standard headers
    const standardHeaders = [
      'Artist',
      'Album',
      'Original Year',
      'Label',
      'Genres',
      'Styles',
      'Musicians',
      'Added',
      'Scanned Release Year',
      'Master URL',
      'Release URL'
    ];

    // Add custom column headers
    const customHeaders = customColumns.map(col => col.name);
    const headers = [...standardHeaders, ...customHeaders];

    // Convert records to CSV rows
    const rows = userRecords.map(record => {
      // Standard fields
      const standardFields = [
      record.artist,
      record.album,
      record.year || '',
      record.label || '',
      record.genres?.join('; ') || '',
      record.styles?.join('; ') || '',
      record.musicians?.join('; ') || '',
      record.created_at ? new Date(record.created_at).toLocaleString() : '',
      record.current_release_year || '',
      record.master_url || '',
      record.current_release_url || ''
      ];

      // Custom fields
      const customFields = customColumns.map(col => 
        record.customValues?.[col.id] || ''
      );

      return [...standardFields, ...customFields];
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => 
        row.map(cell => 
          // Escape quotes and wrap in quotes if contains comma or newline
          typeof cell === 'string' && (cell.includes(',') || cell.includes('\n') || cell.includes('"')) 
            ? `"${cell.replace(/"/g, '""')}"` 
            : cell
        ).join(',')
      )
    ].join('\n');

    // Create blob and trigger save dialog
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const defaultFileName = `vinyl-collection-${new Date().toISOString().split('T')[0]}.csv`;
    
    const downloadFile = () => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = defaultFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    // Try to use the modern File System Access API
    if ('showSaveFilePicker' in window) {
      (window as any).showSaveFilePicker({
        suggestedName: defaultFileName,
        types: [{
          description: 'CSV File',
          accept: { 'text/csv': ['.csv'] },
        }],
      })
        .then((handle: any) => handle.createWritable())
        .then((writable: any) => writable.write(blob).then(() => writable.close()))
        .catch((err: Error) => {
          // Fallback to traditional method if user cancels or there's an error
          if (err.name !== 'AbortError') {
            downloadFile();
          }
        });
    } else {
      // Fallback for browsers that don't support showSaveFilePicker
      downloadFile();
    }
  };

  const tableColumns = useMemo(() => {
    const standardColumns: ColumnDef<VinylRecord>[] = [
            { 
              id: 'artist',
              accessorKey: 'artist', 
              header: 'Artist', 
              enableSorting: true,
              size: 200,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <Popover width={400} position="bottom-start" withArrow shadow="md">
                  <Popover.Target>
                    <Text size="sm" lineClamp={1} style={{ cursor: 'pointer' }} title={row.original.artist}>
                      {row.original.artist}
                    </Text>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                      {row.original.artist}
                    </Text>
                  </Popover.Dropdown>
                </Popover>
              )
            },
            { 
              id: 'album',
              accessorKey: 'album', 
              header: 'Album', 
              enableSorting: true,
              size: 250,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <Popover width={400} position="bottom-start" withArrow shadow="md">
                  <Popover.Target>
                    <Text size="sm" lineClamp={1} style={{ cursor: 'pointer' }} title={row.original.album}>
                      {row.original.album}
                    </Text>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                      {row.original.album}
                    </Text>
                  </Popover.Dropdown>
                </Popover>
              )
            },
            { 
              id: 'year',
              accessorKey: 'year', 
              header: 'Original Year',
              enableSorting: true,
              size: 80,
            },
            { 
              id: 'label', 
              accessorKey: 'label', 
              header: 'Label', 
              enableSorting: true,
              size: 150,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <Popover width={400} position="bottom-start" withArrow shadow="md">
                  <Popover.Target>
                    <Text size="sm" lineClamp={1} style={{ cursor: 'pointer' }} title={row.original.label || '-'}>
                      {row.original.label || '-'}
                    </Text>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                      {row.original.label || '-'}
                    </Text>
                  </Popover.Dropdown>
                </Popover>
              )
            },
            { 
              id: 'genres', 
              accessorKey: 'genres', 
              header: 'Genres', 
              enableSorting: true,
              size: 150,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => {
                const genres = row.original.genres?.join(', ') || '-';
                return (
                  <Popover width={400} position="bottom-start" withArrow shadow="md">
                    <Popover.Target>
                      <Text size="sm" lineClamp={1} style={{ cursor: 'pointer' }} title={genres}>
                        {genres}
                      </Text>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <Text size="sm" style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                        {genres}
                      </Text>
                    </Popover.Dropdown>
                  </Popover>
                );
              }
            },
            { 
              id: 'styles', 
              accessorKey: 'styles', 
              header: 'Styles', 
              enableSorting: true,
              size: 180,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => {
                const styles = row.original.styles?.join(', ') || '-';
                return (
                  <Popover width={400} position="bottom-start" withArrow shadow="md">
                    <Popover.Target>
                      <Text size="sm" lineClamp={1} style={{ cursor: 'pointer' }} title={styles}>
                        {styles}
                      </Text>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <Text size="sm" style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                        {styles}
                      </Text>
                    </Popover.Dropdown>
                  </Popover>
                );
              }
            },
            { 
              id: 'musicians', 
              accessorKey: 'musicians', 
              header: 'Musicians', 
              enableSorting: true,
              size: 200,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => {
                const musicians = row.original.musicians?.join(', ') || '-';
                return musicians === '-' ? (
                  <Text size="sm">-</Text>
                ) : (
                  <Popover width={400} position="bottom-start" withArrow shadow="md">
                    <Popover.Target>
                      <Text size="sm" lineClamp={1} style={{ cursor: 'pointer' }} title={musicians}>
                        {musicians}
                      </Text>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <Text size="sm" style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                        {musicians}
                      </Text>
                    </Popover.Dropdown>
                  </Popover>
                );
              }
            },
            { 
              id: 'created_at', 
              accessorKey: 'created_at', 
              header: 'Added', 
              enableSorting: true,
              size: 150,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => row.original.created_at ? 
                new Date(row.original.created_at).toLocaleDateString() : '-'
            },
            { 
              id: 'current_release_year', 
              accessorKey: 'current_release_year', 
              header: 'Scanned Release Year', 
              enableSorting: true, 
              size: 100,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => row.original.current_release_year || '-'
            },
            {
              id: 'added_from',
              accessorKey: 'added_from',
              header: 'Source',
              enableSorting: true,
              size: 160,
              enableResizing: true,
              minSize: 160,
              maxSize: 200,
              meta: {
                type: 'single-select',
                options: [
                  'Manual',
                  'Spotify URL',
                  'Spotify List Manual',
                  'Spotify List Auto',
                  'Barcode',
                  'Discogs'
                ],
                valueMap: {
                  'manual': 'Manual',
                  'spotify': 'Spotify URL',
                  'spotify_list': 'Spotify List Manual',
                  'spotify_list_sub': 'Spotify List Auto',
                  'barcode': 'Barcode',
                  'discogs_url': 'Discogs'
                },
                labelMap: {
                  'Manual': 'manual',
                  'Spotify URL': 'spotify',
                  'Spotify List Manual': 'spotify_list',
                  'Spotify List Auto': 'spotify_list_sub',
                  'Barcode': 'barcode',
                  'Discogs': 'discogs_url'
                },
                option_colors: {
                  'Manual': 'gray',
                  'Spotify URL': 'green',
                  'Spotify List Manual': 'green',
                  'Spotify List Auto': 'green',
                  'Barcode': 'blue',
                  'Discogs': 'orange'
                }
              },
              filterFn: (row: Row<VinylRecord>, columnId: string, filterValue: string) => {
                const cellValue = row.getValue(columnId);
                // Use hardcoded map for filter values
                const labelMap: Record<string, string> = {
                  'Manual': 'manual',
                  'Spotify URL': 'spotify',
                  'Spotify List Manual': 'spotify_list',
                  'Spotify List Auto': 'spotify_list_sub',
                  'Barcode': 'barcode',
                  'Discogs': 'discogs_url'
                };
                const internalValue = labelMap[filterValue];
                console.log('Filter comparison:', { cellValue, filterValue, internalValue, labelMap });
                return cellValue === internalValue;
              },
              enableColumnFilter: true,
              cell: ({ row }: { row: Row<VinylRecord> }) => {
                const source = row.original.added_from;
                const displayMap: Record<string, string> = {
                  'manual': 'Manual',
                  'spotify': 'Spotify URL',
                  'spotify_list': 'Spotify List Manual',
                  'spotify_list_sub': 'Spotify List Auto',
                  'barcode': 'Barcode',
                  'discogs_url': 'Discogs'
                };
                const colorMap: Record<string, string> = {
                  'manual': 'gray',
                  'spotify': 'green',
                  'spotify_list': 'green',
                  'spotify_list_sub': 'green',
                  'barcode': 'blue',
                  'discogs_url': 'orange'
                };
                
                const displayText = source ? displayMap[source] || source : '-';
                const color = source ? colorMap[source] : undefined;
                
                return (
                  <Box style={{ position: 'relative' }}>
                    <Text size="sm" lineClamp={1} style={{ cursor: 'default', maxWidth: '90vw' }}>
                      {source ? (
                        <Badge
                          variant="filled"
                          size="sm"
                          radius="sm"
                          color={color}
                          styles={{
                            root: {
                              textTransform: 'none',
                              cursor: 'default',
                              padding: '3px 8px'
                            }
                          }}
                        >
                          {displayText}
                        </Badge>
                      ) : (
                        <Text size="sm" c="dimmed">-</Text>
                      )}
                    </Text>
                  </Box>
                );
              }
            },
            {
              id: 'links',
              accessorKey: 'links',
              header: 'Links',
              size: 130,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <Group gap="xs">
                  {row.original.master_url && (
                    <Tooltip label="View Master Release">
                      <ActionIcon 
                        component="a" 
                        href={row.original.master_url} 
                        target="_blank" 
                        variant="light" 
                        size="sm"
                      >
                        <IconExternalLink size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  {row.original.current_release_url && (
                    <Tooltip label="View Scanned Release">
                      <ActionIcon 
                        component="a" 
                        href={row.original.current_release_url} 
                        target="_blank" 
                        variant="light" 
                        size="sm"
                        color="blue"
                      >
                        <IconExternalLink size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              ),
            },
    ];

    // Add custom columns
    const customColumnDefs: ColumnDef<VinylRecord>[] = customColumns.map(column => ({
      id: `custom_${column.id}`,
      accessorKey: `customValues.${column.id}`,
      header: column.name,
      enableSorting: true,
      size: column.type === 'boolean' ? 50 : // Smaller width for boolean columns
            column.type === 'multi-select' ? 300 : 
            ['text'].includes(column.type) ? 300 : 150,
      enableResizing: true,
      minSize: column.type === 'boolean' ? 50 : 100, // Smaller min width for boolean
      maxSize: column.type === 'boolean' ? 100 : 1000, // Smaller max width for boolean
      meta: { 
        type: column.type,
        options: column.options,
        option_colors: column.option_colors
      },
      filterFn: column.type === 'multi-select' ? 'arrIncludes' : 
                column.type === 'single-select' ? 'equals' : 
                undefined,
      enableColumnFilter: column.type === 'multi-select' || column.type === 'single-select',
      cell: ({ row }: { row: Row<VinylRecord> }) => {
        const [localValue, setLocalValue] = useState(row.original.customValues?.[column.id] || '');
        
        // Effect to sync local value with record value
        useEffect(() => {
          setLocalValue(row.original.customValues?.[column.id] || '');
        }, [row.original.customValues, column.id]);
        
        const debouncedUpdate = useDebouncedCallback(async (newValue: string) => {
          if (!row.original.id) return;
          
          try {
            console.log('Updating custom value:', {
              columnId: column.id,
              newValue,
              recordId: row.original.id
            });
            
            // For the API, we need to send an object with column_id as key and value as value
            const valueToSend = {
              [column.id]: newValue
            };

            const response = await customValuesService.update(row.original.id, valueToSend);
            
            if (response.success) {
              // Update the record in the local state
              setUserRecords(prevRecords =>
                prevRecords.map(r =>
                  r.id === row.original.id
                    ? {
                        ...r,
                        customValues: {
                          ...r.customValues,
                          [column.id]: newValue
                        }
                      }
                    : r
                )
              );
              console.log('Successfully updated custom value');
            } else {
              console.error('Failed to update custom value');
              notifications.show({
                title: 'Error',
                message: 'Failed to update value',
                color: 'red'
              });
              // Revert local value on error
              setLocalValue(row.original.customValues?.[column.id] || '');
            }
          } catch (err) {
            console.error('Error updating custom value:', err);
            notifications.show({
              title: 'Error',
              message: 'Failed to update value',
              color: 'red'
            });
            // Revert local value on error
            setLocalValue(row.original.customValues?.[column.id] || '');
          }
        }, 1000);  // 1 second debounce

        const handleChange = (value: string) => {
          setLocalValue(value);  // Update UI immediately
          debouncedUpdate(value);  // Debounce the API call
        };

        if (column.type === 'boolean') {
          return (
            <Box style={{ 
              width: '100%', 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              height: '32px' // Match the row height
            }}>
              <Checkbox
                checked={localValue === 'true'}
                onChange={(e) => handleChange(e.currentTarget.checked.toString())}
                size="sm"
                styles={{
                  input: {
                    cursor: 'pointer'
                  }
                }}
              />
            </Box>
          );
        }

        if (column.type === 'multi-select' && column.options) {
          const values = localValue ? localValue.split(',') : [];
          const [opened, setOpened] = useState(false);
          
          return (
            <Box style={{ position: 'relative' }}>
              <Popover width={400} position="bottom" withArrow shadow="md" opened={opened} onChange={setOpened}>
                <Popover.Target>
                  <Text size="sm" style={{ cursor: 'pointer' }} onClick={() => setOpened(true)}>
                    {values.length === 0 ? (
                      <Text size="sm" c="dimmed">-</Text>
                    ) : (
                      <Box style={{ 
                        position: 'relative',
                        height: '48px',  // Increased height for two lines
                        overflow: 'hidden'
                      }}>
                        <Group gap={4} wrap="nowrap" style={{ 
                          height: '100%',
                          alignItems: 'center',
                          padding: '4px'  // Add some padding around the tags
                        }}>
                          {values.map((value: string) => (
                            <Badge
                              key={value}
                              variant="filled"
                              size="sm"
                              radius="sm"
                              color={column.option_colors?.[value] || PILL_COLORS.default}
                              styles={{
                                root: {
                                  textTransform: 'none',
                                  cursor: 'default',
                                  padding: '3px 8px',
                                  whiteSpace: 'nowrap',
                                  display: 'inline-flex',
                                  flexShrink: 0,
                                  height: '20px',  // Fixed height for badges
                                  lineHeight: '14px'  // Proper line height for text
                                }
                              }}
                            >
                              {value}
                            </Badge>
                          ))}
                        </Group>
                      </Box>
                    )}
                  </Text>
                </Popover.Target>
                <Popover.Dropdown>
                  <Stack gap="xs">
                    <Group justify="space-between" align="center">
                      <Text size="sm" fw={500}>Edit {column.name}</Text>
                      <ActionIcon size="sm" variant="subtle" onClick={() => setOpened(false)}>
                        <IconX size={16} />
                      </ActionIcon>
                    </Group>
                    <Group gap="xs" wrap="wrap">
                      {(column.options || []).map((opt) => {
                        const isSelected = values.includes(opt);
                        return (
                          <Badge
                            key={opt}
                            variant="filled"
                            size="sm"
                            radius="sm"
                            color={column.option_colors?.[opt] || PILL_COLORS.default}
                            styles={{
                              root: {
                                textTransform: 'none',
                                cursor: 'pointer',
                                padding: '3px 8px',
                                opacity: isSelected ? 1 : 0.3
                              }
                            }}
                            onClick={() => {
                              const newValues = isSelected
                                ? values.filter((v: string) => v !== opt)
                                : [...values, opt];
                              handleChange(newValues.join(','));
                            }}
                          >
                            {opt}
                          </Badge>
                        );
                      })}
                    </Group>
                  </Stack>
                </Popover.Dropdown>
              </Popover>
            </Box>
          );
        }
        
        if (column.type === 'single-select' && column.options) {
          const [opened, setOpened] = useState(false);

          return (
            <Box style={{ position: 'relative' }}>
              <Popover width={400} position="bottom" withArrow shadow="md" opened={opened} onChange={setOpened}>
                <Popover.Target>
                  <Text size="sm" lineClamp={1} style={{ cursor: 'pointer', maxWidth: '90vw' }} onClick={() => setOpened(true)}>
                    {localValue ? (
                      <Badge
                        variant="filled"
                        size="sm"
                        radius="sm"
                        color={column.option_colors?.[localValue] || PILL_COLORS.default}
                        styles={{
                          root: {
                            textTransform: 'none',
                            cursor: 'default',
                            padding: '3px 8px'
                          }
                        }}
                      >
                        {localValue}
                      </Badge>
                    ) : (
                      <Text size="sm" c="dimmed">-</Text>
                    )}
                  </Text>
                </Popover.Target>
                <Popover.Dropdown>
                  <Stack gap="xs">
                    <Group justify="space-between" align="center">
                      <Text size="sm" fw={500}>Edit {column.name}</Text>
                      <ActionIcon size="sm" variant="subtle" onClick={() => setOpened(false)}>
                        <IconX size={16} />
                      </ActionIcon>
                    </Group>
                    <Group gap="xs" wrap="wrap">
                      {column.options.map((opt) => (
                        <Badge
                          key={opt}
                          variant="filled"
                          size="sm"
                          radius="sm"
                          color={column.option_colors?.[opt] || PILL_COLORS.default}
                          styles={{
                            root: {
                              textTransform: 'none',
                              cursor: 'pointer',
                              padding: '3px 8px',
                              opacity: localValue === opt ? 1 : 0.5
                            }
                          }}
                          onClick={() => {
                            if (localValue === opt) {
                              // Deselect if clicking the currently selected option
                              handleChange('');
                            } else {
                              // Select the new option
                              handleChange(opt);
                            }
                            setOpened(false);
                          }}
                        >
                          {opt}
                        </Badge>
                      ))}
                    </Group>
                  </Stack>
                </Popover.Dropdown>
              </Popover>
            </Box>
          );
        }
        
        if (column.type === 'number') {
          const [opened, setOpened] = useState(false);
          
          const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') {
              setOpened(false);
            }
            if (e.key === 'Escape') {
              setOpened(false);
            }
          };

          return (
            <Box style={{ position: 'relative' }}>
              <Popover width={400} position="bottom" withArrow shadow="md" opened={opened} onChange={setOpened}>
                <Popover.Target>
                  <Text size="sm" lineClamp={1} style={{ cursor: 'pointer', maxWidth: '90vw' }} onClick={() => setOpened(true)}>
                    {localValue || '-'}
                  </Text>
                </Popover.Target>
                <Popover.Dropdown>
                  <Stack gap="xs">
                    <Group justify="space-between" align="center">
                      <Text size="sm" fw={500}>Edit {column.name}</Text>
                      <ActionIcon size="sm" variant="subtle" onClick={() => setOpened(false)}>
                        <IconX size={16} />
                      </ActionIcon>
                    </Group>
                    <TextInput
                      size="sm"
                      type="number"
                      value={localValue}
                      onChange={(e) => handleChange(e.target.value)}
                      placeholder={`Enter ${column.name.toLowerCase()}`}
                      styles={{
                        input: {
                          minHeight: '36px'
                        },
                        root: {
                          maxWidth: '90vw'
                        }
                      }}
                      onKeyDown={handleKeyDown}
                    />
                  </Stack>
                </Popover.Dropdown>
              </Popover>
            </Box>
          );
        }
        
        // Default text input
        const [opened, setOpened] = useState(false);
        
        const handleKeyDown = (e: React.KeyboardEvent) => {
          if (e.key === 'Enter') {
            setOpened(false);
          }
          if (e.key === 'Escape') {
            setOpened(false);
          }
        };

        return (
          <Box style={{ position: 'relative' }}>
            <Popover width={400} position="bottom" withArrow shadow="md" opened={opened} onChange={setOpened}>
              <Popover.Target>
                <Text size="sm" lineClamp={1} style={{ cursor: 'pointer', maxWidth: '90vw' }} onClick={() => setOpened(true)}>
                  {localValue || '-'}
                </Text>
              </Popover.Target>
              <Popover.Dropdown>
                <Stack gap="xs">
                  <Group justify="space-between" align="center">
                    <Text size="sm" fw={500}>Edit {column.name}</Text>
                    <ActionIcon size="sm" variant="subtle" onClick={() => setOpened(false)}>
                      <IconX size={16} />
                    </ActionIcon>
                  </Group>
                  <TextInput
                    size="sm"
                    value={localValue}
                    onChange={(e) => handleChange(e.target.value)}
                    placeholder={`Enter ${column.name.toLowerCase()}`}
                    styles={{
                      input: {
                        minHeight: '36px'
                      },
                      root: {
                        maxWidth: '90vw'
                      }
                    }}
                    onKeyDown={handleKeyDown}
                  />
                </Stack>
              </Popover.Dropdown>
            </Popover>
          </Box>
        );
      }
    }));

    // Add actions column last
    const actionsColumn: ColumnDef<VinylRecord> = {
      id: 'actions',
      accessorKey: 'actions',
      header: '', // Empty header
      size: 50, // Reduced from 100 to 50
      enableResizing: true,
      minSize: 50, // Reduced from 100 to 50
      maxSize: 100,
      cell: ({ row }: { row: Row<VinylRecord> }) => (
        <Box style={{ 
          width: '100%', 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center'
        }}>
                  <Tooltip label="Delete">
                    <ActionIcon 
                      color="red" 
                      variant="light"
                      size="sm"
              onClick={(e) => {
                e.stopPropagation();
                console.log('Delete clicked for record:', row.original);
                handleDelete(row.original);
              }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
        </Box>
      ),
    };

    return [...standardColumns, ...customColumnDefs, actionsColumn];
  }, [customColumns]);

  return (
    <Container size="xl" py="xl" mt={60}>
      <Stack>
        <Group justify="space-between" align="center" mb="md" style={{
          borderBottom: '1px solid var(--mantine-color-dark-4)',
          background: 'var(--mantine-color-dark-7)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          padding: 'var(--mantine-spacing-md)'
        }}>
          <Title>Collection Overview</Title>
          <Group>
            <TextInput
              placeholder="Search records..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              style={{ width: 300 }}
              leftSection={<IconSearch size={16} />}
              rightSection={
                searchQuery ? (
                  <ActionIcon size="sm" onClick={() => {
                    setSearchQuery('');
                    setPage(1);
                  }}>
                    <IconX size={16} />
                  </ActionIcon>
                ) : null
              }
            />
            <Button
              variant="light"
              onClick={() => setAddRecordsModalOpened(true)}
              leftSection={<IconPlus size={16} />}
            >
              Add Records
            </Button>
            <Button
              variant="light"
              onClick={() => setCustomColumnManagerOpened(true)}
              leftSection={<IconFilter size={16} />}
            >
              Manage Columns
            </Button>
            <Button
              variant="light"
              leftSection={<IconDownload size={16} />}
              onClick={handleDownloadCSV}
              disabled={userRecords.length === 0}
            >
              Export CSV
            </Button>
          </Group>
        </Group>

        {error && (
          <Text c="red">{error}</Text>
        )}

        <ResizableTable
          data={userRecords}
          columns={tableColumns}
          sortState={sortStatus}
          onSortChange={setSortStatus}
          tableId="collection-table"
          loading={loading}
          recordsPerPage={PAGE_SIZE}
          page={page}
          onPageChange={setPage}
          customColumns={customColumns}
          searchQuery={searchQuery}
        />

        <CustomColumnManager
          opened={customColumnManagerOpened}
          onClose={() => {
            setCustomColumnManagerOpened(false);
            loadCustomColumns();
          }}
        />

        <AddRecordsModal
          opened={addRecordsModalOpened}
          onClose={() => {
            setAddRecordsModalOpened(false);
            loadRecords();
          }}
        />

        <Modal
          opened={!!editingRecord}
          onClose={() => setEditingRecord(null)}
          title="Edit Notes"
          size="md"
        >
          <Stack>
            {editingRecord && (
              <Text size="sm" fw={500}>
                {editingRecord.artist} - {editingRecord.album}
              </Text>
            )}
            <TextInput
              label="Notes"
              value={editingNotes}
              onChange={(e) => setEditingNotes(e.target.value)}
              placeholder="Add notes about this record..."
              size="sm"
              styles={{
                input: {
                  minHeight: '36px'
                }
              }}
            />
            <Group justify="flex-end">
              <Button variant="light" onClick={() => setEditingRecord(null)} size="sm">
                Cancel
              </Button>
              <Button onClick={handleUpdateNotes} loading={loading} size="sm">
                Save
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
}

export default Collection; 

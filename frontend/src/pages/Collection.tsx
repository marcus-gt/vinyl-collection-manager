import { useEffect, useState, useMemo } from 'react';
import { TextInput, Button, Group, Stack, Text, ActionIcon, Modal, Tooltip, Box, Badge, Popover } from '@mantine/core';
import { IconTrash, IconExternalLink, IconSearch, IconPlus, IconColumns } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { records, customColumns as customColumnsApi } from '../services/api';
import type { VinylRecord, CustomColumn, CustomColumnValue } from '../types';
import { CustomColumnManager } from '../components/CustomColumnManager';
import { AddRecordsModal } from '../components/AddRecordsModal';
import { ResizableTable } from '../components/ResizableTable';
import { SortingState, ColumnDef, Row } from '@tanstack/react-table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CustomValueCell } from '../components/CustomValueCell';

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

// Add type for column meta
interface CustomColumnMeta {
  customColumn?: CustomColumn;
}

type ColumnWithMeta<T> = ColumnDef<T, unknown> & {
  meta?: CustomColumnMeta;
};

// Type the mutation variables
interface CustomValueMutation {
  recordId: string;
  values: Record<string, string>;
}

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
  const queryClient = useQueryClient();

  // Fetch records with React Query
  const { data: recordsData, isLoading } = useQuery({
    queryKey: ['records'],
    queryFn: () => records.getAll(),
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  });

  // Mutation for updating custom values
  const updateCustomValuesMutation = useMutation<void, Error, CustomValueMutation>({
    mutationFn: ({ recordId, values }) =>
      records.updateCustomValues(recordId, values),
    onMutate: async ({ recordId, values }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['records'] });

      // Snapshot the previous value
      const previousRecords = queryClient.getQueryData(['records']);

      // Optimistically update the record
      queryClient.setQueryData(['records'], (old: VinylRecord[]) => {
        return old.map(record => {
          if (record.id === recordId) {
            return {
              ...record,
              custom_values_cache: {
                ...record.custom_values_cache,
                ...values
              }
            };
          }
          return record;
        });
      });

      return { previousRecords };
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context we saved
      queryClient.setQueryData(['records'], context.previousRecords);
      notifications.show({
        title: 'Error',
        message: 'Failed to update record',
        color: 'red'
      });
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['records'] });
    }
  });

  // Handler for updating custom values
  const handleCustomValueChange = async (recordId: string, columnId: string, value: string) => {
    updateCustomValuesMutation.mutate({
      recordId,
      values: { [columnId]: value }
    });
  };

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

    // Add event listeners
    window.addEventListener('custom-values-updated', handleCustomValuesUpdate);
    window.addEventListener('vinyl-collection-table-refresh', handleTableRefresh);

    return () => {
      console.log('Removing event listeners');
      window.removeEventListener('custom-values-updated', handleCustomValuesUpdate);
      window.removeEventListener('vinyl-collection-table-refresh', handleTableRefresh);
    };
  }, []);

  // Separate useEffect for CSV export to ensure it has access to current userRecords
  useEffect(() => {
    const handleExportCSV = () => {
      console.log('Export CSV event received');
      console.log('Current records:', userRecords);
      
      if (!userRecords.length) {
        notifications.show({
          title: 'No Records',
          message: 'There are no records to export.',
          color: 'yellow'
        });
        return;
      }

      // Define standard headers
      const standardHeaders = [
        'Artist',
        'Album',
        'Original Year',
        'Label',
        'Country',
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

      console.log('Headers:', headers);
      console.log('Custom columns:', customColumns);

      // Convert records to CSV rows
      const rows = userRecords.map(record => {
        console.log('Processing record:', record);
        
        // Standard fields
        const standardFields = [
          record.artist || '',
          record.album || '',
          record.year?.toString() || '',
          record.label || '',
          record.country || '',
          (record.genres || []).join('; '),
          (record.styles || []).join('; '),
          (record.musicians || []).join('; '),
          record.created_at ? new Date(record.created_at).toLocaleString() : '',
          record.current_release_year?.toString() || '',
          record.master_url || '',
          record.current_release_url || ''
        ];

        // Custom fields
        const customFields = customColumns.map(col => {
          const value = record.custom_values_cache?.[col.id];
          console.log(`Custom field ${col.name}:`, value);
          return value || '';
        });

        const row = [...standardFields, ...customFields];
        console.log('Generated row:', row);
        return row;
      });

      console.log('Generated rows:', rows);

      // Combine headers and rows
      const csvContent = [
        headers.join(','),
        ...rows.map(row => 
          row.map(cell => {
            // Handle null or undefined
            if (cell === null || cell === undefined) return '';
            
            // Convert to string and handle special characters
            const str = String(cell);
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          }).join(',')
        )
      ].join('\n');

      console.log('CSV Content:', csvContent);

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

    window.addEventListener('export-collection-csv', handleExportCSV);
    return () => window.removeEventListener('export-collection-csv', handleExportCSV);
  }, [userRecords, customColumns]); // Include dependencies

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
          custom_values_cache: customValuesMap.get(record.id!) || {}
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
              id: 'country', 
              accessorKey: 'country', 
              header: 'Country', 
              enableSorting: true,
              size: 100,
              enableResizing: true,
              minSize: 80,
              maxSize: 200,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <Text size="sm">{row.original.country || '-'}</Text>
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
                  'Discogs',
                  'CSV Import'
                ],
                valueMap: {
                  'manual': 'Manual',
                  'spotify': 'Spotify URL',
                  'spotify_list': 'Spotify List Manual',
                  'spotify_list_sub': 'Spotify List Auto',
                  'barcode': 'Barcode',
                  'discogs_url': 'Discogs',
                  'csv_import': 'CSV Import'
                },
                labelMap: {
                  'Manual': 'manual',
                  'Spotify URL': 'spotify',
                  'Spotify List Manual': 'spotify_list',
                  'Spotify List Auto': 'spotify_list_sub',
                  'Barcode': 'barcode',
                  'Discogs': 'discogs_url',
                  'CSV Import': 'csv_import'
                },
                option_colors: {
                  'Manual': 'gray',
                  'Spotify URL': 'green',
                  'Spotify List Manual': 'green',
                  'Spotify List Auto': 'green',
                  'Barcode': 'blue',
                  'Discogs': 'orange',
                  'CSV Import': 'violet'
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
                  'Discogs': 'discogs_url',
                  'CSV Import': 'csv_import'
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
                  'discogs_url': 'Discogs',
                  'csv_import': 'CSV Import'
                };
                const colorMap: Record<string, string> = {
                  'manual': 'gray',
                  'spotify': 'green',
                  'spotify_list': 'green',
                  'spotify_list_sub': 'green',
                  'barcode': 'blue',
                  'discogs_url': 'orange',
                  'csv_import': 'violet'
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
      id: column.id,
      header: column.name,
      accessorFn: (row: VinylRecord) => row.custom_values_cache[column.id] || '',
      cell: ({ row, column: tableColumn }) => {
        const columnMeta = (tableColumn as ColumnWithMeta<VinylRecord>).meta;
        return (
          <CustomValueCell
            value={row.original.custom_values_cache[column.id] || ''}
            column={columnMeta?.customColumn || column}
            onChange={(value) => handleCustomValueChange(row.original.id, column.id, value)}
          />
        );
      },
      meta: { customColumn: column }
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
    <Box
      style={{
        padding: 'var(--mantine-spacing-md)',
      }}
    >
      <Group justify="space-between" mb="md">
        <TextInput
          placeholder="Search records..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          leftSection={<IconSearch size={14} />}
          style={{ minWidth: '300px' }}
        />
        <Group>
          <Button
            variant="default"
            onClick={() => setAddRecordsModalOpened(true)}
            leftSection={<IconPlus size={14} />}
          >
            Add Records
          </Button>
          <Button
            variant="default"
            onClick={() => setCustomColumnManagerOpened(true)}
            leftSection={<IconColumns size={14} />}
          >
            Manage Columns
          </Button>
        </Group>
      </Group>

      {error && (
        <Text c="red" mb="md">
          {error}
        </Text>
      )}

      <ResizableTable
        data={userRecords}
        columns={tableColumns}
        sortState={sortStatus}
        onSortChange={setSortStatus}
        tableId="vinyl-collection"
        loading={loading}
        recordsPerPage={PAGE_SIZE}
        page={page}
        onPageChange={setPage}
        customColumns={customColumns}
        searchQuery={searchQuery}
      />

      {/* Modals */}
      <CustomColumnManager
        opened={customColumnManagerOpened}
        onClose={() => setCustomColumnManagerOpened(false)}
        customColumns={customColumns}
        onCustomColumnsChange={(newColumns: CustomColumn[]) => {
          setCustomColumns(newColumns);
          loadCustomColumns();
        }}
      />
      <AddRecordsModal
        opened={addRecordsModalOpened}
        onClose={() => setAddRecordsModalOpened(false)}
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
    </Box>
  );
}

export default Collection; 

import { useEffect, useState, useMemo } from 'react';
import { Container, Title, TextInput, Button, Group, Stack, Text, ActionIcon, Tooltip, Popover, Box, Switch, Badge } from '@mantine/core';
import { IconTrash, IconExternalLink, IconDownload, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { records, customColumns as customColumnsApi } from '../services/api';
import type { VinylRecord, CustomColumn, CustomColumnValue } from '../types';
import { CustomColumnManager } from '../components/CustomColumnManager';
import { useDebouncedCallback } from 'use-debounce';
import { PILL_COLORS } from '../types';
import { ResizableTable } from '../components/ResizableTable';
import { SortingState, ColumnDef, Row } from '@tanstack/react-table';

const PAGE_SIZE = 15;

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
  const [sortState, setSortState] = useState<SortingState>([{ id: 'artist', desc: false }]);
  const [customColumnManagerOpened, setCustomColumnManagerOpened] = useState(false);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);

  useEffect(() => {
    loadRecords();
    loadCustomColumns();

    // Add event listeners for data updates
    const handleCustomValuesUpdate = () => {
      loadRecords();
    };

    const handleTableRefresh = () => {
      loadRecords();
      loadCustomColumns();  // Also reload columns when table refreshes
    };

    window.addEventListener('custom-values-updated', handleCustomValuesUpdate);
    window.addEventListener('refresh-table-data', handleTableRefresh);

    return () => {
      window.removeEventListener('custom-values-updated', handleCustomValuesUpdate);
      window.removeEventListener('refresh-table-data', handleTableRefresh);
    };
  }, []);

  const loadRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await records.getAll();
      if (response.success && response.data) {
        const recordsData = response.data;
        
        // Load custom values for all records
        const recordIds = recordsData.map(r => r.id).filter((id): id is string => !!id);
        const customValuesData = await customValuesService.getAllForRecords(recordIds);
        
        // Attach custom values to records
        const recordsWithCustomValues = recordsData.map(record => {
          if (!record.id) return record;
          
          const values = customValuesData[record.id];
          if (!values) return record;
          
          const customValues: Record<string, string> = {};
          values.forEach(value => {
            customValues[value.column_id] = value.value;
          });
          
          return {
            ...record,
            customValues
          };
        });
        
        setUserRecords(recordsWithCustomValues);
      } else {
        setError(response.error || 'Failed to load records');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  const loadCustomColumns = async () => {
    try {
      const response = await customColumnsApi.getAll();
      if (response.success && response.data) {
        // Force a re-render by creating a new array
        setCustomColumns([...response.data]);
        console.log('Custom columns loaded:', response.data);
      }
    } catch (err) {
      console.error('Failed to load custom columns:', err);
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

  // Filter and sort records based on search query and sort status
  const filteredRecords = useMemo(() => {
    let records = [...userRecords];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      records = records.filter(record => 
        record.artist?.toLowerCase().includes(query) ||
        record.album?.toLowerCase().includes(query) ||
        record.label?.toLowerCase().includes(query) ||
        record.genres?.some(genre => genre.toLowerCase().includes(query)) ||
        record.styles?.some(style => style.toLowerCase().includes(query))
      );
    }

    // Apply sorting
    if (sortState?.length > 0) {
      const { id, desc } = sortState[0];
      records.sort((a, b) => {
        let aValue = a[id as keyof VinylRecord];
        let bValue = b[id as keyof VinylRecord];

        // Handle array fields
        if (Array.isArray(aValue)) aValue = aValue.join(', ');
        if (Array.isArray(bValue)) bValue = bValue.join(', ');

        // Handle undefined/null values
        if (aValue == null) aValue = '';
        if (bValue == null) bValue = '';

        // Convert to strings for comparison
        const aString = String(aValue).toLowerCase();
        const bString = String(bValue).toLowerCase();

        // Special handling for numeric fields
        if (id === 'year' || id === 'current_release_year') {
          const aNum = Number(aValue) || 0;
          const bNum = Number(bValue) || 0;
          return desc ? bNum - aNum : aNum - bNum;
        }

        return desc 
          ? aString.localeCompare(bString)
          : bString.localeCompare(aString);
      });
    }

    return records;
  }, [userRecords, searchQuery, sortState]);

  // Get paginated records
  const paginatedRecords = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filteredRecords.slice(start, end);
  }, [filteredRecords, page]);

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
            {
              id: 'actions',
              accessorKey: 'actions',
              header: 'Actions',
              size: 100,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <Group gap="xs">
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
      size: column.type === 'multi-select' ? 300 : 
             ['text'].includes(column.type) ? 300 : 150,
      enableResizing: true,
      minSize: 100,
      maxSize: 1000,
      meta: { type: column.type },
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
            <Box style={{ position: 'relative', width: '100%', height: '100%' }}>
              <Switch
                checked={localValue === 'true'}
                onChange={(e) => handleChange(e.currentTarget.checked.toString())}
                size="sm"
                style={{ 
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)'
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

    return [...standardColumns, ...customColumnDefs];
  }, [customColumns]);

  return (
    <Container 
      size="xl" 
      px={{ base: 'xs', sm: 'md' }}
    >
      <Stack>
        <Group justify="space-between" align="center" mb="md">
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
            />
            <Button
              variant="light"
              leftSection={<IconDownload size={16} />}
              onClick={handleDownloadCSV}
              disabled={userRecords.length === 0}
            >
              Export CSV
            </Button>
            <Button
              variant="light"
              onClick={() => setCustomColumnManagerOpened(true)}
            >
              Manage Columns
            </Button>
          </Group>
        </Group>

        {error && (
          <Text c="red">{error}</Text>
        )}

        <ResizableTable<VinylRecord>
          data={paginatedRecords}
          columns={tableColumns}
          sortState={sortState}
          onSortChange={setSortState}
          tableId="vinyl-collection"
        />

        <CustomColumnManager
          opened={customColumnManagerOpened}
          onClose={() => {
            setCustomColumnManagerOpened(false);
            loadCustomColumns();  // Refresh columns when modal is closed
          }}
        />
      </Stack>
    </Container>
  );
}

export default Collection; 

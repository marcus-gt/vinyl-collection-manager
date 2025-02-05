import { useEffect, useState, useMemo } from 'react';
import { Container, Title, TextInput, Button, Group, Stack, Text, ActionIcon, Modal, Tooltip, Popover, Select, MultiSelect, Box, Switch, Badge } from '@mantine/core';
import { DataTable, DataTableSortStatus } from 'mantine-datatable';
import { IconTrash, IconExternalLink, IconNotes, IconDownload, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { records, customColumns as customColumnsApi } from '../services/api';
import type { VinylRecord, CustomColumn, CustomColumnValue } from '../types';
import { CustomColumnManager } from '../components/CustomColumnManager';
import { useDebouncedCallback } from 'use-debounce';
import { PILL_COLORS } from '../types';

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
  const [editingRecord, setEditingRecord] = useState<VinylRecord | null>(null);
  const [editingNotes, setEditingNotes] = useState('');
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<VinylRecord>>({ columnAccessor: 'artist', direction: 'asc' });
  const [customColumnManagerOpened, setCustomColumnManagerOpened] = useState(false);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

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

  const handleUpdateRecord = async () => {
    if (!editingRecord?.id) return;
    
    setLoading(true);
    try {
      // Update notes
      const notesResponse = await records.updateNotes(editingRecord.id, editingNotes);
      
      // Update custom values
      const valuesResponse = await customValuesService.update(editingRecord.id, customValues);
      
      if (notesResponse.success && valuesResponse.success) {
        // Update the record in the list
        setUserRecords(prevRecords => 
          prevRecords.map(record => 
            record.id === editingRecord.id 
              ? { 
                  ...notesResponse.data!, 
                  customValues: customValues 
                } 
              : record
          )
        );
        setEditingRecord(null);
        notifications.show({
          title: 'Success',
          message: 'Record updated successfully',
          color: 'green'
        });
      }
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: 'Failed to update record',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (record: VinylRecord) => {
    if (!record.id || !window.confirm('Are you sure you want to delete this record?')) return;

    setLoading(true);
    try {
      const response = await records.delete(record.id);
      if (response.success) {
        setUserRecords(userRecords.filter(r => r.id !== record.id));
      } else {
        setError(response.error || 'Failed to delete record');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete record');
    } finally {
      setLoading(false);
    }
  };

  const handleSortStatusChange = (newSortStatus: DataTableSortStatus<VinylRecord>) => {
    if (sortStatus.columnAccessor === newSortStatus.columnAccessor) {
      // Clicking the same column, cycle through: asc -> desc -> unsorted
      if (sortStatus.direction === 'asc') {
        setSortStatus({ ...newSortStatus, direction: 'desc' });
      } else {
        // Reset to default sorting
      setSortStatus({ columnAccessor: 'artist', direction: 'asc' });
      }
    } else {
      // Clicking a new column, start with ascending
      setSortStatus({ ...newSortStatus, direction: 'asc' });
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
        record.styles?.some(style => style.toLowerCase().includes(query)) ||
        record.notes?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    if (sortStatus?.columnAccessor) {
      const { columnAccessor, direction } = sortStatus;
      records.sort((a, b) => {
        let aValue = a[columnAccessor as keyof VinylRecord];
        let bValue = b[columnAccessor as keyof VinylRecord];

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
        if (columnAccessor === 'year' || columnAccessor === 'current_release_year') {
          const aNum = Number(aValue) || 0;
          const bNum = Number(bValue) || 0;
          return direction === 'asc' ? aNum - bNum : bNum - aNum;
        }

        return direction === 'asc' 
          ? aString.localeCompare(bString)
          : bString.localeCompare(aString);
      });
    }

    return records;
  }, [userRecords, searchQuery, sortStatus]);

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
      'Notes',
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
      record.notes || '',
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
    const standardColumns = [
            { 
              accessor: 'artist', 
              title: 'Artist', 
              sortable: true,
              width: 200,
        render: (record: VinylRecord) => (
                <Popover width={400} position="bottom-start" withArrow shadow="md">
                  <Popover.Target>
                    <Text size="sm" lineClamp={1} style={{ cursor: 'pointer' }} title={record.artist}>
                      {record.artist}
                    </Text>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                      {record.artist}
                    </Text>
                  </Popover.Dropdown>
                </Popover>
              )
            },
            { 
              accessor: 'album', 
              title: 'Album', 
              sortable: true,
              width: 250,
        render: (record: VinylRecord) => (
                <Popover width={400} position="bottom-start" withArrow shadow="md">
                  <Popover.Target>
                    <Text size="sm" lineClamp={1} style={{ cursor: 'pointer' }} title={record.album}>
                      {record.album}
                    </Text>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                      {record.album}
                    </Text>
                  </Popover.Dropdown>
                </Popover>
              )
            },
            { accessor: 'year', title: 'Original Year', sortable: true, width: 80 },
            { 
              accessor: 'label', 
              title: 'Label', 
              sortable: true,
              width: 150,
        render: (record: VinylRecord) => (
                <Popover width={400} position="bottom-start" withArrow shadow="md">
                  <Popover.Target>
                    <Text size="sm" lineClamp={1} style={{ cursor: 'pointer' }} title={record.label || '-'}>
                      {record.label || '-'}
                    </Text>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                      {record.label || '-'}
                    </Text>
                  </Popover.Dropdown>
                </Popover>
              )
            },
            { 
              accessor: 'genres', 
              title: 'Genres', 
              sortable: true,
              width: 150,
        render: (record: VinylRecord) => {
                const genres = record.genres?.join(', ') || '-';
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
              accessor: 'styles', 
              title: 'Styles', 
              sortable: true,
              width: 180,
        render: (record: VinylRecord) => {
                const styles = record.styles?.join(', ') || '-';
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
              accessor: 'musicians', 
              title: 'Musicians', 
              sortable: true,
              width: 200,
        render: (record: VinylRecord) => {
                const musicians = record.musicians?.join(', ') || '-';
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
              accessor: 'notes', 
              title: 'Notes', 
              sortable: true,
        render: (record: VinylRecord) => {
                const notes = record.notes || '-';
                return (
                  <Popover width={400} position="bottom-start" withArrow shadow="md">
                    <Popover.Target>
                      <Text size="sm" lineClamp={1} style={{ cursor: 'pointer' }} title={notes}>
                        {notes}
                      </Text>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <Text size="sm" style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                        {notes}
                      </Text>
                    </Popover.Dropdown>
                  </Popover>
                );
              }
            },
            { 
              accessor: 'created_at', 
              title: 'Added', 
              sortable: true,
              width: 150,
        render: (record: VinylRecord) => record.created_at ? 
                new Date(record.created_at).toLocaleString() : '-'
            },
            { 
              accessor: 'current_release_year', 
              title: 'Scanned Release Year', 
              sortable: true, 
              width: 100,
        render: (record: VinylRecord) => record.current_release_year || '-'
            },
            {
              accessor: 'links',
              title: 'Links',
              width: 130,
        render: (record: VinylRecord) => (
                <Group gap="xs">
                  {record.master_url && (
                    <Tooltip label="View Master Release">
                      <ActionIcon 
                        component="a" 
                        href={record.master_url} 
                        target="_blank" 
                        variant="light" 
                        size="sm"
                      >
                        <IconExternalLink size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  {record.current_release_url && (
                    <Tooltip label="View Scanned Release">
                      <ActionIcon 
                        component="a" 
                        href={record.current_release_url} 
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
              accessor: 'actions',
              title: 'Actions',
              width: 100,
        render: (record: VinylRecord) => (
                <Group gap="xs">
                  <Tooltip label="Edit Notes">
                    <ActionIcon 
                      variant="light" 
                      size="sm"
                      onClick={() => {
                        setEditingRecord(record);
                        setEditingNotes(record.notes ?? '');
                      }}
                    >
                      <IconNotes size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Delete">
                    <ActionIcon 
                      color="red" 
                      variant="light"
                      size="sm"
                      onClick={() => handleDelete(record)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              ),
            },
    ];

    // Add custom columns
    const customColumnDefs = customColumns.map(column => ({
      accessor: `custom_${column.id}` as keyof VinylRecord,
      title: column.name,
      sortable: true,
      width: ['multi-select', 'text'].includes(column.type) ? 300 : 150,  // Use wider width for both multi-select and text
      render: (record: VinylRecord) => {
        const [localValue, setLocalValue] = useState(record.customValues?.[column.id] || '');
        
        // Effect to sync local value with record value
        useEffect(() => {
          setLocalValue(record.customValues?.[column.id] || '');
        }, [record.customValues, column.id]);
        
        const debouncedUpdate = useDebouncedCallback(async (newValue: string) => {
          if (!record.id) return;
          
          try {
            console.log('Updating custom value:', {
              columnId: column.id,
              newValue,
              recordId: record.id
            });
            
            // For the API, we need to send an object with column_id as key and value as value
            const valueToSend = {
              [column.id]: newValue
            };

            const response = await customValuesService.update(record.id, valueToSend);
            
            if (response.success) {
              // Update the record in the local state
              setUserRecords(prevRecords =>
                prevRecords.map(r =>
                  r.id === record.id
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
              setLocalValue(record.customValues?.[column.id] || '');
            }
          } catch (err) {
            console.error('Error updating custom value:', err);
            notifications.show({
              title: 'Error',
              message: 'Failed to update value',
              color: 'red'
            });
            // Revert local value on error
            setLocalValue(record.customValues?.[column.id] || '');
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
          
          console.log('Rendering multi-select column:', {
            columnName: column.name,
            values,
            optionColors: column.option_colors,
            localValue
          });

          return (
            <Box style={{ position: 'relative' }}>
              <Popover width={400} position="bottom" withArrow shadow="md" opened={opened} onChange={setOpened}>
                <Popover.Target>
                  <Text size="sm" style={{ cursor: 'pointer', maxWidth: '90vw' }} onClick={() => setOpened(true)}>
                    {values.length === 0 ? (
                      <Text size="sm" c="dimmed">-</Text>
                    ) : (
                      <Group gap={4} wrap="wrap" style={{ 
                        minHeight: '24px',
                        maxHeight: '48px',  // Allow for two rows
                        overflow: 'hidden',
                        position: 'relative'
                      }}>
                        {values.map((value) => (
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
                                display: 'inline-flex'
                              }
                            }}
                          >
                            {value}
                          </Badge>
                        ))}
                        {values.length > 4 && (
                          <Badge
                            variant="filled"
                            size="sm"
                            radius="sm"
                            color="gray"
                            styles={{
                              root: {
                                textTransform: 'none',
                                cursor: 'default',
                                padding: '3px 8px'
                              }
                            }}
                          >
                            +{values.length - 4}
                          </Badge>
                        )}
                      </Group>
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
                                ? values.filter(v => v !== opt)
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

        <DataTable<VinylRecord>
          minHeight={150}
          records={paginatedRecords}
          sortStatus={sortStatus}
          onSortStatusChange={handleSortStatusChange}
          styles={{
            table: {
              tableLayout: 'fixed',
              '& tbody tr td': {
                height: '40px',
                maxHeight: '40px',
                padding: '8px',
                position: 'relative'
              }
            }
          }}
          columns={tableColumns}
          totalRecords={filteredRecords.length}
          recordsPerPage={PAGE_SIZE}
          page={page}
          onPageChange={setPage}
          fetching={loading}
          noRecordsText={
            loading ? 
            "Loading records..." : 
            filteredRecords.length === 0 ? 
              searchQuery ? 
                "No records found matching your search." :
                "No records in your collection yet. Try scanning some vinyl records!" :
              ""
          }
          loadingText="Loading records..."
          horizontalSpacing="xs"
          verticalSpacing="xs"
          idAccessor="id"
          emptyState={
            <Text c="dimmed" size="sm">
              {loading ? 
                "Loading records..." : 
                filteredRecords.length === 0 ? 
                  searchQuery ? 
                    "No records found matching your search." :
                    "No records in your collection yet. Try scanning some vinyl records!" :
                  ""
              }
            </Text>
          }
        />

        <Modal
          opened={!!editingRecord}
          onClose={() => {
            setEditingRecord(null);
            setCustomValues({});
          }}
          title="Edit Record"
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
            />
            {customColumns.map(column => (
              <div key={column.id}>
                {column.type === 'text' && (
                  <TextInput
                    label={column.name}
                    value={customValues[column.id] || ''}
                    onChange={(e) => setCustomValues(prev => ({
                      ...prev,
                      [column.id]: e.target.value
                    }))}
                  />
                )}
                {column.type === 'number' && (
                  <TextInput
                    label={column.name}
                    type="number"
                    value={customValues[column.id] || ''}
                    onChange={(e) => setCustomValues(prev => ({
                      ...prev,
                      [column.id]: e.target.value
                    }))}
                  />
                )}
                {column.type === 'boolean' && (
                  <Switch
                    label={column.name}
                    checked={customValues[column.id] === 'true'}
                    onChange={(e) => setCustomValues(prev => ({
                      ...prev,
                      [column.id]: e.currentTarget.checked.toString()
                    }))}
                    size="md"
                  />
                )}
                {column.type === 'single-select' && column.options && (
                  <Select
                    label={column.name}
                    value={customValues[column.id] || ''}
                    onChange={(value: string | null) => setCustomValues(prev => ({
                      ...prev,
                      [column.id]: value || ''
                    }))}
                    data={column.options.map(opt => ({
                      value: opt,
                      label: opt
                    }))}
                    clearable
                  />
                )}
                {column.type === 'multi-select' && column.options && (
                  <MultiSelect
                    label={column.name}
                    value={customValues[column.id]?.split(',').filter(Boolean) || []}
                    onChange={(values: string[]) => setCustomValues(prev => ({
                      ...prev,
                      [column.id]: values.join(',')
                    }))}
                    data={column.options.map(opt => ({
                      value: opt,
                      label: opt
                    }))}
                    clearable
                  />
                )}
              </div>
            ))}
            <Group justify="flex-end">
              <Button variant="light" onClick={() => {
                setEditingRecord(null);
                setCustomValues({});
              }}>
                Cancel
              </Button>
              <Button onClick={handleUpdateRecord} loading={loading}>
                Save
              </Button>
            </Group>
          </Stack>
        </Modal>

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

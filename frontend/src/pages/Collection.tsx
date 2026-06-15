import { useEffect, useState, useMemo, useRef } from 'react';
import { TextInput, Button, Group, Stack, Text, ActionIcon, Modal, Tooltip, Popover, Box, Badge } from '@mantine/core';
import { IconTrash, IconX, IconSearch, IconPlus, IconColumns, IconSettings, IconFileText } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { records, customColumns as customColumnsApi } from '../services/api';
import type { VinylRecord, CustomColumn } from '../types';
import { CustomColumnManager } from '../components/CustomColumnManager';
import { AddRecordsModal } from '../components/AddRecordsModal';
import { Settings } from '../components/Settings';
import { ResizableTable } from '../components/ResizableTable';
import { SortingState, ColumnDef, Row } from '@tanstack/react-table';
import { useBackendSettings } from '../hooks/useBackendSettings';
import {
  PAGE_SIZE,
  getColorStyles,
  formatMusicians,
  extractPrimaryFormat,
} from '../components/collection/helpers';
import { customValuesService, recordFieldsService } from '../components/collection/services';
import { TracklistCell } from '../components/collection/TracklistCell';
import { EditableStandardCell } from '../components/collection/EditableStandardCell';
import { EditableDiscogsLinks } from '../components/collection/EditableDiscogsLinks';
import { EditableCustomCell } from '../components/collection/EditableCustomCell';
import { RecordPreviewModal } from '../components/collection/RecordPreviewModal';
import { appEvents } from '../lib/appEvents';

function Collection() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userRecords, setUserRecords] = useState<VinylRecord[]>([]);
  const userRecordsRef = useRef<VinylRecord[]>([]);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRecord, setEditingRecord] = useState<VinylRecord | null>(null);
  const [editingNotes, setEditingNotes] = useState('');
  const [sortStatus, setSortStatus] = useState<SortingState>([{ id: 'artist', desc: false }]);
  const [addRecordsModalOpened, setAddRecordsModalOpened] = useState(false);
  const [customColumnManagerOpened, setCustomColumnManagerOpened] = useState(false);
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [editingColumn, setEditingColumn] = useState<CustomColumn | null>(null);
  const [returnToSettings, setReturnToSettings] = useState(false);
  const [columnOrder, setColumnOrder] = useBackendSettings<string[]>('table-column-order', []);
  const [columnVisibility, setColumnVisibility, visibilityLoading] = useBackendSettings<Record<string, boolean>>('table-column-visibility', {});
  const [previewRecord, setPreviewRecord] = useState<VinylRecord | null>(null);
  const defaultVisibilityAppliedRef = useRef(false);
  
  // Keep ref in sync with state
  useEffect(() => {
    userRecordsRef.current = userRecords;
  }, [userRecords]);

  // Set default visibility for hidden-by-default columns, but only AFTER the
  // saved visibility has loaded from the backend. Running before the load
  // completes would merge defaults onto an empty map and the debounced save
  // would clobber the user's persisted visibility settings.
  useEffect(() => {
    if (visibilityLoading || defaultVisibilityAppliedRef.current) return;
    defaultVisibilityAppliedRef.current = true;

    const hiddenByDefaultColumns = [
      'master_id',
      'original_release_id',
      'original_release_date',
      'original_identifiers',
      'current_release_id',
      'current_release_date',
      'current_identifiers',
      'original_catno',
      'current_catno',
      'added_from'
    ];

    // Only set defaults for columns that have no saved visibility yet
    const needsDefaults = hiddenByDefaultColumns.some(col => columnVisibility[col] === undefined);
    if (needsDefaults) {
      setColumnVisibility(prev => {
        const updated = { ...prev };
        hiddenByDefaultColumns.forEach(col => {
          if (updated[col] === undefined) {
            updated[col] = false; // false = hidden
          }
        });
        return updated;
      });
    }
  }, [visibilityLoading, columnVisibility, setColumnVisibility]);


  useEffect(() => {
    loadRecords();
    loadCustomColumns();

    // Reload records and custom columns whenever something signals a table refresh
    // (record added/imported/synced, or a custom column modified).
    const handleTableRefresh = () => {
      loadRecords();
      loadCustomColumns();
    };

    const off = appEvents.on('tableRefresh', handleTableRefresh);
    return off;
  }, []);

  // Separate useEffect for CSV export to ensure it has access to current userRecords
  useEffect(() => {
    const handleExportCSV = () => {
      
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
        'Original Format',
        'Label',
        'Country',
        'Genres',
        'Styles',
        'Musicians',
        'Added',
        'Release Year',
        'Release Format',
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
          record.artist || '',
          record.album || '',
          record.year?.toString() || '',
          record.master_format || '',
          record.label || '',
          record.country || '',
          (record.genres || []).join('; '),
          (record.styles || []).join('; '),
          formatMusicians(record.musicians),
          record.created_at ? new Date(record.created_at).toLocaleString() : '',
          record.current_release_year?.toString() || '',
          record.current_release_format || '',
          record.master_url || '',
          record.current_release_url || ''
        ];

        // Custom fields
        const customFields = customColumns.map(col => {
          const value = record.custom_values_cache[col.id];
          return value || '';
        });

        const row = [...standardFields, ...customFields];
        return row;
      });


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

    const off = appEvents.on('exportCollectionCsv', handleExportCSV);
    return off;
  }, [userRecords, customColumns]); // Include dependencies

  const loadRecords = async () => {
    setLoading(true);
    try {
      const response = await records.getAll();
      if (response.success && response.data) {
        // Records now include custom_values_cache
        setUserRecords(response.data);
      } else {
        setError(response.error || 'Failed to load records');
      }
    } catch (err) {
      setError('Failed to load records');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomColumns = async () => {
    try {
      const response = await customColumnsApi.getAll();
      if (response.success && response.data) {
        setCustomColumns(response.data);
        // Column order is intentionally NOT modified here. Display ordering is
        // handled non-destructively by the tableColumns sort (unknown columns
        // fall to the end), and the order is only persisted on explicit user
        // actions (drag/delete). Rewriting it on load previously regrouped
        // standard/custom columns and clobbered the user's saved arrangement.
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

  const handleDelete = (record: VinylRecord) => {
    
    if (!record.id) {
      console.error('No record ID found:', record);
      return;
    }

    modals.openConfirmModal({
      title: 'Delete record',
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Are you sure you want to delete this record?
          </Text>
          <Text size="sm" fw={500}>
            {record.artist} - {record.album}
          </Text>
          <Text size="xs" c="dimmed">
            This action cannot be undone.
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
    setLoading(true);
    try {
      // First load fresh data to ensure we have the latest state
      const currentData = await records.getAll();
      
      if (currentData.success && currentData.data) {
        setUserRecords(currentData.data);
      }

          const response = await records.delete(record.id!);
      
      if (response.success) {
        // Reload the full data after successful deletion
        const refreshedData = await records.getAll();
        
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
    }
      }
    });
  };

  const handleCancelPreview = () => {
    setPreviewRecord(null);
  };

  // Persist a custom-column value edited from the preview modal, updating local state.
  const handlePreviewCustomValueUpdate = async (recordId: string, columnId: string, newValue: string) => {
    try {
      const response = await customValuesService.update(recordId, { [columnId]: newValue });
      if (response.success) {
        setUserRecords(prevRecords =>
          prevRecords.map(r =>
            r.id === recordId
              ? { ...r, custom_values_cache: { ...r.custom_values_cache, [columnId]: newValue } }
              : r
          )
        );
        setPreviewRecord(prev =>
          prev ? { ...prev, custom_values_cache: { ...prev.custom_values_cache, [columnId]: newValue } } : null
        );
      } else {
        notifications.show({ title: 'Error', message: 'Failed to update value', color: 'red' });
      }
    } catch (err) {
      console.error('Error updating custom value in preview modal:', err);
      notifications.show({ title: 'Error', message: 'Failed to update value', color: 'red' });
    }
  };

  // Helper function to create editable cell for standard fields (shared by table and modal)
  const createEditableStandardCell = (
    record: VinylRecord,
    fieldName: string,
    fieldLabel: string,
    inputType: 'text' | 'number' | 'textarea' | 'array',
    options?: {
      requirePencilClick?: boolean;
      displayValue?: string;
      noTruncate?: boolean; // New option to disable truncation for modal
    }
  ) => {
    return (
      <EditableStandardCell
        value={(record as any)[fieldName] || (inputType === 'array' ? [] : '')}
        displayValue={options?.displayValue}
        fieldName={fieldName}
        fieldLabel={fieldLabel}
        recordId={record.id!}
        inputType={inputType}
        requirePencilClick={options?.requirePencilClick ?? true}
        noTruncate={options?.noTruncate}
        onUpdate={(recordId, fieldName, newValue) => {
          setUserRecords(prevRecords =>
            prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
          );
          setPreviewRecord(prev => prev ? { ...prev, [fieldName]: newValue } : null);
        }}
      />
    );
  };

  const tableColumns = useMemo(() => {
    // Helper function to wrap a cell with the preview icon
    const wrapWithPreviewIcon = (originalCell: any, row: Row<VinylRecord>) => (
      <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '8px' }}>
        <Box style={{ flex: 1, minWidth: 0 }}>
          {originalCell}
        </Box>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewRecord(row.original);
                    }}
          style={{ flexShrink: 0 }}
        >
          <IconFileText size={16} />
        </ActionIcon>
      </Box>
    );

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
                <EditableStandardCell
                  value={row.original.artist || ''}
                  fieldName="artist"
                  fieldLabel="Artist"
                  recordId={row.original.id!}
                  inputType="textarea"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
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
                <EditableStandardCell
                  value={row.original.album || ''}
                  fieldName="album"
                  fieldLabel="Album"
                  recordId={row.original.id!}
                  inputType="textarea"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            { 
              id: 'year',
              accessorKey: 'year', 
              header: 'Original Year',
              enableSorting: true,
              size: 80,
              meta: {
                type: 'number'
              },
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.year || ''}
                  fieldName="year"
                  fieldLabel="Original Year"
                  recordId={row.original.id!}
                  inputType="number"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            { 
              id: 'current_release_year', 
              accessorKey: 'current_release_year', 
              header: 'Release Year', 
              enableSorting: true, 
              size: 80,
              enableResizing: true,
              minSize: 80,
              maxSize: 120,
              meta: {
                type: 'number'
              },
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.current_release_year || ''}
                  fieldName="current_release_year"
                  fieldLabel="Release Year"
                  recordId={row.original.id!}
                  inputType="number"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            { 
              id: 'label', 
              accessorKey: 'label', 
              header: 'Original Label', 
              enableSorting: true,
              size: 150,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.label || ''}
                  fieldName="label"
                  fieldLabel="Original Label"
                  recordId={row.original.id!}
                  inputType="textarea"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            { 
              id: 'original_catno', 
              accessorKey: 'original_catno', 
              header: 'Original Catno', 
              enableSorting: true,
              size: 120,
              enableResizing: true,
              minSize: 80,
              maxSize: 200,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.original_catno || ''}
                  fieldName="original_catno"
                  fieldLabel="Original Catno"
                  recordId={row.original.id!}
                  inputType="text"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            { 
              id: 'current_label', 
              accessorKey: 'current_label', 
              header: 'Release Label', 
              enableSorting: true,
              size: 150,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.current_label || ''}
                  fieldName="current_label"
                  fieldLabel="Release Label"
                  recordId={row.original.id!}
                  inputType="textarea"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            { 
              id: 'current_catno', 
              accessorKey: 'current_catno', 
              header: 'Release Catno', 
              enableSorting: true,
              size: 120,
              enableResizing: true,
              minSize: 80,
              maxSize: 200,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.current_catno || ''}
                  fieldName="current_catno"
                  fieldLabel="Release Catno"
                  recordId={row.original.id!}
                  inputType="text"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            { 
              id: 'country', 
              accessorKey: 'country', 
              header: 'Original Country', 
              enableSorting: true,
              size: 120,
              enableResizing: true,
              minSize: 80,
              maxSize: 200,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.country || ''}
                  fieldName="country"
                  fieldLabel="Original Country"
                  recordId={row.original.id!}
                  inputType="text"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            { 
              id: 'current_country', 
              accessorKey: 'current_country', 
              header: 'Release Country', 
              enableSorting: true,
              size: 120,
              enableResizing: true,
              minSize: 80,
              maxSize: 200,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.current_country || ''}
                  fieldName="current_country"
                  fieldLabel="Release Country"
                  recordId={row.original.id!}
                  inputType="text"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            {
              id: 'master_format',
              accessorKey: 'master_format',
              header: 'Original Format',
              enableSorting: true,
              size: 100,
              enableResizing: true,
              minSize: 80,
              maxSize: 150,
              cell: ({ row }: { row: Row<VinylRecord> }) => {
                // For existing records without master_format, fallback to current_release_format
                // New records will have master_format from the main release
                const formatToUse = row.original.master_format || row.original.current_release_format || '';
                return (
                  <EditableStandardCell
                    value={formatToUse}
                    fieldName="master_format"
                    fieldLabel="Original Format"
                    recordId={row.original.id!}
                    inputType="textarea"
                    onUpdate={(recordId, fieldName, newValue) => {
                      setUserRecords(prevRecords =>
                        prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                      );
                    }}
                    displayValue={extractPrimaryFormat(formatToUse)}
                  />
                );
              }
            },
            { 
              id: 'current_release_format',
              accessorKey: 'current_release_format',
              header: 'Release Format',
              enableSorting: true,
              size: 100,
              enableResizing: true,
              minSize: 80,
              maxSize: 150,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.current_release_format || ''}
                  fieldName="current_release_format"
                  fieldLabel="Release Format"
                  recordId={row.original.id!}
                  inputType="textarea"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                  displayValue={extractPrimaryFormat(row.original.current_release_format)}
                />
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
              filterFn: 'textMultiTermContains' as any,
              cell: ({ row }: { row: Row<VinylRecord> }) => createEditableStandardCell(
                row.original,
                'genres',
                'Genres (comma-separated)',
                'array',
                { displayValue: row.original.genres?.join(', ') || '-' }
              )
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
              filterFn: 'textMultiTermContains' as any,
              cell: ({ row }: { row: Row<VinylRecord> }) => createEditableStandardCell(
                row.original,
                'styles',
                'Styles (comma-separated)',
                'array',
                { displayValue: row.original.styles?.join(', ') || '-' }
              )
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
              meta: {
                type: 'dateRange'
              },
              cell: ({ row }: { row: Row<VinylRecord> }) => row.original.created_at ? 
                new Date(row.original.created_at).toLocaleDateString() : '-'
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
              filterFn: (row: Row<VinylRecord>, columnId: string, filterValue: string | string[]) => {
                // Handle multi-select filtering (filter UI allows multiple selections)
                if (!filterValue || (Array.isArray(filterValue) && filterValue.length === 0)) return true;
                
                const cellValue = row.getValue(columnId) as string;
                const filterArray = Array.isArray(filterValue) ? filterValue : [filterValue];
                
                // Map display labels back to internal database values
                const labelMap: Record<string, string> = {
                  'Manual': 'manual',
                  'Spotify URL': 'spotify',
                  'Spotify List Manual': 'spotify_list',
                  'Spotify List Auto': 'spotify_list_sub',
                  'Barcode': 'barcode',
                  'Discogs': 'discogs_url',
                  'CSV Import': 'csv_import'
                };
                
                // Convert filter values (display labels) to internal values and check if cell matches any
                return filterArray.some(filterVal => {
                  const internalValue = labelMap[filterVal] || filterVal.toLowerCase();
                  return cellValue?.toLowerCase() === internalValue;
                });
              },
              enableColumnFilter: true,
              cell: ({ row }: { row: Row<VinylRecord> }) => {
                const valueMap: Record<string, string> = {
                  'manual': 'Manual',
                  'spotify': 'Spotify URL',
                  'spotify_list': 'Spotify List Manual',
                  'spotify_list_sub': 'Spotify List Auto',
                  'barcode': 'Barcode',
                  'discogs_url': 'Discogs',
                  'csv_import': 'CSV Import'
                };
                const optionColors: Record<string, string> = {
                  'Manual': 'gray',
                  'Spotify URL': 'green',
                  'Spotify List Manual': 'green',
                  'Spotify List Auto': 'green',
                  'Barcode': 'blue',
                  'Discogs': 'orange',
                  'CSV Import': 'violet'
                };
                // Normalize to lowercase to handle database inconsistencies
                const rawValue = (row.original.added_from || '').toLowerCase();
                const displayValue = valueMap[rawValue] || row.original.added_from || '-';
                const color = optionColors[displayValue] || 'gray';
                const colorStyles = getColorStyles(color);
                
                return displayValue && displayValue !== '-' ? (
                        <Badge
                          size="sm"
                    radius="md"
                    style={colorStyles}
                          styles={{
                            root: {
                              textTransform: 'none',
                        padding: '2px 5px',
                        fontSize: '10.5px'
                            }
                          }}
                        >
                    {displayValue}
                        </Badge>
                      ) : (
                        <Text size="sm" c="dimmed">-</Text>
                );
              }
            },
            {
              id: 'links',
              accessorKey: 'links',
              header: 'Discogs Links',
              size: 200,
              minSize: 200,
              maxSize: 300,
              enableResizing: true,
              enableColumnFilter: false,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableDiscogsLinks
                  masterUrl={row.original.master_url || null}
                  originalReleaseUrl={row.original.original_release_url || null}
                  currentReleaseUrl={row.original.current_release_url || null}
                  recordId={row.original.id!}
                  onUpdate={async (recordId, updates) => {
                    try {
                      const response = await recordFieldsService.update(recordId, updates);
                      if (response.success) {
                        setUserRecords(prevRecords =>
                          prevRecords.map(r => r.id === recordId ? { 
                            ...r, 
                            master_url: updates.master_url !== undefined ? updates.master_url || undefined : r.master_url,
                            original_release_url: updates.original_release_url !== undefined ? updates.original_release_url || undefined : r.original_release_url,
                            current_release_url: updates.current_release_url !== undefined ? updates.current_release_url || undefined : r.current_release_url
                          } : r)
                        );
                      }
                    } catch (error) {
                      console.error('Error updating Discogs links:', error);
                      notifications.show({
                        title: 'Error',
                        message: 'Failed to update Discogs links',
                        color: 'red'
                      });
                    }
                  }}
                />
              ),
            },
            // Hidden by default columns (advanced fields)
            {
              id: 'master_id',
              accessorKey: 'master_id',
              header: 'Master ID',
              enableSorting: true,
              size: 100,
              enableResizing: true,
              minSize: 80,
              maxSize: 150,
              meta: {
                type: 'number'
              },
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.master_id || ''}
                  fieldName="master_id"
                  fieldLabel="Master ID"
                  recordId={row.original.id!}
                  inputType="number"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            {
              id: 'tracklist',
              accessorKey: 'tracklist',
              header: 'Tracklist',
              enableSorting: true,
              size: 300,
              enableResizing: true,
              minSize: 200,
              maxSize: 600,
              filterFn: 'textMultiTermContains' as any,
              cell: ({ row }: { row: Row<VinylRecord> }) => {
                return <TracklistCell tracklist={row.original.tracklist} />;
              }
            },
            { 
              id: 'contributors', 
              accessorKey: 'contributors', 
              header: 'Contributors', 
              enableSorting: true,
              size: 250,
              enableResizing: true,
              minSize: 150,
              maxSize: 600,
              filterFn: 'textMultiTermContains' as any,
              cell: ({ row }: { row: Row<VinylRecord> }) => {
                const contributors = row.original.contributors || {};
                const [opened, setOpened] = useState(false);
                
                // Helper function to remove disambiguation numbers like "(3)" from names
                const cleanName = (name: string) => {
                  return name.replace(/\s*\(\d+\)\s*$/, '').trim();
                };
                
                // Format contributors by category for display - PRESERVE STRUCTURE
                let displayValue = '-';
                let structuredDisplay: React.ReactNode = null;
                
                if (contributors && Object.keys(contributors).length > 0) {
                  const categoryElements: React.ReactNode[] = [];
                  
                  Object.entries(contributors).forEach(([mainCategory, subCategories], idx) => {
                    // Collect all contributors from all subcategories for this main category
                    const contributorsByName = new Map<string, {name: string, roles: Set<string>, instruments: Set<string>}>();
                    
                    Object.entries(subCategories as any).forEach(([_subCategory, contribList]) => {
                      (contribList as any[]).forEach(contrib => {
                        if (!contributorsByName.has(contrib.name)) {
                          contributorsByName.set(contrib.name, {
                            name: contrib.name,
                            roles: new Set(),
                            instruments: new Set()
                          });
                        }
                        const existing = contributorsByName.get(contrib.name)!;
                        (contrib.roles || []).forEach((r: string) => existing.roles.add(r));
                        (contrib.instruments || []).forEach((i: string) => existing.instruments.add(i));
                      });
                    });
                    
                    if (contributorsByName.size > 0) {
                      categoryElements.push(
                        <Box key={idx} mb="sm">
                          <Text size="sm" fw={600} mb={4}>{mainCategory}</Text>
                          {Array.from(contributorsByName.values()).map((contrib, cIdx) => {
                            // Combine roles and instruments for display
                            const allParts = [...Array.from(contrib.roles), ...Array.from(contrib.instruments)];
                            
                            // Skip if no parts to show
                            if (allParts.length === 0) return null;
                            
                            return (
                              <Text key={cIdx} size="sm" ml="md">
                                <Text component="span" fw={500}>{cleanName(contrib.name)}</Text>
                                <Text component="span" c="dimmed"> - {allParts.join(', ')}</Text>
                              </Text>
                            );
                          })}
                        </Box>
                      );
                    }
                  });
                  
                  if (categoryElements.length > 0) {
                    structuredDisplay = <Stack gap="xs">{categoryElements}</Stack>;
                    // For table cell preview, show first few contributors
                    const allContribs = Object.values(contributors).flatMap(subCats => 
                      Object.values(subCats as any).flatMap((contribList: unknown) => 
                        Array.isArray(contribList) ? contribList.map(c => cleanName(c.name)) : []
                      )
                    );
                    const uniqueContribs = [...new Set(allContribs)];
                    displayValue = uniqueContribs.slice(0, 3).join(', ') + (uniqueContribs.length > 3 ? ` +${uniqueContribs.length - 3} more` : '');
                  }
                }
                
                return (
                  <Box 
                    style={{ 
                      position: 'relative', 
                      width: '100%', 
                      height: '100%', 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center'
                    }} 
                    onClick={() => setOpened(true)}
                  >
                    <Popover width="min(400px, 90vw)" position="bottom" withArrow shadow="md" opened={opened} onChange={setOpened} withinPortal>
                    <Popover.Target>
                        <div style={{ width: '100%' }}>
                          <Text size="sm" lineClamp={2} style={{ maxWidth: '90vw' }}>
                            {displayValue}
                      </Text>
                        </div>
                    </Popover.Target>
                    <Popover.Dropdown>
                        <Stack gap="xs">
                          <Group justify="space-between" align="center">
                            <Text size="sm" fw={500}>Contributors</Text>
                            <ActionIcon size="sm" variant="subtle" onClick={(e) => { e.stopPropagation(); setOpened(false); }}>
                              <IconX size={16} />
                      </ActionIcon>
                </Group>
                          <Box style={{ maxHeight: '400px', overflowY: 'auto' }}>
                            {structuredDisplay || <Text size="sm">{displayValue}</Text>}
                          </Box>
                        </Stack>
                    </Popover.Dropdown>
                  </Popover>
                  </Box>
                );
              }
            },
            {
              id: 'original_release_id',
              accessorKey: 'original_release_id',
              header: 'Original Release ID',
              enableSorting: true,
              size: 130,
              enableResizing: true,
              minSize: 100,
              maxSize: 200,
              meta: {
                type: 'number'
              },
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.original_release_id || ''}
                  fieldName="original_release_id"
                  fieldLabel="Original Release ID"
                  recordId={row.original.id!}
                  inputType="number"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            {
              id: 'original_release_date',
              accessorKey: 'original_release_date',
              header: 'Original Release Date',
              enableSorting: true,
              size: 150,
              enableResizing: true,
              minSize: 120,
              maxSize: 200,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.original_release_date || ''}
                  fieldName="original_release_date"
                  fieldLabel="Original Release Date"
                  recordId={row.original.id!}
                  inputType="text"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            {
              id: 'original_identifiers',
              accessorKey: 'original_identifiers',
              header: 'Original Identifiers',
              enableSorting: false,
              size: 250,
              enableResizing: true,
              minSize: 200,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => {
                const identifiers = row.original.original_identifiers;
                if (!identifiers || identifiers.length === 0) return <Text size="sm" c="dimmed">-</Text>;
                const preview = identifiers.slice(0, 2).map(i => `${i.type}: ${i.value}`).join(', ');
                const remaining = identifiers.length > 2 ? ` +${identifiers.length - 2} more` : '';
                return <Text size="sm">{preview}{remaining}</Text>;
              }
            },
            {
              id: 'current_release_id',
              accessorKey: 'current_release_id',
              header: 'Current Release ID',
              enableSorting: true,
              size: 130,
              enableResizing: true,
              minSize: 100,
              maxSize: 200,
              meta: {
                type: 'number'
              },
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.current_release_id || ''}
                  fieldName="current_release_id"
                  fieldLabel="Current Release ID"
                  recordId={row.original.id!}
                  inputType="number"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            {
              id: 'current_release_date',
              accessorKey: 'current_release_date',
              header: 'Current Release Date',
              enableSorting: true,
              size: 150,
              enableResizing: true,
              minSize: 120,
              maxSize: 200,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.current_release_date || ''}
                  fieldName="current_release_date"
                  fieldLabel="Current Release Date"
                  recordId={row.original.id!}
                  inputType="text"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            {
              id: 'current_identifiers',
              accessorKey: 'current_identifiers',
              header: 'Current Identifiers',
              enableSorting: false,
              size: 250,
              enableResizing: true,
              minSize: 200,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => {
                const identifiers = row.original.current_identifiers;
                if (!identifiers || identifiers.length === 0) return <Text size="sm" c="dimmed">-</Text>;
                const preview = identifiers.slice(0, 2).map(i => `${i.type}: ${i.value}`).join(', ');
                const remaining = identifiers.length > 2 ? ` +${identifiers.length - 2} more` : '';
                return <Text size="sm">{preview}{remaining}</Text>;
              }
            },
    ];

    // Add custom columns
    customColumns.forEach(column => {
      standardColumns.push({
        id: column.id,
        header: column.name,
        accessorFn: (record: VinylRecord) => {
          // Safely access custom_values_cache with fallback
          return record.custom_values_cache?.[column.id] || '';
        },
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
                  column.type === 'single-select' ? (row, columnId, filterValue) => {
                    // Handle multi-select filtering for single-select columns
                    if (!filterValue || (Array.isArray(filterValue) && filterValue.length === 0)) return true;
                    const cellValue = row.getValue(columnId);
                    const filterArray = Array.isArray(filterValue) ? filterValue : [filterValue];
                    return filterArray.includes(cellValue as string);
                  } : 
                  undefined,
        enableColumnFilter: true, // Enable filtering for all custom columns
        cell: ({ row }: { row: Row<VinylRecord> }) => (
          <EditableCustomCell
            value={row.original.custom_values_cache[column.id] || ''}
            recordId={row.original.id!}
            column={column}
            allRecords={userRecords}
            getAllRecords={() => userRecordsRef.current}
            onUpdate={async (recordId, columnId, newValue) => {
            try {
              
              const valueToSend = {
                  [columnId]: newValue
              };

                const response = await customValuesService.update(recordId, valueToSend);
              
              if (response.success) {
                setUserRecords(prevRecords =>
                  prevRecords.map(r =>
                      r.id === recordId
                      ? {
                          ...r,
                          custom_values_cache: {
                            ...r.custom_values_cache,
                              [columnId]: newValue
                          }
                        }
                      : r
                  )
                );
              } else {
                console.error('Failed to update custom value');
                notifications.show({
                  title: 'Error',
                  message: 'Failed to update value',
                  color: 'red'
                });
              }
            } catch (err) {
              console.error('Error updating custom value:', err);
              notifications.show({
                title: 'Error',
                message: 'Failed to update value',
                color: 'red'
              });
                    }
                  }}
                />
        )
      });
    });

    // Add actions column last
    const actionsColumn: ColumnDef<VinylRecord> = {
      id: 'actions',
      accessorKey: 'actions',
      header: '', // Empty header
      size: 50, // Reduced from 100 to 50
      enableResizing: true,
      minSize: 50, // Reduced from 100 to 50
      maxSize: 100,
      enableColumnFilter: false,
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
                handleDelete(row.original);
              }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
        </Box>
      ),
    };

    // Combine all columns
    const allColumns = [...standardColumns, actionsColumn];
    
    // Find the first visible column based on columnOrder
    // If columnOrder is empty, default to first column
    let firstVisibleColumnId: string | null = null;
    
    if (columnOrder.length > 0) {
      // Find first column in columnOrder that exists in allColumns and is visible
      for (const colId of columnOrder) {
        if (columnVisibility[colId] !== false && allColumns.some(col => col.id === colId)) {
          firstVisibleColumnId = colId;
          break;
        }
      }
    } else {
      // If no columnOrder, use first column
      firstVisibleColumnId = allColumns[0]?.id || null;
    }
    
    // Wrap the first visible column's cell with the preview icon
    if (firstVisibleColumnId) {
      const columnIndex = allColumns.findIndex(col => col.id === firstVisibleColumnId);
      if (columnIndex !== -1) {
        const originalColumn = allColumns[columnIndex];
        const originalCellFn = originalColumn.cell;
        
        // Create new column with wrapped cell
        allColumns[columnIndex] = {
          ...originalColumn,
          cell: (props: any) => {
            const originalCell = typeof originalCellFn === 'function' 
              ? originalCellFn(props) 
              : originalCellFn;
            return wrapWithPreviewIcon(originalCell, props.row);
          }
        };
      }
    }

    // Order the column definitions themselves according to the saved columnOrder
    // so standard and custom columns interleave correctly and persist across
    // refreshes (independent of whether a column is standard or custom). Columns
    // not present in the saved order keep their natural position at the end.
    if (columnOrder.length === 0) {
      return allColumns;
    }
    // Resolve a column's effective id the same way the table does: explicit id
    // (custom columns + actions) or accessorKey (standard columns).
    const columnId = (col: ColumnDef<VinylRecord>): string | undefined =>
      (col.id ?? (col as { accessorKey?: string }).accessorKey);
    const orderIndex = (col: ColumnDef<VinylRecord>) => {
      const id = columnId(col);
      const idx = id ? columnOrder.indexOf(id) : -1;
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    };
    const orderedColumns = [...allColumns].sort((a, b) => orderIndex(a) - orderIndex(b));
    return orderedColumns;
  }, [customColumns, columnOrder, columnVisibility]);

  // The complete, ordered list of column ids actually present in the table.
  // Passing this (rather than the raw saved order, which may be missing newly
  // added columns) to the table means it never appends columns separately - so
  // custom and standard columns interleave exactly as ordered above.
  const tableColumnOrder = useMemo(
    () => tableColumns
      .map(col => (col.id ?? (col as { accessorKey?: string }).accessorKey))
      .filter((id): id is string => Boolean(id)),
    [tableColumns]
  );

  return (
    <Box
      style={{
        padding: 'var(--mantine-spacing-md)',
      }}
    >
      <Box mb="md">
        <style dangerouslySetInnerHTML={{ __html: `
          .search-controls-wrapper {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: var(--mantine-spacing-xs);
          }
          .search-input-wrapper {
            min-width: 175px;
            max-width: 350px;
            flex: 1 1 auto;
          }
          .buttons-wrapper {
            flex: 0 0 auto;
            display: flex;
            gap: var(--mantine-spacing-xs);
            align-items: center;
          }
          @media (max-width: 768px) {
            .search-controls-wrapper {
              flex-direction: column;
              align-items: stretch;
            }
            .search-input-wrapper {
              width: 100%;
              min-width: 100%;
              max-width: 100%;
            }
            .buttons-wrapper {
              width: 100%;
            }
            .buttons-wrapper button {
              flex: 1;
            }
            .buttons-wrapper .settings-button {
              flex: 0 0 auto;
            }
          }
        `}} />
        <Box className="search-controls-wrapper">
          <Box className="search-input-wrapper">
        <TextInput
          placeholder="Search records..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          leftSection={<IconSearch size={14} />}
        />
          </Box>
          <Box className="buttons-wrapper">
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
              Add Column
          </Button>
            <Tooltip label="Settings">
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => setSettingsOpened(true)}
                className="settings-button"
              >
                <IconSettings size={18} />
              </ActionIcon>
            </Tooltip>
          </Box>
        </Box>
      </Box>

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
        columnVisibility={columnVisibility}
        columnOrder={tableColumnOrder}
        onColumnOrderChange={setColumnOrder}
      />

      {/* Modals */}
      <CustomColumnManager
        opened={customColumnManagerOpened || !!editingColumn}
        onClose={(shouldReturnToSettings) => {
          setCustomColumnManagerOpened(false);
          setEditingColumn(null);
          // Return to Settings only if Back button was clicked and we came from Settings
          if (shouldReturnToSettings && returnToSettings) {
            setSettingsOpened(true);
          }
          setReturnToSettings(false);
        }}
        customColumns={customColumns}
        onCustomColumnsChange={(newColumns: CustomColumn[]) => {
          setCustomColumns(newColumns);
          loadCustomColumns();
        }}
        editingColumnProp={editingColumn}
      />
      <AddRecordsModal
        opened={addRecordsModalOpened}
        onClose={() => setAddRecordsModalOpened(false)}
      />
      <Settings
        opened={settingsOpened}
        onClose={() => setSettingsOpened(false)}
        customColumns={customColumns}
        onEditColumn={(column) => {
          setEditingColumn(column);
          setReturnToSettings(true);
          setSettingsOpened(false);
        }}
        onDeleteColumn={async (columnId) => {
          try {
            await customColumnsApi.delete(columnId);
            
            // Remove deleted column from column order
            setColumnOrder(prevOrder => prevOrder.filter(id => id !== columnId));
            
            // Remove from visibility settings
            setColumnVisibility(prev => {
              const newVisibility = { ...prev };
              delete newVisibility[columnId];
              return newVisibility;
            });
            
            loadCustomColumns();
            notifications.show({
              title: 'Success',
              message: 'Column deleted successfully',
              color: 'green'
            });
          } catch (error) {
            notifications.show({
              title: 'Error',
              message: 'Failed to delete column',
              color: 'red'
            });
          }
        }}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={(columnId, visible) => {
          setColumnVisibility(prev => ({
            ...prev,
            [columnId]: visible
          }));
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

      <RecordPreviewModal
        previewRecord={previewRecord}
        onClose={handleCancelPreview}
        columnVisibility={columnVisibility}
        customColumns={customColumns}
        userRecords={userRecords}
        getAllRecords={() => userRecordsRef.current}
        createEditableStandardCell={createEditableStandardCell}
        onCustomValueUpdate={handlePreviewCustomValueUpdate}
      />
    </Box>
  );
}

export default Collection; 

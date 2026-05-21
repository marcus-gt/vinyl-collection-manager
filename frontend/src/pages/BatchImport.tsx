import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Title,
  Text,
  Button,
  FileInput,
  Paper,
  Stack,
  Group,
  Select,
  Checkbox,
  Progress,
  Table,
  Badge,
  ActionIcon,
  Loader,
  Alert,
  TextInput,
  ScrollArea
} from '@mantine/core';
import {
  IconFileSpreadsheet,
  IconRefresh,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconPlayerPlay,
  IconDownload,
  IconTrash,
  IconChevronUp,
  IconChevronDown
} from '@tabler/icons-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as lookupService from '../services/lookupService';
import { records } from '../services/api';
import type { VinylRecord } from '../types';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { MyCustomPagination } from '../components/MyCustomPagination';

type RowStatus = 'pending' | 'fetching' | 'saving' | 'success' | 'duplicate' | 'failed';

interface ImportRow {
  id: string;
  rowNumber: number;
  artist: string;
  album: string;
  discogsIdOrUrl?: string;
  status: RowStatus;
  errorMessage?: string;
  selected: boolean;
  recordData?: VinylRecord;
}

const STORAGE_KEY = 'batch-import-state';

export default function BatchImport() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [artistColumn, setArtistColumn] = useState<string>('');
  const [albumColumn, setAlbumColumn] = useState<string>('');
  const [hasDiscogsColumn, setHasDiscogsColumn] = useState(false);
  const [discogsColumn, setDiscogsColumn] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importComplete, setImportComplete] = useState(false);
  const [existingRecords, setExistingRecords] = useState<VinylRecord[]>([]);
  const [fileParseError, setFileParseError] = useState<string | undefined>();
  const [currentProcessingRow, setCurrentProcessingRow] = useState<ImportRow | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const cancelRequestedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 50;
  const [sortBy, setSortBy] = useState<'rowNumber' | 'artist' | 'album' | 'status'>('rowNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [stateRestored, setStateRestored] = useState(false);

  // Sorted rows
  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      let compareValue = 0;
      
      switch (sortBy) {
        case 'rowNumber':
          compareValue = a.rowNumber - b.rowNumber;
          break;
        case 'artist':
          compareValue = a.artist.localeCompare(b.artist);
          break;
        case 'album':
          compareValue = a.album.localeCompare(b.album);
          break;
        case 'status':
          const statusOrder = { pending: 0, fetching: 1, saving: 2, success: 3, duplicate: 4, failed: 5 };
          compareValue = statusOrder[a.status] - statusOrder[b.status];
          break;
      }
      
      return sortOrder === 'asc' ? compareValue : -compareValue;
    });
    
    return sorted;
  }, [rows, sortBy, sortOrder]);

  // Paginated rows
  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    const endIndex = startIndex + ROWS_PER_PAGE;
    return sortedRows.slice(startIndex, endIndex);
  }, [sortedRows, currentPage, ROWS_PER_PAGE]);

  const totalPages = Math.ceil(rows.length / ROWS_PER_PAGE);

  // Ensure current page is valid when rows change
  useEffect(() => {
    if (rows.length > 0 && currentPage > totalPages) {
      setCurrentPage(Math.max(1, totalPages));
    }
  }, [rows.length, currentPage, totalPages]);

  // Stats
  const stats = useMemo(() => {
    const total = rows.length;
    const pending = rows.filter(r => r.status === 'pending').length;
    const fetching = rows.filter(r => r.status === 'fetching').length;
    const saving = rows.filter(r => r.status === 'saving').length;
    const processing = fetching + saving; // Combined for display
    const success = rows.filter(r => r.status === 'success').length;
    const duplicate = rows.filter(r => r.status === 'duplicate').length;
    const failed = rows.filter(r => r.status === 'failed').length;
    const selected = rows.filter(r => r.selected).length;

    return { total, pending, processing, fetching, saving, success, duplicate, failed, selected };
  }, [rows]);

  // Save state to localStorage
  const saveState = useCallback(() => {
    try {
      const state = {
        columns,
        rows,
        artistColumn,
        albumColumn,
        hasDiscogsColumn,
        discogsColumn,
        progress,
        importComplete,
        timestamp: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save import state:', error);
    }
  }, [columns, rows, artistColumn, albumColumn, hasDiscogsColumn, discogsColumn, progress, importComplete]);

  // Restore state from localStorage on mount
  useEffect(() => {
    if (stateRestored) return;
    
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        setStateRestored(true);
        return;
      }

      const state = JSON.parse(saved);
      
      // Check if state is recent (within 24 hours)
      const age = Date.now() - (state.timestamp || 0);
      if (age > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        setStateRestored(true);
        return;
      }

      // Restore state
      if (state.rows && state.rows.length > 0) {
        setColumns(state.columns || []);
        setRows(state.rows || []);
        setArtistColumn(state.artistColumn || '');
        setAlbumColumn(state.albumColumn || '');
        setHasDiscogsColumn(state.hasDiscogsColumn || false);
        setDiscogsColumn(state.discogsColumn || '');
        setProgress(state.progress || 0);
        setImportComplete(state.importComplete || false);

        notifications.show({
          title: 'Import Recovered',
          message: `Restored ${state.rows.length} rows from previous session`,
          color: 'blue',
          autoClose: 5000
        });
      }
      
      setStateRestored(true);
    } catch (error) {
      console.error('Failed to restore import state:', error);
      localStorage.removeItem(STORAGE_KEY);
      setStateRestored(true);
    }
  }, [stateRestored]);

  // Auto-save state whenever rows change
  useEffect(() => {
    if (!stateRestored || rows.length === 0) return;
    
    const timeoutId = setTimeout(() => {
      saveState();
    }, 1000); // Debounce saves

    return () => clearTimeout(timeoutId);
  }, [rows, saveState, stateRestored]);

  // Handle visibility change and page lifecycle
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden (tab switched, minimized, or locked)
        console.log('Page hidden - saving state');
        saveState();
      } else {
        // Page is visible again
        console.log('Page visible again');
        
        // If we were processing, the process likely failed
        // Reset processing state but keep data
        if (processing) {
          console.log('Stopping stale processing state');
          setProcessing(false);
          setCurrentProcessingRow(null);
          setCancelRequested(false);
          cancelRequestedRef.current = false;
          abortControllerRef.current = null;
          
          notifications.show({
            title: 'Import Paused',
            message: 'The import was interrupted. You can resume by clicking "Import Selected" again.',
            color: 'yellow',
            autoClose: 10000
          });
        }
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (rows.length > 0 && !importComplete) {
        saveState();
        e.preventDefault();
        e.returnValue = 'You have an ongoing import. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [processing, rows, importComplete, saveState]);

  // Handle file upload and parse
  const handleFileUpload = useCallback(async (uploadedFile: File | null) => {
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setFileParseError(undefined);

    try {
      const fileExt = uploadedFile.name.toLowerCase().split('.').pop();

      let parsedData: { columns: string[]; rows: string[][] } | null = null;

      if (fileExt === 'csv') {
        // Parse CSV
        const text = await uploadedFile.text();
        const result = Papa.parse<string[]>(text, {
          skipEmptyLines: true
        });

        if (result.errors.length > 0) {
          setFileParseError(`CSV parse error: ${result.errors[0].message}`);
          return;
        }

            const [headers, ...dataRows] = result.data;
        parsedData = {
          columns: headers.map(h => String(h)),
          rows: dataRows
        };
      } else if (fileExt === 'xlsx' || fileExt === 'xls') {
        // Parse Excel
        const arrayBuffer = await uploadedFile.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });

        const [headers, ...dataRows] = jsonData;
        parsedData = {
          columns: headers.map(h => String(h)),
          rows: dataRows
        };
      } else {
        setFileParseError('Unsupported file type. Please upload a CSV or Excel file.');
        return;
      }

      if (parsedData) {
        setColumns(parsedData.columns);

        // Auto-detect common column names
        const artistCol = parsedData.columns.find(c =>
          /artist/i.test(c)
        );
        const albumCol = parsedData.columns.find(c =>
          /album|title/i.test(c) && !(/release.?id|catalog/i.test(c))
        );
        const discogsCol = parsedData.columns.find(c =>
          /release.?id/i.test(c)
        );

        if (artistCol) setArtistColumn(artistCol);
        if (albumCol) setAlbumColumn(albumCol);
        if (discogsCol) setDiscogsColumn(discogsCol);

        // Store parsed rows temporarily (not as ImportRow yet - need column mapping first)
        const tempRows = parsedData.rows
          .filter(row => row.some(cell => cell && cell.toString().trim()))
          .map((row, index) => {
            const rowObj: Record<string, any> = {};
            parsedData.columns.forEach((col, i) => {
              rowObj[col] = row[i]?.toString() || '';
            });
            rowObj._rowNumber = index + 1; // Row 1 is the first data row (header not counted)
            rowObj._index = index;
            return rowObj;
          });

        // Store in state for later processing
        (window as any)._tempImportRows = tempRows;

        // Fetch existing records for duplicate detection
        try {
          const response = await records.getAll();
          if (response.success && response.data) {
            setExistingRecords(response.data);
          }
        } catch (err) {
          console.error('Failed to fetch existing records:', err);
        }
      }
    } catch (err) {
      console.error('File parse error:', err);
      setFileParseError('Failed to parse file. Please check the file format.');
    }
  }, []);


  // Check for duplicates
  const checkDuplicates = useCallback(() => {
    setRows(prevRows =>
      prevRows.map(row => {
        if (row.status !== 'pending') return row;

        // Check if album already exists
        const isDuplicate = existingRecords.some(existing => {
          // Match by Discogs ID if available
          if (row.discogsIdOrUrl) {
            const discogsId = row.discogsIdOrUrl.match(/\/release\/(\d+)/)?.[1] || row.discogsIdOrUrl;
            if (
              String(existing.current_release_id) === discogsId ||
              String(existing.original_release_id) === discogsId
            ) {
              return true;
            }
          }

          // Fuzzy match by artist + album name
          const normalizeString = (str: string) =>
            str
              .toLowerCase()
              .trim()
              .replace(/^the\s+/i, '')
              .replace(/[^\w\s]/g, '');

          const artistMatch =
            normalizeString(existing.artist) === normalizeString(row.artist);
          const albumMatch =
            normalizeString(existing.album) === normalizeString(row.album);

          return artistMatch && albumMatch;
        });

        if (isDuplicate) {
          return {
            ...row,
            status: 'duplicate' as RowStatus,
            errorMessage: 'Already in collection',
            selected: false
          };
        }

        return row;
      })
    );
  }, [existingRecords]);

  // Process a single row with status callback
  const processRow = async (
    row: ImportRow,
    onStatusChange: (rowId: string, status: RowStatus) => void
  ): Promise<ImportRow> => {
    try {
      // Stage 1: Fetching from Discogs
      onStatusChange(row.id, 'fetching');
      
      let lookupResult: lookupService.LookupResult;

      if (row.discogsIdOrUrl && hasDiscogsColumn) {
        // Use Discogs ID/URL
        const detected = lookupService.detectInputType(row.discogsIdOrUrl);
        if (detected.type === 'discogs_url') {
          lookupResult = await lookupService.lookupByDiscogsUrl(row.discogsIdOrUrl);
        } else if (detected.type === 'discogs_id') {
          lookupResult = await lookupService.lookupByDiscogsId(row.discogsIdOrUrl);
        } else {
          // Try as barcode or fallback to artist/album
          if (!row.artist || !row.album) {
            return {
              ...row,
              status: 'failed',
              errorMessage: 'Invalid Discogs ID/URL and no artist/album provided'
            };
          }
          lookupResult = await lookupService.lookupByArtistAlbum(row.artist, row.album, undefined, 'minimal');
        }
      } else {
        // Use artist + album (batch import uses minimal mode for speed)
        if (!row.artist || !row.album) {
          return {
            ...row,
            status: 'failed',
            errorMessage: 'Missing artist or album'
          };
        }
        lookupResult = await lookupService.lookupByArtistAlbum(row.artist, row.album, undefined, 'minimal');
      }

      if (!lookupResult.success || !lookupResult.data) {
        return {
          ...row,
          status: 'failed',
          errorMessage: lookupResult.error || 'Not found on Discogs'
        };
      }

      // Stage 2: Saving to database
      onStatusChange(row.id, 'saving');
      
      const createResponse = await records.add({
        ...lookupResult.data,
        added_from: 'batch_import'
      });

      if (!createResponse.success) {
        return {
          ...row,
          status: 'failed',
          errorMessage: createResponse.error || 'Failed to save'
        };
      }

      return {
        ...row,
        status: 'success',
        recordData: lookupResult.data,
        errorMessage: undefined
      };
    } catch (err: any) {
      console.error('Error processing row:', err);
      
      // More descriptive error messages
      let errorMessage = 'Network error';
      if (err.name === 'AbortError') {
        errorMessage = 'Cancelled';
      } else if (err.message) {
        errorMessage = err.message.substring(0, 100); // Limit length
      }
      
      return {
        ...row,
        status: 'failed',
        errorMessage
      };
    }
  };

  // Process batch
  const processBatch = useCallback(
    async (rowsToProcess: ImportRow[]) => {
      setProcessing(true);
      setProgress(0);
      setImportComplete(false);
      setCancelRequested(false);
      cancelRequestedRef.current = false;
      
      // Create abort controller for this batch
      abortControllerRef.current = new AbortController();

      let processedCount = 0;
      const totalCount = rowsToProcess.length;
      let wasCancelled = false;

      // Status update callback
      const updateRowStatus = (rowId: string, status: RowStatus) => {
        setRows(prev => prev.map(r => (r.id === rowId ? { ...r, status } : r)));
      };

      // Process rows one at a time (sequential)
      try {
        for (const row of rowsToProcess) {
          // Check if cancellation was requested (use ref for current value)
          if (cancelRequestedRef.current) {
            wasCancelled = true;
            console.log("Import cancelled by user.");
            break;
          }

          // Set current processing row
          setCurrentProcessingRow(row);

          const result = await processRow(row, updateRowStatus);

          // Update with final result
          setRows(prev => prev.map(r => (r.id === row.id ? result : r)));
          
          // Increment progress after each row
          processedCount += 1;
          setProgress((processedCount / totalCount) * 100);

          // Add delay between requests (0.5 seconds)
          if (processedCount < totalCount && !cancelRequestedRef.current) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      } catch (error: any) {
        // If aborted, just exit cleanly
        if (error.name === 'AbortError') {
          console.log("Import aborted.");
          wasCancelled = true;
        } else {
          console.error("Error during batch processing:", error);
        }
      }

      // Only clean up if not already cancelled (handleCancelImport does its own cleanup)
      if (!cancelRequestedRef.current) {
        setProcessing(false);
        setCurrentProcessingRow(null);
        abortControllerRef.current = null;
        
        if (!wasCancelled) {
          setImportComplete(true);
          
          // Show notification
          const successCount = rowsToProcess.filter(r => r.status === 'success').length;
          const failedCount = rowsToProcess.filter(r => r.status === 'failed').length;

          notifications.show({
            title: 'Import Complete',
            message: `Successfully imported ${successCount} records. ${failedCount} failed.`,
            color: failedCount > 0 ? 'yellow' : 'green'
          });
        }
      }
    },
    [processRow]
  );

  // Cancel import
  const handleCancelImport = useCallback(() => {
    setCancelRequested(true);
    cancelRequestedRef.current = true;
    
    // Abort any ongoing network requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Immediately stop processing
    setProcessing(false);
    setCurrentProcessingRow(null);
    setCancelRequested(false);
    cancelRequestedRef.current = false;
    abortControllerRef.current = null;
    
    notifications.show({
      title: 'Import Cancelled',
      message: 'The import process has been stopped.',
      color: 'yellow'
    });
  }, []);

  // Retry failed
  const handleRetryFailed = useCallback(() => {
    const failedRows = rows.filter(r => r.status === 'failed');
    if (failedRows.length === 0) {
      notifications.show({
        title: 'No Failed Rows',
        message: 'There are no failed rows to retry',
        color: 'yellow'
      });
      return;
    }

    // Reset failed rows to pending
    setRows(prev =>
      prev.map(r => (r.status === 'failed' ? { ...r, status: 'pending', errorMessage: undefined } : r))
    );

    setTimeout(() => {
      processBatch(failedRows);
    }, 100);
  }, [rows, processBatch]);

  // Upload selected
  const handleUploadSelected = useCallback(() => {
    const selectedRows = rows.filter(r => r.selected && r.status !== 'success');
    if (selectedRows.length === 0) {
      notifications.show({
        title: 'No Rows Selected',
        message: 'Please select rows to upload',
        color: 'yellow'
      });
      return;
    }

    // Reset selected rows to pending (except duplicates)
    setRows(prev =>
      prev.map(r =>
        r.selected && r.status !== 'success' && r.status !== 'duplicate'
          ? { ...r, status: 'pending', errorMessage: undefined }
          : r
      )
    );

    setTimeout(() => {
      processBatch(selectedRows);
    }, 100);
  }, [rows, processBatch]);

  // Handle close - navigate back to collection with confirmation if needed
  const handleClose = useCallback(() => {
    // If there's data (file uploaded or rows present), confirm before leaving
    if (file || rows.length > 0) {
      modals.openConfirmModal({
        title: 'Leave Batch Import',
        children: (
          <Stack gap="xs">
            <Text size="sm">
              Are you sure you want to leave the batch import page?
            </Text>
            {importComplete ? (
              <Text size="xs" c="dimmed">
                You will return to your collection.
              </Text>
            ) : (
              <Text size="xs" c="dimmed">
                Any unsaved data will be lost.
              </Text>
            )}
          </Stack>
        ),
        labels: { confirm: 'Leave', cancel: 'Stay' },
        confirmProps: { color: 'red' },
        onConfirm: () => {
          // Clear temporary data before navigating
          delete (window as any)._tempImportRows;
          navigate('/collection');
        }
      });
    } else {
      // No data, navigate directly
      navigate('/collection');
    }
  }, [file, rows.length, importComplete, navigate]);

  // Clear all
  const handleClearAll = useCallback(() => {
    // Always confirm before clearing to prevent accidental data loss
    modals.openConfirmModal({
      title: 'Clear Import',
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Are you sure you want to clear the batch import?
          </Text>
          {importComplete ? (
            <Text size="xs" c="dimmed">
              This will remove all results and reset the page.
            </Text>
          ) : (
            <Text size="xs" c="dimmed">
              This will remove all uploaded data and reset the page.
            </Text>
          )}
        </Stack>
      ),
      labels: { confirm: 'Clear', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        setFile(null);
        setColumns([]);
        setRows([]);
        setArtistColumn('');
        setAlbumColumn('');
        setHasDiscogsColumn(false);
        setDiscogsColumn('');
        setProgress(0);
        setImportComplete(false);
        setFileParseError(undefined);
        setCurrentPage(1);
        // Clear temporary data
        delete (window as any)._tempImportRows;
        // Clear localStorage
        localStorage.removeItem(STORAGE_KEY);
      }
    });
  }, [importComplete]);

  // Toggle row selection
  const toggleRowSelection = useCallback((rowId: string) => {
    setRows(prev => prev.map(r => (r.id === rowId ? { ...r, selected: !r.selected } : r)));
  }, []);

  // Toggle all selection (for current page only)
  const toggleAllSelection = useCallback(() => {
    const pageRowIds = paginatedRows.map(r => r.id);
    const allPageSelected = paginatedRows.every(r => r.selected);
    setRows(prev => prev.map(r => 
      pageRowIds.includes(r.id) ? { ...r, selected: !allPageSelected } : r
    ));
  }, [paginatedRows]);

  // Handle sort
  const handleSort = useCallback((column: 'rowNumber' | 'artist' | 'album' | 'status') => {
    if (sortBy === column) {
      // Toggle sort order if clicking the same column
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortBy(column);
      setSortOrder('asc');
    }
  }, [sortBy]);

  // Edit row field
  const editRowField = useCallback((rowId: string, field: 'artist' | 'album' | 'discogsIdOrUrl', value: string) => {
    setRows(prev =>
      prev.map(r =>
        r.id === rowId ? { ...r, [field]: value, status: 'pending' as RowStatus, errorMessage: undefined } : r
      )
    );
  }, []);

  // Export failed rows
  const handleExportFailed = useCallback(() => {
    const failedRows = rows.filter(r => r.status === 'failed');
    if (failedRows.length === 0) {
      notifications.show({
        title: 'No Failed Rows',
        message: 'There are no failed rows to export',
        color: 'yellow'
      });
      return;
    }

    const csvContent = Papa.unparse({
      fields: ['Row #', 'Artist', 'Album', 'Discogs ID/URL', 'Error'],
      data: failedRows.map(r => [r.rowNumber, r.artist, r.album, r.discogsIdOrUrl || '', r.errorMessage || ''])
    });

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'failed_imports.csv';
    a.click();
    URL.revokeObjectURL(url);

    notifications.show({
      title: 'Export Complete',
      message: `Exported ${failedRows.length} failed rows`,
      color: 'green'
    });
  }, [rows]);

  // Get status badge
  const getStatusBadge = (status: RowStatus) => {
    const config = {
      pending: { color: 'gray', icon: <IconAlertCircle size={14} />, label: 'Pending' },
      fetching: { color: 'blue', icon: <Loader size={14} />, label: 'Fetching' },
      saving: { color: 'cyan', icon: <Loader size={14} />, label: 'Saving' },
      success: { color: 'green', icon: <IconCheck size={14} />, label: 'Success' },
      duplicate: { color: 'yellow', icon: <IconAlertCircle size={14} />, label: 'Duplicate' },
      failed: { color: 'red', icon: <IconX size={14} />, label: 'Failed' }
    };

    const { color, icon, label } = config[status];
    return (
      <Badge color={color} variant="light" leftSection={icon}>
        {label}
      </Badge>
    );
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>Batch Import</Title>
            <Text size="sm" c="dimmed" mt="xs">
              Upload a CSV or Excel file to import multiple records at once
            </Text>
          </div>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            onClick={handleClose}
            title="Close and return to collection"
          >
            <IconX size={20} />
          </ActionIcon>
        </Group>

        {/* File Upload Section */}
        {!file && (
          <Paper p="xl" withBorder>
            <Stack gap="md">
              <FileInput
                label="Select File"
                description="Upload a CSV or Excel (.xlsx, .xls) file containing your vinyl records"
                placeholder="Click to select file"
                accept=".csv,.xlsx,.xls"
                leftSection={<IconFileSpreadsheet size={16} />}
                value={file}
                onChange={handleFileUpload}
              />

              {fileParseError && (
                <Alert color="red" icon={<IconX size={16} />}>
                  {fileParseError}
                </Alert>
              )}
            </Stack>
          </Paper>
        )}

        {/* Column Mapping Section */}
        {file && columns.length > 0 && rows.length === 0 && (
          <Paper p="xl" withBorder>
            <Stack gap="md">
              <Title order={4}>Map Columns</Title>
              <Text size="sm" c="dimmed">
                Select which columns contain the artist and album information
              </Text>

              <Group grow>
                <Select
                  label="Artist Column"
                  placeholder="Select column"
                  data={columns}
                  value={artistColumn}
                  onChange={value => setArtistColumn(value || '')}
                  required
                  withAsterisk
                />
                <Select
                  label="Album Column"
                  placeholder="Select column"
                  data={columns}
                  value={albumColumn}
                  onChange={value => setAlbumColumn(value || '')}
                  required
                  withAsterisk
                />
              </Group>

              {(!artistColumn || !albumColumn) && (
                <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
                  Please select both Artist and Album columns to continue
                </Alert>
              )}

              <Checkbox
                label="My file contains Discogs IDs or URLs"
                checked={hasDiscogsColumn}
                onChange={e => setHasDiscogsColumn(e.currentTarget.checked)}
              />

              {hasDiscogsColumn && (
                <Select
                  label="Discogs ID/URL Column"
                  placeholder="Select column"
                  data={columns}
                  value={discogsColumn}
                  onChange={value => setDiscogsColumn(value || '')}
                />
              )}

              <Group>
                <Button 
                  onClick={() => {
                    // Create ImportRow objects from the temporarily stored data
                    const tempRows = (window as any)._tempImportRows || [];
                    const importRows: ImportRow[] = tempRows.map((rowData: any) => ({
                      id: `row-${rowData._index}`,
                      rowNumber: rowData._rowNumber,
                      artist: artistColumn ? (rowData[artistColumn] || '').toString().trim() : '',
                      album: albumColumn ? (rowData[albumColumn] || '').toString().trim() : '',
                      discogsIdOrUrl: hasDiscogsColumn && discogsColumn
                        ? (rowData[discogsColumn] || '').toString().trim()
                        : '',
                      status: 'pending' as RowStatus,
                      selected: true,
                      errorMessage: undefined,
                      recordData: undefined
                    }));
                    
                    setRows(importRows);
                    setCurrentPage(1);
                    setTimeout(checkDuplicates, 100);
                  }} 
                  leftSection={<IconCheck size={16} />}
                  disabled={!artistColumn || !albumColumn}
                >
                  Continue
                </Button>
                <Button variant="light" onClick={handleClearAll}>
                  Cancel
                </Button>
              </Group>
            </Stack>
          </Paper>
        )}

        {/* Import Table Section */}
        {rows.length > 0 && (
          <>
            {/* Stats */}
            <Group>
              <Badge size="lg">Total: {stats.total}</Badge>
              <Badge size="lg" color="blue">
                Selected: {stats.selected}
              </Badge>
              <Badge size="lg" color="gray">
                Pending: {stats.pending}
              </Badge>
              <Badge size="lg" color="green">
                Success: {stats.success}
              </Badge>
              <Badge size="lg" color="yellow">
                Duplicates: {stats.duplicate}
              </Badge>
              <Badge size="lg" color="red">
                Failed: {stats.failed}
              </Badge>
            </Group>

            {/* Progress */}
            {(processing || importComplete) && (
              <Paper p="md" withBorder>
                <Stack gap="xs">
                  {processing ? (
                    <>
                      <Group justify="space-between">
                        <Text size="sm" fw={500}>
                          Processing records...
                        </Text>
                        <Text size="sm" fw={500}>
                          {Math.round(progress)}%
                        </Text>
                      </Group>
                      <Progress value={progress} animated />
                      {currentProcessingRow && (
                        <Text size="xs" c="dimmed">
                          {stats.fetching > 0 && `Fetching from Discogs: `}
                          {stats.saving > 0 && `Uploading to database: `}
                          {currentProcessingRow.artist} - {currentProcessingRow.album}
                        </Text>
                      )}
                    </>
                  ) : importComplete ? (
                    <>
                      <Group justify="space-between">
                        <Text size="sm" fw={500} c="green">
                          Import Complete
                        </Text>
                        <Text size="sm" fw={500}>
                          100%
                        </Text>
                      </Group>
                      <Progress value={100} color="green" />
                      <Text size="xs" c="dimmed">
                        Success: {stats.success} • Duplicates: {stats.duplicate} • Failed: {stats.failed}
                      </Text>
                      <Text size="xs" c="dimmed" mt="xs">
                        Review the results below. Click "Start New Import" when ready to import another batch.
                      </Text>
                    </>
                  ) : null}
                </Stack>
              </Paper>
            )}

            {/* Action Buttons */}
            <Group>
              {processing ? (
                <Button
                  leftSection={<IconX size={16} />}
                  onClick={handleCancelImport}
                  variant="light"
                  color="red"
                  disabled={cancelRequested}
                >
                  {cancelRequested ? 'Cancelling...' : 'Cancel Import'}
                </Button>
              ) : (
                <>
                  <Button
                    leftSection={<IconPlayerPlay size={16} />}
                    onClick={handleUploadSelected}
                    disabled={stats.selected === 0}
                  >
                    Import Selected ({stats.selected})
                  </Button>
                  <Button
                    leftSection={<IconRefresh size={16} />}
                    onClick={handleRetryFailed}
                    disabled={stats.failed === 0}
                    variant="light"
                  >
                    Retry Failed ({stats.failed})
                  </Button>
                </>
              )}
              <Button
                leftSection={<IconDownload size={16} />}
                onClick={handleExportFailed}
                disabled={stats.failed === 0 || processing}
                variant="light"
              >
                Export Failed
              </Button>
              <Button 
                leftSection={<IconTrash size={16} />} 
                onClick={handleClearAll} 
                variant="light" 
                color="red"
                disabled={processing}
              >
                {importComplete ? 'Start New Import' : 'Clear All'}
              </Button>
            </Group>

            {/* Table */}
            <Paper withBorder>
              <ScrollArea>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 50 }}>
                        <Checkbox 
                          checked={paginatedRows.length > 0 && paginatedRows.every(r => r.selected)} 
                          onChange={toggleAllSelection}
                          indeterminate={paginatedRows.some(r => r.selected) && !paginatedRows.every(r => r.selected)}
                        />
                      </Table.Th>
                      <Table.Th 
                        style={{ width: 60, cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleSort('rowNumber')}
                      >
                        <Group gap={4} wrap="nowrap">
                          Row #
                          {sortBy === 'rowNumber' && (
                            sortOrder === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />
                          )}
                        </Group>
                      </Table.Th>
                      <Table.Th 
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleSort('artist')}
                      >
                        <Group gap={4} wrap="nowrap">
                          Artist
                          {sortBy === 'artist' && (
                            sortOrder === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />
                          )}
                        </Group>
                      </Table.Th>
                      <Table.Th 
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleSort('album')}
                      >
                        <Group gap={4} wrap="nowrap">
                          Album
                          {sortBy === 'album' && (
                            sortOrder === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />
                          )}
                        </Group>
                      </Table.Th>
                      {hasDiscogsColumn && <Table.Th>Discogs ID/URL</Table.Th>}
                      <Table.Th 
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleSort('status')}
                      >
                        <Group gap={4} wrap="nowrap">
                          Status
                          {sortBy === 'status' && (
                            sortOrder === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />
                          )}
                        </Group>
                      </Table.Th>
                      <Table.Th>Error</Table.Th>
                      <Table.Th style={{ width: 80 }}>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {paginatedRows.map(row => (
                      <Table.Tr key={row.id}>
                        <Table.Td>
                          <Checkbox
                            checked={row.selected}
                            onChange={() => toggleRowSelection(row.id)}
                            disabled={row.status === 'success'}
                          />
                        </Table.Td>
                        <Table.Td>{row.rowNumber}</Table.Td>
                        <Table.Td>
                          <TextInput
                            value={row.artist}
                            onChange={e => editRowField(row.id, 'artist', e.currentTarget.value)}
                            size="xs"
                            disabled={row.status === 'fetching' || row.status === 'saving' || row.status === 'success'}
                          />
                        </Table.Td>
                        <Table.Td>
                          <TextInput
                            value={row.album}
                            onChange={e => editRowField(row.id, 'album', e.currentTarget.value)}
                            size="xs"
                            disabled={row.status === 'fetching' || row.status === 'saving' || row.status === 'success'}
                          />
                        </Table.Td>
                        {hasDiscogsColumn && (
                          <Table.Td>
                            <TextInput
                              value={row.discogsIdOrUrl}
                              onChange={e => editRowField(row.id, 'discogsIdOrUrl', e.currentTarget.value)}
                              size="xs"
                              disabled={row.status === 'fetching' || row.status === 'saving' || row.status === 'success'}
                            />
                          </Table.Td>
                        )}
                        <Table.Td>{getStatusBadge(row.status)}</Table.Td>
                        <Table.Td>
                          {row.errorMessage && (
                            <Text size="xs" c="red">
                              {row.errorMessage}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {row.status === 'failed' && (
                            <ActionIcon
                              size="sm"
                              variant="light"
                              onClick={() => {
                                setRows(prev =>
                                  prev.map(r =>
                                    r.id === row.id ? { ...r, status: 'pending', errorMessage: undefined } : r
                                  )
                                );
                                setTimeout(() => processBatch([row]), 100);
                              }}
                            >
                              <IconRefresh size={14} />
                            </ActionIcon>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>

            {/* Pagination */}
            {totalPages > 1 && (
              <MyCustomPagination
                page={currentPage}
                onChange={setCurrentPage}
                total={totalPages}
                siblings={0}
                recordsPerPage={ROWS_PER_PAGE}
                totalRecords={rows.length}
              />
            )}
          </>
        )}
      </Stack>
    </Container>
  );
}


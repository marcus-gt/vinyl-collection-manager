import { useState, useCallback, useMemo } from 'react';
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
  IconUpload,
  IconFileSpreadsheet,
  IconRefresh,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconPlayerPlay,
  IconDownload,
  IconTrash
} from '@tabler/icons-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as lookupService from '../services/lookupService';
import { records } from '../services/api';
import type { VinylRecord } from '../types';
import { notifications } from '@mantine/notifications';

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

export default function BatchImport() {
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
    } catch (err) {
      console.error('Error processing row:', err);
      return {
        ...row,
        status: 'failed',
        errorMessage: 'Network error'
      };
    }
  };

  // Process batch
  const processBatch = useCallback(
    async (rowsToProcess: ImportRow[]) => {
      setProcessing(true);
      setProgress(0);
      setImportComplete(false);

      let processedCount = 0;
      const totalCount = rowsToProcess.length;

      // Status update callback
      const updateRowStatus = (rowId: string, status: RowStatus) => {
        setRows(prev => prev.map(r => (r.id === rowId ? { ...r, status } : r)));
      };

      // Process rows one at a time (sequential)
      for (const row of rowsToProcess) {
        const result = await processRow(row, updateRowStatus);

        // Update with final result
        setRows(prev => prev.map(r => (r.id === row.id ? result : r)));
        
        // Increment progress after each row
        processedCount += 1;
        setProgress((processedCount / totalCount) * 100);

        // Add delay between requests (0.5 seconds)
        if (processedCount < totalCount) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setProcessing(false);
      setImportComplete(true);

      // Show notification
      const successCount = rowsToProcess.filter(r => r.status === 'success').length;
      const failedCount = rowsToProcess.filter(r => r.status === 'failed').length;

      notifications.show({
        title: 'Import Complete',
        message: `Successfully imported ${successCount} records. ${failedCount} failed.`,
        color: failedCount > 0 ? 'yellow' : 'green'
      });
    },
    [processRow]
  );

  // Start import
  const handleStartImport = useCallback(() => {
    // Rows are already mapped when user clicks "Continue" in column mapping step
    const rowsToProcess = rows.filter(r => r.selected && r.status === 'pending');
    if (rowsToProcess.length === 0) {
      notifications.show({
        title: 'No Rows to Process',
        message: 'Please select rows to import',
        color: 'yellow'
      });
      return;
    }
    processBatch(rowsToProcess);
  }, [rows, processBatch]);

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

  // Clear all
  const handleClearAll = useCallback(() => {
    // If import just completed, confirm before clearing
    if (importComplete) {
      const confirmed = window.confirm(
        'Are you sure you want to clear the results? This will reset the batch import page.'
      );
      if (!confirmed) return;
    }
    
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
    // Clear temporary data
    delete (window as any)._tempImportRows;
  }, [importComplete]);

  // Toggle row selection
  const toggleRowSelection = useCallback((rowId: string) => {
    setRows(prev => prev.map(r => (r.id === rowId ? { ...r, selected: !r.selected } : r)));
  }, []);

  // Toggle all selection
  const toggleAllSelection = useCallback(() => {
    const allSelected = rows.every(r => r.selected);
    setRows(prev => prev.map(r => ({ ...r, selected: !allSelected })));
  }, [rows]);

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
        <div>
          <Title order={2}>Batch Import</Title>
          <Text size="sm" c="dimmed" mt="xs">
            Upload a CSV or Excel file to import multiple records at once
          </Text>
        </div>

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
                />
                <Select
                  label="Album Column"
                  placeholder="Select column"
                  data={columns}
                  value={albumColumn}
                  onChange={value => setAlbumColumn(value || '')}
                  required
                />
              </Group>

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
                <Button onClick={() => {
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
                  setTimeout(checkDuplicates, 100);
                }} leftSection={<IconCheck size={16} />}>
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
                      <Text size="xs" c="dimmed">
                        {stats.fetching > 0 && `Fetching: ${stats.fetching} • `}
                        {stats.saving > 0 && `Saving: ${stats.saving} • `}
                        Completed: {stats.success + stats.duplicate + stats.failed}
                      </Text>
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
                        Successfully imported: {stats.success} • Duplicates: {stats.duplicate} • Failed: {stats.failed}
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
              <Button
                leftSection={<IconPlayerPlay size={16} />}
                onClick={handleStartImport}
                disabled={processing || stats.pending === 0}
              >
                Start Import
              </Button>
              <Button
                leftSection={<IconRefresh size={16} />}
                onClick={handleRetryFailed}
                disabled={processing || stats.failed === 0}
                variant="light"
              >
                Retry Failed ({stats.failed})
              </Button>
              <Button
                leftSection={<IconUpload size={16} />}
                onClick={handleUploadSelected}
                disabled={processing || stats.selected === 0}
                variant="light"
              >
                Upload Selected ({stats.selected})
              </Button>
              <Button
                leftSection={<IconDownload size={16} />}
                onClick={handleExportFailed}
                disabled={stats.failed === 0}
                variant="light"
              >
                Export Failed
              </Button>
              <Button leftSection={<IconTrash size={16} />} onClick={handleClearAll} variant="light" color="red">
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
                        <Checkbox checked={rows.every(r => r.selected)} onChange={toggleAllSelection} />
                      </Table.Th>
                      <Table.Th style={{ width: 60 }}>Row #</Table.Th>
                      <Table.Th>Artist</Table.Th>
                      <Table.Th>Album</Table.Th>
                      {hasDiscogsColumn && <Table.Th>Discogs ID/URL</Table.Th>}
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Error</Table.Th>
                      <Table.Th style={{ width: 80 }}>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {rows.slice(0, 100).map(row => (
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
                {rows.length > 100 && (
                  <Alert m="md" color="blue">
                    Showing first 100 rows of {rows.length}. All rows will be processed.
                  </Alert>
                )}
              </ScrollArea>
            </Paper>
          </>
        )}
      </Stack>
    </Container>
  );
}


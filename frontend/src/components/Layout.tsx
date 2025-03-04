import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AppShell, Button, Group, Title, Burger, Drawer, Stack, Modal, FileInput, Text, Progress } from '@mantine/core';
import { IconDownload, IconUpload } from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext';
import { useDisclosure } from '@mantine/hooks';
import { useState, useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { records, type RecordsService, customColumns as customColumnsApi } from '../services/api';
import type { VinylRecord, CustomColumn, NewVinylRecord } from '../types';

const recordsService: RecordsService = records;

function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [opened, { toggle, close }] = useDisclosure(false);
  const [importModalOpened, setImportModalOpened] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);

  useEffect(() => {
    // Load custom columns when component mounts
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
    loadCustomColumns();
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleExportCSV = () => {
    window.dispatchEvent(new CustomEvent('export-collection-csv'));
  };

  const handleImportCSV = async () => {
    if (!csvFile) return;

    setImporting(true);
    setProgress(0);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result;
        if (typeof text !== 'string') {
          throw new Error('Failed to read CSV file');
        }

        // Parse CSV with proper handling of quoted values
        const parseCSVLine = (line: string): string[] => {
          const values: string[] = [];
          let currentValue = '';
          let insideQuotes = false;
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
              if (insideQuotes && line[i + 1] === '"') {
                // Handle escaped quotes
                currentValue += '"';
                i++;
              } else {
                // Toggle quote state
                insideQuotes = !insideQuotes;
              }
            } else if (char === ',' && !insideQuotes) {
              // End of value
              values.push(currentValue.trim());
              currentValue = '';
            } else {
              currentValue += char;
            }
          }
          
          // Add the last value
          values.push(currentValue.trim());
          return values;
        };

        // Parse CSV
        const lines = text.split('\n');
        const headers = parseCSVLine(lines[0]);
        const records = lines.slice(1).filter(line => line.trim());
        const totalRecords = records.length;

        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < records.length; i++) {
          try {
            // Update progress
            setProgress((i / totalRecords) * 100);

            // Process record
            const values = parseCSVLine(records[i]);
            const record: Partial<VinylRecord> = {
              added_from: 'csv_import',
              customValues: {}  // Initialize customValues object
            };

            headers.forEach((header, index) => {
              const value = values[index]?.trim();
              if (!value) return;

              // First try to match standard fields
              switch (header.toLowerCase()) {
                case 'artist':
                  record.artist = value;
                  break;
                case 'album':
                  record.album = value;
                  break;
                case 'original year':
                  record.year = parseInt(value);
                  break;
                case 'label':
                  record.label = value;
                  break;
                case 'country':
                  record.country = value;
                  break;
                case 'genres':
                  record.genres = value.split(';').map(g => g.trim());
                  break;
                case 'styles':
                  record.styles = value.split(';').map(s => s.trim());
                  break;
                case 'musicians':
                  record.musicians = value.split(';').map(m => m.trim());
                  break;
                case 'master url':
                  record.master_url = value;
                  break;
                case 'release url':
                  record.current_release_url = value;
                  break;
                default:
                  // If it's not a standard field, check if it's a custom column
                  const customColumn = customColumns.find(col => col.name === header);
                  if (customColumn) {
                    // Add to customValues if it's a custom column
                    record.customValues![customColumn.id] = value;
                  }
              }
            });

            // Add record
            const recordToAdd: NewVinylRecord = {
              artist: record.artist || 'Unknown Artist',
              album: record.album || 'Unknown Album',
              year: record.year,
              label: record.label,
              genres: record.genres || [],
              styles: record.styles || [],
              musicians: record.musicians || [],
              master_url: record.master_url || undefined,
              current_release_url: record.current_release_url || undefined,
              added_from: 'csv_import'
            };
            const response = await recordsService.add(recordToAdd);
            if (response.success) {
              successCount++;
            } else {
              failureCount++;
            }
          } catch (err) {
            console.error('Failed to process record:', err);
            failureCount++;
          }
        }

        setProgress(100);

        // Show completion notification
        notifications.show({
          title: 'Import Complete',
          message: `Successfully imported ${successCount} records. ${failureCount} records failed.`,
          color: failureCount > 0 ? 'yellow' : 'green'
        });

        // Trigger table refresh
        window.dispatchEvent(new CustomEvent('vinyl-collection-table-refresh'));

        // Reset state
        setImporting(false);
        setImportModalOpened(false);
        setCsvFile(null);
      };

      reader.readAsText(csvFile);
    } catch (err) {
      console.error('Failed to import CSV:', err);
      notifications.show({
        title: 'Import Failed',
        message: 'Failed to import CSV file. Please check the file format and try again.',
        color: 'red'
      });
      setImporting(false);
    }
  };

  const isCollectionPage = location.pathname === '/collection';

  const NavLinks = () => (
    <>
      {isCollectionPage && (
        <Group gap="xs">
          <Button variant="light" onClick={handleExportCSV} leftSection={<IconDownload size={16} />}>
            Export CSV
          </Button>
          <Button variant="light" onClick={() => setImportModalOpened(true)} leftSection={<IconUpload size={16} />}>
            Import CSV
          </Button>
        </Group>
      )}
      <Button variant="light" onClick={() => { handleLogout(); close(); }}>
        Logout
      </Button>
    </>
  );

  return (
    <>
      <AppShell
        header={{ height: { base: 60, sm: 60 } }}
        padding="0"
      >
        <AppShell.Header>
          <Group 
            justify="space-between" 
            h="100%" 
            px={{ base: 'xs', sm: 'md' }}
            align="center"
          >
            <Title 
              order={1} 
              size="h3"
              style={{
                fontSize: 'clamp(1.2rem, 4vw, 1.5rem)',
                lineHeight: 1.2
              }}
            >
              Vinyl Collection
            </Title>
            {user && (
              <>
                <Group visibleFrom="sm" gap="sm">
                  <NavLinks />
                </Group>
                <Burger opened={opened} onClick={toggle} hiddenFrom="sm" />
              </>
            )}
          </Group>
        </AppShell.Header>

        <AppShell.Main
          style={{
            height: '100vh',
            overflowY: 'auto',
            paddingTop: 'var(--app-shell-header-height)',
            backgroundColor: 'var(--mantine-color-dark-8)'
          }}
        >
          <Outlet />
        </AppShell.Main>
      </AppShell>

      <Drawer
        opened={opened}
        onClose={close}
        size="100%"
        padding="md"
        hiddenFrom="sm"
      >
        <Stack>
          <NavLinks />
        </Stack>
      </Drawer>

      <Modal
        opened={importModalOpened}
        onClose={() => {
          if (!importing) {
            setImportModalOpened(false);
            setCsvFile(null);
          }
        }}
        title="Import CSV"
        closeOnClickOutside={!importing}
        closeOnEscape={!importing}
        withCloseButton={!importing}
      >
        <Stack>
          <Text size="sm">
            Select a CSV file previously exported from your collection. This will add all records from the CSV to your collection.
          </Text>
          <FileInput
            accept=".csv"
            placeholder="Choose CSV file"
            value={csvFile}
            onChange={setCsvFile}
            clearable
            disabled={importing}
          />
          {importing && (
            <Progress 
              value={progress} 
              size="sm" 
              striped 
              animated
            >
              {Math.round(progress)}%
            </Progress>
          )}
          <Group justify="flex-end">
            <Button
              variant="light"
              onClick={() => setImportModalOpened(false)}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImportCSV}
              loading={importing}
              disabled={!csvFile}
            >
              Import
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export default Layout; 

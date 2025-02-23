import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AppShell, Button, Group, Title, Burger, Drawer, Stack, Modal, FileInput, Text, Progress } from '@mantine/core';
import { IconDownload, IconUpload } from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext';
import { useDisclosure } from '@mantine/hooks';
import { useState } from 'react';
import { notifications } from '@mantine/notifications';
import { records } from '../services/api';
import type { VinylRecord } from '../types';

function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [opened, { toggle, close }] = useDisclosure(false);
  const [importModalOpened, setImportModalOpened] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

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
      const text = await csvFile.text();
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());

      // Validate headers
      const requiredHeaders = [
        'Artist', 'Album', 'Original Year', 'Label', 'Genres', 'Styles',
        'Musicians', 'Added', 'Scanned Release Year', 'Master URL', 'Release URL'
      ];

      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        throw new Error(`Invalid CSV format. Missing headers: ${missingHeaders.join(', ')}`);
      }

      // Process records
      const recordsToImport: VinylRecord[] = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = lines[i].split(',').map(v => {
          // Remove quotes and trim
          return v.replace(/^"(.*)"$/, '$1').trim();
        });

        // Create record object
        const record: VinylRecord = {
          artist: values[headers.indexOf('Artist')],
          album: values[headers.indexOf('Album')],
          year: values[headers.indexOf('Original Year')] ? parseInt(values[headers.indexOf('Original Year')]) : undefined,
          label: values[headers.indexOf('Label')],
          genres: values[headers.indexOf('Genres')].split(';').map(g => g.trim()).filter(Boolean),
          styles: values[headers.indexOf('Styles')].split(';').map(s => s.trim()).filter(Boolean),
          musicians: values[headers.indexOf('Musicians')].split(';').map(m => m.trim()).filter(Boolean),
          master_url: values[headers.indexOf('Master URL')] || null,
          current_release_url: values[headers.indexOf('Release URL')] || null,
          current_release_year: values[headers.indexOf('Scanned Release Year')] ? 
            parseInt(values[headers.indexOf('Scanned Release Year')]) : undefined,
          added_from: 'csv_import'
        };

        // Add custom column values if they exist
        const customValues: Record<string, string> = {};
        headers.forEach((header, index) => {
          if (!requiredHeaders.includes(header) && header !== 'Added') {
            customValues[header] = values[index];
          }
        });

        if (Object.keys(customValues).length > 0) {
          record.customValues = customValues;
        }

        recordsToImport.push(record);
      }

      // Import records
      let imported = 0;
      for (const record of recordsToImport) {
        try {
          await records.add(record);
          imported++;
          setProgress((imported / recordsToImport.length) * 100);
        } catch (error) {
          console.error('Failed to import record:', record, error);
        }
      }

      notifications.show({
        title: 'Import Complete',
        message: `Successfully imported ${imported} of ${recordsToImport.length} records`,
        color: 'green'
      });

      // Trigger table refresh
      window.dispatchEvent(new CustomEvent('vinyl-collection-table-refresh'));

    } catch (error) {
      notifications.show({
        title: 'Import Failed',
        message: error instanceof Error ? error.message : 'Failed to import CSV file',
        color: 'red'
      });
    } finally {
      setImporting(false);
      setImportModalOpened(false);
      setCsvFile(null);
      setProgress(0);
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
        header={{
          height: 80,      // Start at 80px for mobile
          fixed: true      // The header is pinned
        }}
        styles={(theme) => ({
          // The <AppShell.Main> container is the single scrollable area:
          main: {
            // Push this content below the header. On small screens, 80px:
            paddingTop: 80,
            height: 'calc(100vh - 80px)',
            overflowY: 'auto',
            margin: 0,
            padding: 0,

            // On screens larger than "sm", use 60px
            [theme.fn.largerThan('sm')]: {
              paddingTop: 60,
              height: 'calc(100vh - 60px)'
            }
          },

          header: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,

            backgroundColor: 'var(--mantine-color-dark-7)',
            borderBottom: '1px solid var(--mantine-color-dark-4)',

            // 80px tall on smaller screens
            height: 80,
            [theme.fn.largerThan('sm')]: {
              // 60px on desktop
              height: 60
            }
          }
        })}
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

        <AppShell.Main>
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

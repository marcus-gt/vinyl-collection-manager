import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AppShell, Button, Group, Title, Burger, Drawer, Stack, Modal, FileInput, Text, Progress } from '@mantine/core';
import { IconDownload, IconUpload } from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext';
import { useDisclosure } from '@mantine/hooks';
import { useState } from 'react';
import { notifications } from '@mantine/notifications';
import { records, type RecordsService } from '../services/api';
import type { VinylRecord } from '../types';

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

        // Parse CSV
        const lines = text.split('\n');
        const headers = lines[0].split(',');
        const records = lines.slice(1).filter(line => line.trim());
        const totalRecords = records.length;

        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < records.length; i++) {
          try {
            // Update progress
            setProgress((i / totalRecords) * 100);

            // Process record
            const values = records[i].split(',');
            const record: Partial<VinylRecord> = {};

            headers.forEach((header, index) => {
              const value = values[index]?.trim();
              if (!value) return;

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
              }
            });

            // Add record
            const response = await recordsService.add(record);
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

  const isCollectionPage = location.pathname === '/';

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
        header={{ height: { base: 80, sm: 60 } }}
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
            width: '100%',
            maxWidth: '100%',
            backgroundColor: 'var(--mantine-color-dark-8)',
            paddingTop: 'var(--app-shell-header-height)',
            minHeight: '100vh'
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

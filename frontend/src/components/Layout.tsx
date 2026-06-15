import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AppShell, Button, Group, Title, Burger, Drawer, Stack, Modal, FileInput, Text, Progress } from '@mantine/core';
import { IconDownload, IconUpload, IconNetwork } from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext';
import { useDisclosure } from '@mantine/hooks';
import { useState, useEffect } from 'react';
import { customColumns as customColumnsApi } from '../services/api';
import type { CustomColumn } from '../types';
import { appEvents } from '../lib/appEvents';
import { useCsvImport } from '../hooks/useCsvImport';

function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [opened, { toggle, close }] = useDisclosure(false);
  const [importModalOpened, setImportModalOpened] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const { importing, progress, importCsv } = useCsvImport(customColumns);

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
    appEvents.emit('exportCollectionCsv');
  };

  const handleImportCSV = async () => {
    if (!csvFile) return;

    const completed = await importCsv(csvFile);
    if (completed) {
      setImportModalOpened(false);
      setCsvFile(null);
    }
  };

  const isCollectionPage = location.pathname === '/collection';
  const isMusicianNetworkPage = location.pathname === '/musician-network';

  const NavLinks = () => (
    <>
      {!isMusicianNetworkPage && (
        <Button 
          variant="light" 
          onClick={() => { navigate('/musician-network'); close(); }} 
          leftSection={<IconNetwork size={16} />}
        >
          Musician Network
        </Button>
      )}
      {!isCollectionPage && (
        <Button 
          variant="light" 
          onClick={() => { navigate('/collection'); close(); }}
        >
          Collection
        </Button>
      )}
      {isCollectionPage && (
        <>
          <style dangerouslySetInnerHTML={{ __html: `
            .csv-buttons-wrapper {
              display: flex;
              gap: var(--mantine-spacing-xs);
            }
            .csv-buttons-wrapper button {
              flex: 1;
            }
          `}} />
          <div className="csv-buttons-wrapper">
            <Button variant="light" onClick={handleExportCSV} leftSection={<IconDownload size={16} />}>
              Export CSV
            </Button>
            <Button variant="light" onClick={() => setImportModalOpened(true)} leftSection={<IconUpload size={16} />}>
              Import CSV
            </Button>
          </div>
        </>
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

import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AppShell, Button, Group, Title, Burger, Drawer, Stack } from '@mantine/core';
import { useAuth } from '../contexts/AuthContext';
import { useDisclosure } from '@mantine/hooks';
import { IconDownload } from '@tabler/icons-react';

function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [opened, { toggle, close }] = useDisclosure(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isCollectionPage = location.pathname === '/collection';

  const NavLinks = () => (
    <>
      {isCollectionPage && (
        <Button 
          variant="light"
          leftSection={<IconDownload size={16} />}
          onClick={() => {
            // Dispatch event that Collection component will listen for
            window.dispatchEvent(new CustomEvent('export-collection-csv'));
            close();
          }}
        >
          Export CSV
        </Button>
      )}
      <Button variant="light" onClick={() => { handleLogout(); close(); }}>
        Logout
      </Button>
    </>
  );

  return (
    <AppShell
      header={{ height: 60 }}
      padding={{ base: 'xs', sm: 'md' }}
      styles={{
        header: {
          padding: 0
        },
        main: {
          paddingTop: 'calc(var(--app-shell-header-height) + var(--mantine-spacing-xs))'
        }
      }}
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

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

export default Layout; 

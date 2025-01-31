import { Outlet, Link, useNavigate } from 'react-router-dom';
import { AppShell, Button, Group, Title, Burger, Drawer, Stack } from '@mantine/core';
import { useAuth } from '../contexts/AuthContext';
import { useDisclosure } from '@mantine/hooks';

function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [opened, { toggle, close }] = useDisclosure(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const NavLinks = () => (
    <>
      <Button variant="subtle" component={Link} to="/collection" onClick={close}>
        Collection
      </Button>
      <Button variant="subtle" component={Link} to="/scanner" onClick={close}>
        Scanner
      </Button>
      <Button variant="light" onClick={() => { handleLogout(); close(); }}>
        Logout
      </Button>
    </>
  );

  return (
    <AppShell
      header={{ height: 60 }}
      padding="xs"
    >
      <AppShell.Header>
        <Group justify="space-between" h="100%" px="xs">
          <Title order={1} size="h3">Vinyl Collection</Title>
          {user && (
            <>
              <Group visibleFrom="sm">
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

      <AppShell.Main pt="lg">
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

export default Layout; 

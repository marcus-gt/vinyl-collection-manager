import { useEffect, useState } from 'react';
import { Container, Title, Text, Tabs, Loader, Center, Alert, Button, Group } from '@mantine/core';
import { IconNetworkOff, IconAlertCircle } from '@tabler/icons-react';
import { musicianNetwork, type MusicianNetworkData } from '../services/api';
import NetworkGraph from '../components/NetworkGraph';

export default function MusicianNetwork() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MusicianNetworkData | null>(null);

  useEffect(() => {
    loadNetworkData();
  }, []);

  const loadNetworkData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await musicianNetwork.getData();
      
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || 'Failed to load musician network');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Error loading musician network:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Center style={{ minHeight: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <Loader size="lg" mb="md" />
            <Text>Analyzing your collection...</Text>
            <Text size="sm" c="dimmed">This may take a moment</Text>
          </div>
        </Center>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="lg" py="xl">
        <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" mb="md">
          {error}
        </Alert>
        <Button onClick={loadNetworkData}>Try Again</Button>
      </Container>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <Container size="lg" py="xl">
        <Center style={{ minHeight: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <IconNetworkOff size={64} style={{ opacity: 0.5 }} />
            <Title order={3} mt="md">No Musician Data</Title>
            <Text c="dimmed" mt="sm">
              Your collection doesn't have musician information yet.
            </Text>
            <Text c="dimmed" size="sm">
              Add records with musician data to see the network analysis.
            </Text>
          </div>
        </Center>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="xl">
        <div>
          <Title order={1}>Musician Network</Title>
          <Text c="dimmed" size="sm" mt="xs">
            Explore connections between musicians and artists in your collection
          </Text>
        </div>
        <Button variant="light" onClick={loadNetworkData}>
          Refresh
        </Button>
      </Group>

      {/* Stats Summary */}
      <Group mb="xl" gap="lg">
        <div>
          <Text size="xl" fw={700}>{data.stats.unique_musicians}</Text>
          <Text size="sm" c="dimmed">Musicians</Text>
        </div>
        <div>
          <Text size="xl" fw={700}>{data.stats.unique_artists}</Text>
          <Text size="sm" c="dimmed">Artists</Text>
        </div>
        <div>
          <Text size="xl" fw={700}>{data.stats.total_connections}</Text>
          <Text size="sm" c="dimmed">Connections</Text>
        </div>
        <div>
          <Text size="xl" fw={700}>{data.stats.unique_albums}</Text>
          <Text size="sm" c="dimmed">Albums</Text>
        </div>
      </Group>

      <Tabs defaultValue="network">
        <Tabs.List>
          <Tabs.Tab value="network">🌐 Network</Tabs.Tab>
          <Tabs.Tab value="top">🏆 Top Musicians</Tabs.Tab>
          <Tabs.Tab value="session">🎭 Session Musicians</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="network" pt="xl">
          <NetworkGraph data={data} />
        </Tabs.Panel>

        <Tabs.Panel value="top" pt="xl">
          <Title order={3} mb="md">Top Musicians by Record Appearances</Title>
          
          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {data.musician_stats.slice(0, 20).map((musician, idx) => (
              <div 
                key={musician.musician}
                style={{
                  padding: '12px',
                  borderBottom: '1px solid #eee',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ flex: 1 }}>
                  <Text fw={500}>
                    {idx + 1}. {musician.musician}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {musician.total_records} records • {musician.as_main_artist} as main artist • {musician.as_session_musician} as session
                  </Text>
                </div>
              </div>
            ))}
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="session" pt="xl">
          <Title order={3} mb="md">Session Musicians</Title>
          <Text size="sm" c="dimmed" mb="md">
            Musicians who appear on multiple records but rarely as the main artist
          </Text>
          
          {data.session_musicians.length === 0 ? (
            <Alert color="gray">
              No session musicians found with the current criteria (min 2 records, 70% session ratio)
            </Alert>
          ) : (
            <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
              {data.session_musicians.map((musician, idx) => (
                <div 
                  key={musician.musician}
                  style={{
                    padding: '12px',
                    borderBottom: '1px solid #eee',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <Text fw={500}>
                      {idx + 1}. {musician.musician}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {musician.total_records} records • {musician.as_session_musician} session appearances ({Math.round(musician.session_ratio * 100)}% session ratio)
                    </Text>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}


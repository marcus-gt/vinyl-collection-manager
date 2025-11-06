import { useEffect, useState, useMemo, useRef } from 'react';
import { Container, Title, Text, Tabs, Loader, Center, Alert, Button, Group, Stack, Select, MultiSelect, Box, Collapse, Badge, Paper, SegmentedControl } from '@mantine/core';
import { IconNetworkOff, IconAlertCircle, IconPlus, IconX, IconFilter, IconChevronDown, IconChevronUp, IconSearch } from '@tabler/icons-react';
import { musicianNetwork, type MusicianNetworkData, type MusicianStats } from '../services/api';
import NetworkGraph from '../components/NetworkGraph';
import * as echarts from 'echarts';

interface CustomFilter {
  id: number;
  column: string;
  selectedValues: string[];
}

export default function MusicianNetwork() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MusicianNetworkData | null>(null);
  
  // Filter state
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedMainCategories, setSelectedMainCategories] = useState<string[]>(['Instruments', 'Vocals', 'Production']);
  const [selectedSubCategories, setSelectedSubCategories] = useState<Record<string, string[]>>({});
  const [customFilters, setCustomFilters] = useState<CustomFilter[]>([]);
  const [nextFilterId, setNextFilterId] = useState(1);
  const [filtersOpened, setFiltersOpened] = useState(false);

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

  // Helper functions for filters
  const addCustomFilter = () => {
    setCustomFilters([...customFilters, {
      id: nextFilterId,
      column: '',
      selectedValues: [],
    }]);
    setNextFilterId(nextFilterId + 1);
  };

  const removeCustomFilter = (id: number) => {
    setCustomFilters(customFilters.filter(f => f.id !== id));
  };

  const updateCustomFilter = (id: number, column: string, values: string[]) => {
    setCustomFilters(customFilters.map(f =>
      f.id === id ? { ...f, column, selectedValues: values } : f
    ));
  };

  // Compute available roles based on selected categories
  const availableRoles = useMemo(() => {
    if (!data) return [];
    
    // If no category filter, return all roles
    if (selectedMainCategories.length === 0) {
      return data.clean_roles;
    }
    
    // Filter links based on selected categories
    const filteredLinks = data.links.filter((link: any) => {
      const mainCategory = link.main_category;
      const subCategory = link.sub_category;
      
      // Must match main category
      if (!selectedMainCategories.includes(mainCategory)) {
        return false;
      }
      
      // If Instruments subcategory filter is active, must match
      if (mainCategory === 'Instruments' && 
          selectedSubCategories['Instruments'] && 
          selectedSubCategories['Instruments'].length > 0) {
        if (!selectedSubCategories['Instruments'].includes(subCategory)) {
          return false;
        }
      }
      
      return true;
    });
    
    // Extract unique roles from filtered links
    const rolesSet = new Set<string>();
    filteredLinks.forEach((link: any) => {
      if (link.clean_roles) {
        link.clean_roles.forEach((role: string) => rolesSet.add(role));
      }
    });
    
    return Array.from(rolesSet).sort();
  }, [data, selectedMainCategories, selectedSubCategories]);

  // Compute filtered data based on current filters
  const filteredData = useMemo(() => {
    if (!data) return null;

    const hasCategoryFilter = selectedMainCategories.length > 0;
    const hasRoleFilter = selectedRoles.length > 0;
    const hasCustomFilters = customFilters.some(f => f.column && f.selectedValues.length > 0);
    
    if (!hasCategoryFilter && !hasRoleFilter && !hasCustomFilters) {
      return data; // No filters, return original data
    }

    // Filter links based on criteria
    const filteredLinks = data.links.filter((link: any) => {
      // Category filter
      if (hasCategoryFilter) {
        const mainCategory = link.main_category;
        const subCategory = link.sub_category;
        
        // If main category doesn't match any selected, exclude this link
        if (!selectedMainCategories.includes(mainCategory)) {
          return false;
        }
        
        // If this main category has subcategory filters, check them
        if (selectedSubCategories[mainCategory] && selectedSubCategories[mainCategory].length > 0) {
          if (!selectedSubCategories[mainCategory].includes(subCategory)) {
            return false;
          }
        }
      }
      
      // Role filter
      if (hasRoleFilter) {
        const hasSelectedRole = link.roles && link.roles.some((role: string) => 
          selectedRoles.includes(role)
        );
        if (!hasSelectedRole) return false;
      }

      // Custom filters - check link.custom_data
      for (const filter of customFilters) {
        if (!filter.column || filter.selectedValues.length === 0) continue;
        
        if (link.custom_data && link.custom_data[filter.column]) {
          const linkValue = link.custom_data[filter.column];
          let hasMatch = false;
          
          if (Array.isArray(linkValue)) {
            hasMatch = linkValue.some((val: any) => {
              const strVal = String(val);
              if (strVal.includes(',')) {
                const parts = strVal.split(',').map(p => p.trim());
                return parts.some(part => filter.selectedValues.includes(part));
              }
              return filter.selectedValues.includes(strVal);
            });
          } else {
            const strVal = String(linkValue);
            if (strVal.includes(',')) {
              const parts = strVal.split(',').map(p => p.trim());
              hasMatch = parts.some(part => filter.selectedValues.includes(part));
            } else {
              hasMatch = filter.selectedValues.includes(strVal);
            }
          }
          
          if (!hasMatch) return false;
        } else {
          return false;
        }
      }
      
      return true;
    });

    // Get all node IDs that are part of filtered links
    const activeNodeIds = new Set<string>();
    filteredLinks.forEach((link) => {
      activeNodeIds.add(link.source);
      activeNodeIds.add(link.target);
    });

    // Filter nodes - only keep nodes that have at least one connection
    const filteredNodes = data.nodes.filter((node) => 
      activeNodeIds.has(node.id)
    );

    // Filter musician stats - only keep musicians that are in the filtered nodes
    const filteredMusicianStats = data.musician_stats.filter((stat: MusicianStats) =>
      activeNodeIds.has(stat.musician)
    );

    // Filter session musicians similarly
    const filteredSessionMusicians = data.session_musicians.filter((stat: MusicianStats) =>
      activeNodeIds.has(stat.musician)
    );

    // Update stats
    const filteredStats = {
      ...data.stats,
      total_connections: filteredLinks.length,
      unique_musicians: filteredNodes.filter(n => n.category === 'musician').length,
      unique_artists: filteredNodes.filter(n => n.category === 'artist').length,
      unique_albums: new Set(filteredLinks.flatMap((l: any) => l.albums || [])).size,
    };

    return {
      ...data,
      nodes: filteredNodes,
      links: filteredLinks,
      musician_stats: filteredMusicianStats,
      session_musicians: filteredSessionMusicians,
      stats: filteredStats,
    };
  }, [data, selectedRoles, selectedMainCategories, selectedSubCategories, customFilters]);

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

  // Get available columns for custom filters
  const availableColumns = data ? Object.keys(data.custom_filters || {}) : [];

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

      {/* Collapsible Filters */}
      <Box mb="lg">
        <Button
          variant="light"
          size="sm"
          onClick={() => setFiltersOpened(!filtersOpened)}
          rightSection={filtersOpened ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          leftSection={<IconFilter size={16} />}
          fullWidth={false}
        >
          Filters
          {(selectedRoles.length > 0 || selectedMainCategories.length > 0 || customFilters.some(f => f.selectedValues.length > 0)) && (
            <Badge size="sm" ml="xs" variant="filled" color="blue">
              {selectedRoles.length + selectedMainCategories.length + Object.values(selectedSubCategories).flat().length + customFilters.filter(f => f.selectedValues.length > 0).length}
            </Badge>
          )}
        </Button>

        <Collapse in={filtersOpened}>
          <Box 
            mt="sm"
            p="md" 
            style={{ 
              backgroundColor: 'var(--mantine-color-dark-6)',
              borderRadius: '8px',
              border: '1px solid var(--mantine-color-dark-4)',
            }}
          >
            <Stack gap="md">
              {/* Contributor Category Filters */}
              <Box>
                <Text size="sm" fw={500} mb="xs">Contributor Categories</Text>
                <Stack gap="sm">
                  <MultiSelect
                    label="Main Categories"
                    placeholder="All categories"
                    data={data?.contributor_categories ? Object.keys(data.contributor_categories) : []}
                    value={selectedMainCategories}
                    onChange={setSelectedMainCategories}
                    searchable
                    clearable
                    size="sm"
                  />
                  
                  {/* Only show subcategories for Instruments */}
                  {selectedMainCategories.includes('Instruments') && (
                    <MultiSelect
                      label="Instruments - Subcategories"
                      placeholder="All instruments"
                      data={data?.contributor_categories?.['Instruments'] || []}
                      value={selectedSubCategories['Instruments'] || []}
                      onChange={(values) => {
                        setSelectedSubCategories(prev => ({
                          ...prev,
                          'Instruments': values
                        }));
                      }}
                      searchable
                      clearable
                      size="sm"
                    />
                  )}
                </Stack>
              </Box>

              {/* Role Filter */}
              <MultiSelect
                label="Role"
                placeholder="All roles"
                data={availableRoles}
                value={selectedRoles}
                onChange={setSelectedRoles}
                searchable
                clearable
                size="sm"
              />

              {/* Custom Filters */}
              <Box>
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={500}>Custom Filters</Text>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={addCustomFilter}
                    leftSection={<IconPlus size={14} />}
                  >
                    Add Filter
                  </Button>
                </Group>

                <Stack gap="sm">
                  {customFilters.map((filter) => (
                    <Group key={filter.id} gap="sm" wrap="nowrap">
                      <Select
                        placeholder="Column..."
                        data={availableColumns}
                        value={filter.column}
                        onChange={(value) => updateCustomFilter(filter.id, value || '', [])}
                        searchable
                        clearable
                        size="sm"
                        style={{ minWidth: '150px', flex: '0 0 auto' }}
                      />
                      {filter.column && data && (
                        <MultiSelect
                          placeholder="Values..."
                          data={data.custom_filters[filter.column] || []}
                          value={filter.selectedValues}
                          onChange={(values) => updateCustomFilter(filter.id, filter.column, values)}
                          searchable
                          clearable
                          size="sm"
                          style={{ flex: '1 1 auto', minWidth: '200px' }}
                        />
                      )}
                      <Button
                        size="sm"
                        color="red"
                        variant="subtle"
                        onClick={() => removeCustomFilter(filter.id)}
                        px={8}
                      >
                        <IconX size={16} />
                      </Button>
                    </Group>
                  ))}
                  {customFilters.length === 0 && (
                    <Text size="sm" c="dimmed" fs="italic">
                      No custom filters added
                    </Text>
                  )}
                </Stack>
              </Box>

              {/* Clear all button */}
              {(selectedRoles.length > 0 || selectedMainCategories.length > 0 || customFilters.some(f => f.selectedValues.length > 0)) && (
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Showing {filteredData?.nodes.length || 0} nodes, {filteredData?.links.length || 0} connections
                  </Text>
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => {
                      setSelectedRoles([]);
                      setSelectedMainCategories([]);
                      setSelectedSubCategories({});
                      setCustomFilters([]);
                    }}
                  >
                    Clear All
                  </Button>
                </Group>
              )}
            </Stack>
          </Box>
        </Collapse>
      </Box>

      {/* Stats Summary - uses filtered data */}
      <Group mb="xl" gap="lg">
        <div>
          <Text size="xl" fw={700}>{filteredData?.stats.unique_musicians || 0}</Text>
          <Text size="sm" c="dimmed">Musicians</Text>
        </div>
        <div>
          <Text size="xl" fw={700}>{filteredData?.stats.unique_artists || 0}</Text>
          <Text size="sm" c="dimmed">Artists</Text>
        </div>
        <div>
          <Text size="xl" fw={700}>{filteredData?.stats.total_connections || 0}</Text>
          <Text size="sm" c="dimmed">Connections</Text>
        </div>
        <div>
          <Text size="xl" fw={700}>{filteredData?.stats.unique_albums || 0}</Text>
          <Text size="sm" c="dimmed">Albums</Text>
        </div>
      </Group>

              <Tabs defaultValue="network">
                <Tabs.List>
                  <Tabs.Tab value="network">🌐 Network</Tabs.Tab>
                  <Tabs.Tab value="musicians">🎵 Musicians</Tabs.Tab>
                </Tabs.List>

        <Tabs.Panel value="network" pt="xl">
          <Title order={3} mb="md">Network Visualization</Title>
          <Text size="sm" c="dimmed" mb="md">
            Hover for details • Drag to move • Scroll to zoom
          </Text>
          {filteredData && <NetworkGraph data={filteredData} />}
        </Tabs.Panel>

        <Tabs.Panel value="musicians" pt="xl">
          <CombinedMusiciansPanel data={filteredData || data} />
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}

// Combined Musicians Panel (Top Musicians + Lookup)
interface CombinedMusiciansPanelProps {
  data: MusicianNetworkData;
}

function CombinedMusiciansPanel({ data }: CombinedMusiciansPanelProps) {
  const [sortBy, setSortBy] = useState<'total' | 'main' | 'session'>('total');

  return (
    <Stack gap="xl">
      {/* Top Musicians Section */}
      <div>
        <Title order={3} mb="md">🏆 Top 15</Title>
        <Text size="sm" c="dimmed" mb="lg">
          Musicians ranked by record count, showing main artist vs session work breakdown
        </Text>

        <Paper
          p="md"
          style={{
            backgroundColor: '#2e2e2e',
            borderRadius: '8px',
          }}
        >
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
            gap: '20px',
            width: '100%'
          }}>
            <TopMusiciansChart data={data} sortBy={sortBy} onSortByChange={setSortBy} />
            <SessionScatterChart data={data} />
          </div>
        </Paper>
      </div>

      {/* Musician Lookup Section */}
      <div>
        <MusicianLookupPanel data={data} />
      </div>
    </Stack>
  );
}

// Musician Lookup Panel
interface MusicianLookupPanelProps {
  data: MusicianNetworkData;
}

function MusicianLookupPanel({ data }: MusicianLookupPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMusician, setSelectedMusician] = useState<string | null>(null);

  // Get all unique musicians for the dropdown
  const allMusicians = useMemo(() => {
    return data.musician_stats
      .map(m => m.musician)
      .sort((a, b) => a.localeCompare(b));
  }, [data]);

  // Filter musicians based on search
  const filteredMusicians = useMemo(() => {
    if (!searchQuery) return allMusicians;
    const query = searchQuery.toLowerCase();
    return allMusicians.filter(m => m.toLowerCase().includes(query));
  }, [allMusicians, searchQuery]);

  // Get detailed info for selected musician
  const musicianDetails = useMemo(() => {
    if (!selectedMusician) return null;

    const stats = data.musician_stats.find(m => m.musician === selectedMusician);
    if (!stats) return null;

    // Find all connections (links) involving this musician
    const connections = data.links.filter(
      link => link.source === selectedMusician || link.target === selectedMusician
    );

    // Build two lists:
    // 1. Albums with roles (where musician is working)
    // Key: "artist - album" to uniquely identify each album
    const albumsWithRoles = new Map<string, {
      artist: string;
      album: string;
      roles: Set<string>;
    }>();
    
    // 2. Artists they've collaborated with
    const artistCollaborations = new Map<string, Set<string>>();

    connections.forEach(link => {
      // In the network graph: Musician (source) -> Artist (target)
      // If selected musician is the source, they're working as a session musician for the target artist
      // If selected musician is the target, they're the main artist and source is a session musician working for them
      
      if (link.source === selectedMusician) {
        // Selected musician is working as a session musician for link.target (the artist)
        const artist = link.target;
        
        // Add to artist collaborations
        if (!artistCollaborations.has(artist)) {
          artistCollaborations.set(artist, new Set());
        }
        if (link.albums) {
          link.albums.forEach(album => artistCollaborations.get(artist)!.add(album));
        }

        // Add to albums with roles
        if (link.albums && link.roles) {
          link.albums.forEach(album => {
            const key = `${artist} - ${album}`;
            if (!albumsWithRoles.has(key)) {
              albumsWithRoles.set(key, {
                artist: artist,
                album: album,
                roles: new Set(),
              });
            }
            link.roles.forEach(role => albumsWithRoles.get(key)!.roles.add(role));
          });
        }
      } else if (link.target === selectedMusician) {
        // Selected musician is the main artist, link.source is a collaborator
        const collaborator = link.source;
        
        // Add to artist collaborations (in this case, it's musicians who worked with them)
        if (!artistCollaborations.has(collaborator)) {
          artistCollaborations.set(collaborator, new Set());
        }
        if (link.albums) {
          link.albums.forEach(album => artistCollaborations.get(collaborator)!.add(album));
        }

        // For albums where they're the main artist, we also want to show these albums
        // Use the link's roles which are the collaborator's roles, but we'll mark these differently
        if (link.albums) {
          link.albums.forEach(album => {
            const key = `${selectedMusician} - ${album}`;
            if (!albumsWithRoles.has(key)) {
              // For albums where they're the main artist, mark them as such
              // We don't have their specific roles in this link (it shows collaborator's roles)
              albumsWithRoles.set(key, {
                artist: selectedMusician,
                album: album,
                roles: new Set(['Main Artist']),
              });
            }
          });
        }
      }
    });

    // Convert to sorted arrays and separate main artist albums from session work
    const allAlbums = Array.from(albumsWithRoles.values())
      .map(data => ({
        album: data.album,
        artist: data.artist,
        roles: Array.from(data.roles).sort().join(', '),
        isMainArtist: data.artist === selectedMusician,
      }));
    
    // Separate main artist albums from session work
    const mainArtistAlbums = allAlbums
      .filter(a => a.isMainArtist)
      .sort((a, b) => a.album.localeCompare(b.album));
    
    const sessionAlbums = allAlbums
      .filter(a => !a.isMainArtist)
      .sort((a, b) => {
        // Sort by artist first, then album
        const artistCompare = a.artist.localeCompare(b.artist);
        return artistCompare !== 0 ? artistCompare : a.album.localeCompare(b.album);
      });

    const artistsList = Array.from(artistCollaborations.entries())
      .filter(([artist]) => artist !== selectedMusician) // Remove themselves from collaborations
      .map(([artist, albums]) => ({
        artist,
        albums: Array.from(albums).sort(),
        albumCount: albums.size,
      }))
      .sort((a, b) => b.albumCount - a.albumCount);

    return {
      stats,
      mainArtistAlbums,
      sessionAlbums,
      artists: artistsList,
    };
  }, [selectedMusician, data]);

  return (
    <>
      <Title order={3} mb="md">🔍 Musician Lookup</Title>
      <Text size="sm" c="dimmed" mb="lg">
        Search for any musician to see their complete work history in your collection
      </Text>

      <Select
        placeholder="Search for a musician..."
        data={filteredMusicians}
        value={selectedMusician}
        onChange={setSelectedMusician}
        searchable
        clearable
        size="md"
        mb="xl"
        leftSection={<IconSearch size={16} />}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        maxDropdownHeight={300}
        nothingFoundMessage="No musicians found"
        comboboxProps={{ withinPortal: false }}
      />

      {!selectedMusician && (
        <Center py="xl">
          <Text c="dimmed" fs="italic">
            Select a musician to view their details
          </Text>
        </Center>
      )}

      {selectedMusician && musicianDetails && (
        <Stack gap="lg">
          {/* Summary Stats */}
          <Paper p="md" style={{ backgroundColor: '#2e2e2e', borderRadius: '8px' }}>
            <Title order={4} mb="sm">{selectedMusician}</Title>
            <Group gap="lg">
              <div>
                <Text size="lg" fw={700} c="blue">{musicianDetails.stats.total_records}</Text>
                <Text size="xs" c="dimmed">Total Records</Text>
              </div>
              <div>
                <Text size="lg" fw={700} c="cyan">{musicianDetails.stats.as_main_artist}</Text>
                <Text size="xs" c="dimmed">Main Artist</Text>
              </div>
              <div>
                <Text size="lg" fw={700} c="violet">{musicianDetails.stats.as_session_musician}</Text>
                <Text size="xs" c="dimmed">Session Work</Text>
              </div>
              <div>
                <Text size="lg" fw={700} c="grape">{Math.round(musicianDetails.stats.session_ratio * 100)}%</Text>
                <Text size="xs" c="dimmed">Session Ratio</Text>
              </div>
            </Group>
          </Paper>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
            gap: '20px' 
          }}>
            {/* Albums */}
            <Paper p="md" style={{ backgroundColor: '#2e2e2e', borderRadius: '8px' }}>
              <Title order={5} mb="sm">Albums ({musicianDetails.mainArtistAlbums.length + musicianDetails.sessionAlbums.length})</Title>
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <Stack gap="md">
                  {/* As Main Artist */}
                  {musicianDetails.mainArtistAlbums.length > 0 && (
                    <Box>
                      <Text size="xs" fw={600} c="cyan" mb="xs" tt="uppercase">
                        As Main Artist ({musicianDetails.mainArtistAlbums.length})
                      </Text>
                      <Stack gap="xs">
                        {musicianDetails.mainArtistAlbums.map((item, idx) => (
                          <Box 
                            key={`main-${item.album}-${idx}`}
                            p="xs"
                            style={{
                              borderBottom: '1px solid #404040',
                              paddingLeft: '12px',
                            }}
                          >
                            <Text size="sm" fw={500} mb={4}>
                              {item.album}
                            </Text>
                            <Text size="xs" c="dimmed">{item.roles}</Text>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  )}
                  
                  {/* Session Work */}
                  {musicianDetails.sessionAlbums.length > 0 && (
                    <Box>
                      <Text size="xs" fw={600} c="violet" mb="xs" tt="uppercase">
                        Session Work ({musicianDetails.sessionAlbums.length})
                      </Text>
                      <Stack gap="xs">
                        {musicianDetails.sessionAlbums.map((item, idx) => (
                          <Box 
                            key={`session-${item.artist}-${item.album}-${idx}`}
                            p="xs"
                            style={{
                              borderBottom: '1px solid #404040',
                              paddingLeft: '12px',
                            }}
                          >
                            <Text size="sm" fw={500} mb={4}>
                              {item.artist} - {item.album}
                            </Text>
                            <Text size="xs" c="dimmed">{item.roles}</Text>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  )}
                </Stack>
              </div>
            </Paper>

            {/* Artists Collaborated With */}
            <Paper p="md" style={{ backgroundColor: '#2e2e2e', borderRadius: '8px' }}>
              <Title order={5} mb="sm">Collaborations ({musicianDetails.artists.length})</Title>
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <Stack gap="xs">
                  {musicianDetails.artists.map((collab) => (
                    <Box 
                      key={collab.artist}
                      p="xs"
                      style={{
                        borderBottom: '1px solid #404040',
                      }}
                    >
                      <Group gap="xs" mb={4}>
                        <Text size="sm" fw={500}>{collab.artist}</Text>
                        <Badge size="xs" variant="light" color="blue">
                          {collab.albumCount}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed">{collab.albums.join(', ')}</Text>
                    </Box>
                  ))}
                </Stack>
              </div>
            </Paper>
          </div>
        </Stack>
      )}
    </>
  );
}

// Top Musicians Chart Component
interface TopMusiciansChartProps {
  data: MusicianNetworkData;
  sortBy: 'total' | 'main' | 'session';
  onSortByChange: (value: 'total' | 'main' | 'session') => void;
}

function TopMusiciansChart({ data, sortBy, onSortByChange }: TopMusiciansChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Check visibility
  useEffect(() => {
    if (!chartRef.current) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      });
    });

    observer.observe(chartRef.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!chartRef.current || !isVisible) return;

    // Initialize ECharts
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, 'dark');
      console.log('Top Musicians Chart initialized');
    }

    // Get top 15 musicians based on sort criteria
    const topMusicians = data.musician_stats
      .sort((a, b) => {
        if (sortBy === 'main') {
          return b.as_main_artist - a.as_main_artist;
        } else if (sortBy === 'session') {
          return b.as_session_musician - a.as_session_musician;
        } else {
          return b.total_records - a.total_records;
        }
      })
      .slice(0, 15);

    console.log('Top musicians data:', topMusicians.length, 'musicians, sorted by:', sortBy);

    const option: echarts.EChartsOption = {
      backgroundColor: '#1e1e1e',
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: (params: any) => {
          const musicianName = params[0].name;
          const reversedIndex = topMusicians.length - 1 - params[0].dataIndex;
          const musician = topMusicians[reversedIndex];
          return `
            <div style="font-weight: bold; margin-bottom: 8px;">${musicianName}</div>
            <div>Total Records: <span style="color: #5dade2; font-weight: bold;">${musician.total_records}</span></div>
            <div>Main Artist: <span style="color: #3498db; font-weight: bold;">${musician.as_main_artist}</span></div>
            <div>Session Work: <span style="color: #9b59b6; font-weight: bold;">${musician.as_session_musician}</span></div>
            <div>Session Ratio: <span style="color: #1abc9c; font-weight: bold;">${(musician.session_ratio * 100).toFixed(1)}%</span></div>
          `;
        },
        backgroundColor: 'rgba(45, 45, 45, 0.95)',
        borderColor: '#555',
        borderWidth: 1,
        textStyle: {
          color: '#e0e0e0'
        }
      },
      legend: {
        data: ['Main Artist', 'Session Work'],
        top: '2%',
        textStyle: {
          color: '#e0e0e0'
        }
      },
      grid: {
        left: '3%',
        right: '5%',
        bottom: '5%',
        top: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: 'Total Records',
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: {
          fontSize: 12,
          fontWeight: 'bold',
          color: '#e0e0e0'
        },
        splitLine: {
          lineStyle: {
            color: '#404040'
          }
        },
        axisLabel: {
          color: '#e0e0e0'
        },
        axisLine: {
          lineStyle: {
            color: '#555'
          }
        }
      },
      yAxis: {
        type: 'category',
        data: topMusicians.map(m => m.musician).reverse(),
        axisLabel: {
          fontSize: 11,
          interval: 0,
          color: '#e0e0e0',
          formatter: (value: string) => {
            return value.length > 25 ? value.substring(0, 25) + '...' : value;
          }
        },
        axisTick: {
          alignWithLabel: true
        },
        axisLine: {
          lineStyle: {
            color: '#555'
          }
        }
      },
      series: [
        {
          name: 'Main Artist',
          type: 'bar',
          stack: 'total',
          data: topMusicians.map(m => m.as_main_artist).reverse(),
          itemStyle: {
            color: 'rgba(52, 152, 219, 0.8)' // Blue
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.3)'
            }
          },
          animationDelay: (idx: number) => idx * 50
        },
        {
          name: 'Session Work',
          type: 'bar',
          stack: 'total',
          data: topMusicians.map(m => m.as_session_musician).reverse(),
          itemStyle: {
            color: 'rgba(155, 89, 182, 0.8)' // Purple
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.3)'
            }
          },
          animationDelay: (idx: number) => idx * 50
        }
      ],
      animation: true,
      animationDuration: 1000,
      animationEasing: 'cubicOut'
    };

    chartInstance.current.setOption(option);

    // Force multiple resizes to ensure proper sizing
    setTimeout(() => chartInstance.current?.resize(), 0);
    setTimeout(() => chartInstance.current?.resize(), 100);
    setTimeout(() => chartInstance.current?.resize(), 300);

    // Handle window resize
    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [data, isVisible, sortBy]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, []);

  return (
    <div style={{ width: '100%' }}>
      <Group justify="space-between" align="center" mb="sm">
        <Title order={4}>
          {sortBy === 'main' ? 'Top Main Artists' : sortBy === 'session' ? 'Top Session Musicians' : 'Most Active Musicians'}
        </Title>
        <SegmentedControl
          value={sortBy}
          onChange={(value) => onSortByChange(value as 'total' | 'main' | 'session')}
          data={[
            { label: 'Total', value: 'total' },
            { label: 'Main', value: 'main' },
            { label: 'Session', value: 'session' },
          ]}
          size="xs"
        />
      </Group>
      <Text size="xs" c="dimmed" mb="md">
        Hover for details • Stacked bars show main artist (blue) vs session work (purple)
      </Text>
      <div
        ref={chartRef}
        style={{
          width: '100%',
          height: '600px',
        }}
      />
    </div>
  );
}

// Session Scatter Chart Component
interface SessionScatterChartProps {
  data: MusicianNetworkData;
}

function SessionScatterChart({ data }: SessionScatterChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Check visibility
  useEffect(() => {
    if (!chartRef.current) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      });
    });

    observer.observe(chartRef.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!chartRef.current || !isVisible) return;

    // Initialize ECharts
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, 'dark');
      console.log('Session Scatter Chart initialized');
    }

    // Categorize musicians
    const pureSessionMusicians = data.musician_stats.filter(m => m.as_main_artist === 0 && m.as_session_musician > 0);
    const balancedMusicians = data.musician_stats.filter(m => m.as_main_artist > 0 && m.as_session_musician > 0);
    const pureMainArtists = data.musician_stats.filter(m => m.as_main_artist > 0 && m.as_session_musician === 0);

    const maxTotal = Math.max(...data.musician_stats.map(m => m.total_records));

    // Helper function to get size based on total records
    const getSizeByTotal = (total: number) => {
      const minSize = 10;
      const maxSize = 50;
      return minSize + (maxSize - minSize) * (total / maxTotal);
    };

    console.log('Scatter plot data counts:', {
      pureSession: pureSessionMusicians.length,
      balanced: balancedMusicians.length,
      pureMain: pureMainArtists.length,
      total: data.musician_stats.length
    });

    // Group musicians by coordinates to detect overlaps
    const groupByCoordinates = (musicians: any[]) => {
      const groups = new Map<string, any[]>();
      musicians.forEach(m => {
        const key = `${m.as_main_artist},${m.as_session_musician}`;
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(m);
      });
      return groups;
    };

    const pureSessionGroups = groupByCoordinates(pureSessionMusicians);
    const balancedGroups = groupByCoordinates(balancedMusicians);
    const pureMainGroups = groupByCoordinates(pureMainArtists);

    const option: echarts.EChartsOption = {
      backgroundColor: '#1e1e1e',
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const data = params.data;
          const musicians = data[6]; // Array of musicians at this coordinate
          
          if (musicians.length === 1) {
            const m = musicians[0];
            return `
              <div style="font-weight: bold; margin-bottom: 8px;">${m.musician}</div>
              <div>Category: <span style="color: ${params.color}; font-weight: bold;">${params.seriesName}</span></div>
              <div>Total Records: <span style="color: #5dade2; font-weight: bold;">${m.total_records}</span></div>
              <div>Main Artist: <span style="color: #3498db; font-weight: bold;">${m.as_main_artist}</span></div>
              <div>Session Work: <span style="color: #9b59b6; font-weight: bold;">${m.as_session_musician}</span></div>
              <div>Session Ratio: <span style="color: #1abc9c; font-weight: bold;">${(m.session_ratio * 100).toFixed(1)}%</span></div>
            `;
          } else {
            let tooltip = `<div style="font-weight: bold; margin-bottom: 8px;">${musicians.length} Musicians at this position</div>`;
            tooltip += `<div>Category: <span style="color: ${params.color}; font-weight: bold;">${params.seriesName}</span></div>`;
            tooltip += `<div>Main Artist: <span style="color: #3498db; font-weight: bold;">${data[0]}</span></div>`;
            tooltip += `<div>Session Work: <span style="color: #9b59b6; font-weight: bold;">${data[1]}</span></div>`;
            tooltip += `<div style="margin-top: 8px; font-weight: bold;">Musicians:</div>`;
            tooltip += `<div style="max-height: 150px; overflow-y: auto;">`;
            musicians.forEach((m: any) => {
              tooltip += `<div style="font-size: 11px;">• ${m.musician} (${m.total_records} records)</div>`;
            });
            tooltip += `</div>`;
            return tooltip;
          }
        },
        backgroundColor: 'rgba(45, 45, 45, 0.95)',
        borderColor: '#555',
        borderWidth: 1,
        textStyle: {
          color: '#e0e0e0'
        }
      },
      legend: {
        data: ['Pure Session Musicians', 'Balanced Artists', 'Pure Main Artists'],
        top: '5%',
        textStyle: {
          color: '#e0e0e0'
        }
      },
      grid: {
        left: '10%',
        right: '5%',
        bottom: '5%',
        top: '12%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: 'Main Artist Records',
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: {
          fontSize: 12,
          fontWeight: 'bold',
          color: '#e0e0e0'
        },
        splitLine: {
          lineStyle: {
            color: '#404040'
          }
        },
        axisLabel: {
          color: '#e0e0e0'
        },
        axisLine: {
          lineStyle: {
            color: '#555'
          }
        }
      },
      yAxis: {
        type: 'value',
        name: 'Session Work Records',
        nameLocation: 'middle',
        nameGap: 50,
        nameTextStyle: {
          fontSize: 12,
          fontWeight: 'bold',
          color: '#e0e0e0'
        },
        splitLine: {
          lineStyle: {
            color: '#404040'
          }
        },
        axisLabel: {
          color: '#e0e0e0'
        },
        axisLine: {
          lineStyle: {
            color: '#555'
          }
        }
      },
      series: [
        {
          name: 'Pure Session Musicians',
          type: 'scatter',
          data: Array.from(pureSessionGroups.entries()).map(([, musicians]) => {
            const totalRecords = Math.max(...musicians.map(m => m.total_records));
            return [
              musicians[0].as_main_artist,
              musicians[0].as_session_musician,
              getSizeByTotal(totalRecords) * (1 + Math.log(musicians.length) * 0.2), // Larger for overlaps
              musicians[0].musician,
              totalRecords,
              musicians[0].session_ratio,
              musicians // Include all musicians at this position
            ];
          }),
          symbolSize: (val: any) => val[2],
          itemStyle: {
            color: 'rgba(155, 89, 182, 0.8)' // Purple (session work)
          }
        },
        {
          name: 'Balanced Artists',
          type: 'scatter',
          data: Array.from(balancedGroups.entries()).map(([, musicians]) => {
            const totalRecords = Math.max(...musicians.map(m => m.total_records));
            return [
              musicians[0].as_main_artist,
              musicians[0].as_session_musician,
              getSizeByTotal(totalRecords) * (1 + Math.log(musicians.length) * 0.2),
              musicians[0].musician,
              totalRecords,
              musicians[0].session_ratio,
              musicians
            ];
          }),
          symbolSize: (val: any) => val[2],
          itemStyle: {
            color: 'rgba(26, 188, 156, 0.8)' // Teal (balanced)
          }
        },
        {
          name: 'Pure Main Artists',
          type: 'scatter',
          data: Array.from(pureMainGroups.entries()).map(([, musicians]) => {
            const totalRecords = Math.max(...musicians.map(m => m.total_records));
            return [
              musicians[0].as_main_artist,
              musicians[0].as_session_musician,
              getSizeByTotal(totalRecords) * (1 + Math.log(musicians.length) * 0.2),
              musicians[0].musician,
              totalRecords,
              musicians[0].session_ratio,
              musicians
            ];
          }),
          symbolSize: (val: any) => val[2],
          itemStyle: {
            color: 'rgba(52, 152, 219, 0.8)' // Blue (main artist)
          }
        }
      ],
      animation: true,
      animationDuration: 1000,
      animationEasing: 'cubicOut'
    };

    chartInstance.current.setOption(option);

    // Force multiple resizes to ensure proper sizing
    setTimeout(() => chartInstance.current?.resize(), 0);
    setTimeout(() => chartInstance.current?.resize(), 100);
    setTimeout(() => chartInstance.current?.resize(), 300);

    // Handle window resize
    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [data, isVisible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, []);

  return (
    <div style={{ width: '100%' }}>
      <Title order={4} mb="sm">Main Artist vs Session Work</Title>
      <Text size="xs" c="dimmed" mb="md">
        Scatter plot showing musician work balance • Bubble size = total records
      </Text>
      <div
        ref={chartRef}
        style={{
          width: '100%',
          height: '600px',
        }}
      />
    </div>
  );
}


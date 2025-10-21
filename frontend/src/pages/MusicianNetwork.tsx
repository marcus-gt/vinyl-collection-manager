import { useEffect, useState, useMemo, useRef } from 'react';
import { Container, Title, Text, Tabs, Loader, Center, Alert, Button, Group, Stack, Select, MultiSelect, Box, Collapse, Badge, Paper } from '@mantine/core';
import { IconNetworkOff, IconAlertCircle, IconPlus, IconX, IconFilter, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
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

  // Compute filtered data based on current filters
  const filteredData = useMemo(() => {
    if (!data) return null;

    const hasRoleFilter = selectedRoles.length > 0;
    const hasCustomFilters = customFilters.some(f => f.column && f.selectedValues.length > 0);
    
    if (!hasRoleFilter && !hasCustomFilters) {
      return data; // No filters, return original data
    }

    // Filter links based on criteria
    const filteredLinks = data.links.filter((link: any) => {
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
  }, [data, selectedRoles, customFilters]);

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
          {(selectedRoles.length > 0 || customFilters.some(f => f.selectedValues.length > 0)) && (
            <Badge size="sm" ml="xs" variant="filled" color="blue">
              {selectedRoles.length + customFilters.filter(f => f.selectedValues.length > 0).length}
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
              {/* Role Filter */}
              <MultiSelect
                label="Role"
                placeholder="All roles"
                data={data?.clean_roles || []}
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
              {(selectedRoles.length > 0 || customFilters.some(f => f.selectedValues.length > 0)) && (
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Showing {filteredData?.nodes.length || 0} nodes, {filteredData?.links.length || 0} connections
                  </Text>
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => {
                      setSelectedRoles([]);
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
          <Tabs.Tab value="top">🏆 Top Musicians</Tabs.Tab>
          <Tabs.Tab value="session">🎭 Session Musicians</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="network" pt="xl">
          <Title order={3} mb="md">Network Visualization</Title>
          <Text size="sm" c="dimmed" mb="md">
            Hover for details • Drag to move • Scroll to zoom
          </Text>
          {filteredData && <NetworkGraph data={filteredData} />}
        </Tabs.Panel>

        <Tabs.Panel value="top" pt="xl">
          <Title order={3} mb="md">🏆 Top Musicians by Record Count</Title>
          <Text size="sm" c="dimmed" mb="lg">
            Musicians ranked by total record appearances, showing main artist vs session work
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
              gridTemplateColumns: '1fr 1fr', 
              gap: '20px',
              width: '100%'
            }}>
              <TopMusiciansChart data={filteredData || data} />
              <SessionScatterChart data={filteredData || data} />
            </div>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="session" pt="xl">
          <Title order={3} mb="md">Session Musicians</Title>
          <Text size="sm" c="dimmed" mb="md">
            Musicians who appear on multiple records but rarely as the main artist
          </Text>
          
          {(filteredData?.session_musicians || data.session_musicians).length === 0 ? (
            <Alert color="gray">
              No session musicians found with the current criteria (min 2 records, 70% session ratio)
            </Alert>
          ) : (
            <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
              {(filteredData?.session_musicians || data.session_musicians).map((musician, idx) => (
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

// Top Musicians Chart Component
interface TopMusiciansChartProps {
  data: MusicianNetworkData;
}

function TopMusiciansChart({ data }: TopMusiciansChartProps) {
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

    // Get top 15 musicians
    const topMusicians = data.musician_stats
      .sort((a, b) => b.total_records - a.total_records)
      .slice(0, 15);

    console.log('Top musicians data:', topMusicians.length, 'musicians');

    const option: echarts.EChartsOption = {
      backgroundColor: '#1e1e1e',
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: (params: any) => {
          const data = params[0];
          const musician = topMusicians[data.dataIndex];
          return `
            <div style="font-weight: bold; margin-bottom: 8px;">${data.name}</div>
            <div>Total Records: <span style="color: #3498db; font-weight: bold;">${data.value}</span></div>
            <div>Main Artist: <span style="color: #27ae60; font-weight: bold;">${musician.as_main_artist}</span></div>
            <div>Session Work: <span style="color: #e74c3c; font-weight: bold;">${musician.as_session_musician}</span></div>
            <div>Session Ratio: <span style="color: #f39c12; font-weight: bold;">${(musician.session_ratio * 100).toFixed(1)}%</span></div>
          `;
        },
        backgroundColor: 'rgba(45, 45, 45, 0.95)',
        borderColor: '#555',
        borderWidth: 1,
        textStyle: {
          color: '#e0e0e0'
        }
      },
      grid: {
        left: '3%',
        right: '5%',
        bottom: '5%',
        top: '3%',
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
      series: [{
        name: 'Total Records',
        type: 'bar',
        data: topMusicians.map((m, index) => {
          // Create a gradient from blue to purple based on position
          const ratio = index / Math.max(topMusicians.length - 1, 1);
          const r = Math.floor(52 + ratio * 100);
          const g = Math.floor(152 - ratio * 50);
          const b = Math.floor(219 - ratio * 20);
          const color = `rgba(${r}, ${g}, ${b}, 0.8)`;
          
          return {
            value: m.total_records,
            itemStyle: {
              color: color
            }
          };
        }).reverse(),
        barWidth: '60%',
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.3)'
          }
        },
        animationDelay: (idx: number) => idx * 50
      }],
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
      <Title order={4} mb="sm">Most Active Musicians</Title>
      <Text size="xs" c="dimmed" mb="md">
        Hover for details • Bar colors show ranking gradient
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
function SessionScatterChart({ data }: TopMusiciansChartProps) {
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
      const minSize = 8;
      const maxSize = 40;
      return minSize + (maxSize - minSize) * (total / maxTotal);
    };

    const option: echarts.EChartsOption = {
      backgroundColor: '#1e1e1e',
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const data = params.data;
          return `
            <div style="font-weight: bold; margin-bottom: 8px;">${data[3]}</div>
            <div>Category: <span style="color: ${params.color}; font-weight: bold;">${params.seriesName}</span></div>
            <div>Total Records: <span style="color: #e74c3c; font-weight: bold;">${data[4]}</span></div>
            <div>Main Artist: <span style="color: #27ae60; font-weight: bold;">${data[0]}</span></div>
            <div>Session Work: <span style="color: #3498db; font-weight: bold;">${data[1]}</span></div>
            <div>Session Ratio: <span style="color: #f39c12; font-weight: bold;">${(data[5] * 100).toFixed(1)}%</span></div>
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
          data: pureSessionMusicians.map(m => [
            m.as_main_artist,
            m.as_session_musician,
            getSizeByTotal(m.total_records),
            m.musician,
            m.total_records,
            m.session_ratio
          ]),
          symbolSize: (val: any) => val[2],
          itemStyle: {
            color: 'rgba(231, 76, 60, 0.8)'
          }
        },
        {
          name: 'Balanced Artists',
          type: 'scatter',
          data: balancedMusicians.map(m => [
            m.as_main_artist,
            m.as_session_musician,
            getSizeByTotal(m.total_records),
            m.musician,
            m.total_records,
            m.session_ratio
          ]),
          symbolSize: (val: any) => val[2],
          itemStyle: {
            color: 'rgba(243, 156, 18, 0.8)'
          }
        },
        {
          name: 'Pure Main Artists',
          type: 'scatter',
          data: pureMainArtists.map(m => [
            m.as_main_artist,
            m.as_session_musician,
            getSizeByTotal(m.total_records),
            m.musician,
            m.total_records,
            m.session_ratio
          ]),
          symbolSize: (val: any) => val[2],
          itemStyle: {
            color: 'rgba(39, 174, 96, 0.8)'
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


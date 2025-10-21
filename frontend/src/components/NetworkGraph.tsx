import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { Stack, Select, MultiSelect, Text, Box } from '@mantine/core';
import type { MusicianNetworkData } from '../services/api';

interface NetworkGraphProps {
  data: MusicianNetworkData;
}

export default function NetworkGraph({ data }: NetworkGraphProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [nodeColorBy, setNodeColorBy] = useState<string>('category');

  useEffect(() => {
    if (!chartRef.current) return;

    // Initialize ECharts
    chartInstance.current = echarts.init(chartRef.current, 'dark');

    // Handle window resize
    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!chartInstance.current) return;

    // Filter data based on selected filters
    const filteredData = filterNetworkData(
      data,
      selectedGenres,
      selectedStyles,
      selectedRoles
    );

    // Update chart with filtered data
    updateChart(chartInstance.current, filteredData, nodeColorBy);
  }, [data, selectedGenres, selectedStyles, selectedRoles, nodeColorBy]);

  return (
    <Stack gap="md">
      {/* Filters */}
      <Box style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <MultiSelect
          label="Filter by Genre"
          placeholder="All genres"
          data={data.genres}
          value={selectedGenres}
          onChange={setSelectedGenres}
          searchable
          clearable
          style={{ minWidth: '200px', flex: 1 }}
        />
        <MultiSelect
          label="Filter by Style"
          placeholder="All styles"
          data={data.styles}
          value={selectedStyles}
          onChange={setSelectedStyles}
          searchable
          clearable
          style={{ minWidth: '200px', flex: 1 }}
        />
        <MultiSelect
          label="Filter by Role"
          placeholder="All roles"
          data={data.clean_roles}
          value={selectedRoles}
          onChange={setSelectedRoles}
          searchable
          clearable
          style={{ minWidth: '200px', flex: 1 }}
        />
        <Select
          label="Color nodes by"
          data={[
            { value: 'category', label: 'Category (Artist/Musician)' },
            { value: 'genre', label: 'Primary Genre' },
            { value: 'connections', label: 'Number of Connections' },
          ]}
          value={nodeColorBy}
          onChange={(value) => setNodeColorBy(value || 'category')}
          style={{ minWidth: '200px' }}
        />
      </Box>

      {/* Info text */}
      <Text size="sm" c="dimmed">
        Showing {data.nodes.length} nodes and {data.links.length} connections.
        {(selectedGenres.length > 0 || selectedStyles.length > 0 || selectedRoles.length > 0) && 
          ' (Filtered)'
        }
      </Text>

      {/* Chart container */}
      <div
        ref={chartRef}
        style={{
          width: '100%',
          height: '700px',
          borderRadius: '8px',
          backgroundColor: '#1e1e1e',
        }}
      />
    </Stack>
  );
}

function filterNetworkData(
  data: MusicianNetworkData,
  genres: string[],
  styles: string[],
  roles: string[]
) {
  // If no filters, return original data
  if (genres.length === 0 && styles.length === 0 && roles.length === 0) {
    return data;
  }

  // Filter links based on criteria
  const filteredLinks = data.links.filter((link) => {
    const genreMatch = genres.length === 0 || 
      genres.some((g) => link.genres.includes(g));
    const styleMatch = styles.length === 0 || 
      styles.some((s) => link.styles.includes(s));
    const roleMatch = roles.length === 0 || 
      roles.some((r) => link.clean_roles.includes(r));
    
    return genreMatch && styleMatch && roleMatch;
  });

  // Get all node IDs that are part of filtered links
  const activeNodeIds = new Set<string>();
  filteredLinks.forEach((link) => {
    activeNodeIds.add(link.source);
    activeNodeIds.add(link.target);
  });

  // Filter nodes
  const filteredNodes = data.nodes.filter((node) => 
    activeNodeIds.has(node.id)
  );

  return {
    ...data,
    nodes: filteredNodes,
    links: filteredLinks,
  };
}

function updateChart(
  chart: echarts.ECharts,
  data: MusicianNetworkData,
  colorBy: string
) {
  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        if (params.dataType === 'node') {
          const node = params.data;
          return `
            <strong>${node.name}</strong><br/>
            Category: ${node.category}<br/>
            Connections: ${node.value}<br/>
            ${node.albums ? `Albums: ${node.albums.slice(0, 3).join(', ')}${node.albums.length > 3 ? '...' : ''}` : ''}
          `;
        } else if (params.dataType === 'edge') {
          const link = params.data;
          return `
            <strong>${link.source} → ${link.target}</strong><br/>
            Collaborations: ${link.value}<br/>
            Roles: ${link.clean_roles.slice(0, 3).join(', ')}${link.clean_roles.length > 3 ? '...' : ''}
          `;
        }
        return '';
      },
    },
    legend: [{
      data: data.categories.map((c: any) => c.name),
      orient: 'vertical',
      left: 10,
      top: 20,
      textStyle: {
        color: '#e0e0e0',
      },
    }],
    series: [{
      type: 'graph',
      layout: 'force',
      data: data.nodes.map((node: any) => ({
        ...node,
        label: {
          show: node.symbolSize > 15, // Only show labels for larger nodes
          position: 'right',
          formatter: '{b}',
          fontSize: 10,
          color: '#e0e0e0',
        },
        itemStyle: {
          color: getNodeColor(node, colorBy, data),
        },
      })),
      links: data.links.map((link: any) => ({
        source: link.source,
        target: link.target,
        value: link.value,
        lineStyle: {
          width: Math.min(link.value * 0.5, 5),
          color: 'rgba(160, 160, 160, 0.3)',
          curveness: 0.1,
        },
      })),
      categories: data.categories,
      roam: true,
      draggable: true,
      force: {
        repulsion: 200,
        edgeLength: [50, 150],
        gravity: 0.1,
      },
      emphasis: {
        focus: 'adjacency',
        lineStyle: {
          width: 3,
          color: 'rgba(160, 160, 160, 0.8)',
        },
      },
    }],
  };

  chart.setOption(option, true);
}

function getNodeColor(node: any, colorBy: string, data: MusicianNetworkData): string {
  if (colorBy === 'category') {
    return node.category === 'artist' ? '#1f77b4' : '#ff7f0e';
  } else if (colorBy === 'genre' && node.genres && node.genres.length > 0) {
    // Color by primary genre
    const genreColors: Record<string, string> = {
      'Jazz': '#2ca02c',
      'Rock': '#d62728',
      'Electronic': '#9467bd',
      'Classical': '#8c564b',
      'Hip Hop': '#e377c2',
      'Funk / Soul': '#7f7f7f',
      'Latin': '#bcbd22',
      'Folk, World, & Country': '#17becf',
    };
    return genreColors[node.genres[0]] || '#aaaaaa';
  } else if (colorBy === 'connections') {
    // Color by number of connections (gradient from blue to red)
    const maxConnections = Math.max(...data.nodes.map((n: any) => n.value));
    const ratio = node.value / maxConnections;
    const r = Math.floor(ratio * 255);
    const b = Math.floor((1 - ratio) * 255);
    return `rgb(${r}, 100, ${b})`;
  }
  
  return '#1f77b4';
}


import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { MusicianNetworkData } from '../services/api';

interface NetworkGraphProps {
  data: MusicianNetworkData;
}

export default function NetworkGraph({ data }: NetworkGraphProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  console.log('NetworkGraph rendering with data:', {
    nodes: data?.nodes?.length,
    links: data?.links?.length,
    hasData: !!data
  });

  useEffect(() => {
    if (!chartRef.current) return;

    // Initialize ECharts if not already initialized
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, 'dark');
      console.log('ECharts instance initialized');
    }

    // Update chart with data
    console.log('Updating chart with data:', {
      nodes: data?.nodes?.length,
      links: data?.links?.length
    });
    updateChart(chartInstance.current, data);

    // Handle window resize
    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      // Don't dispose the chart instance here - only dispose on unmount
    };
  }, [data]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        console.log('Disposing chart instance on unmount');
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={chartRef}
      style={{
        width: '100%',
        height: '800px',
        backgroundColor: '#1e1e1e',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
    />
  );
}

function updateChart(
  chart: echarts.ECharts,
  data: MusicianNetworkData
) {
  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        if (params.dataType === 'node') {
          const node = params.data;
          let tooltip = `<strong style="font-size: 14px;">${node.name}</strong><br/>`;
          if (node.category === 'musician') {
            tooltip += `Works with ${node.value} artists<br/>`;
          } else {
            tooltip += `${node.value} musicians<br/>`;
          }
          if (node.genres && node.genres.length > 0) {
            tooltip += `<br/><strong>Genres:</strong><br/>${node.genres.join(', ')}<br/>`;
          }
          if (node.styles && node.styles.length > 0) {
            tooltip += `<br/><strong>Styles:</strong><br/>${node.styles.join(', ')}`;
          }
          return tooltip;
        } else if (params.dataType === 'edge') {
          const link = data.links.find((l: any) => 
            l.source === params.data.source && l.target === params.data.target
          );
          if (!link) return '';
          
          let tooltip = `<strong style="font-size: 14px;">${link.source} → ${link.target}</strong><br/>`;
          if (link.roles && link.roles.length > 0) {
            tooltip += `<br/><strong>Roles:</strong><br/>${link.roles.join(', ')}<br/>`;
          }
          if (link.albums && link.albums.length > 0) {
            tooltip += `<br/><strong>Albums:</strong><br/>${link.albums.join(', ')}`;
          }
          return tooltip;
        }
        return '';
      },
      backgroundColor: 'rgba(45, 45, 45, 0.95)',
      borderColor: '#555',
      borderWidth: 1,
      textStyle: {
        color: '#e0e0e0',
        fontSize: 12,
      },
      extraCssText: 'max-width: 500px; white-space: normal; word-wrap: break-word;',
      confine: true,
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
    animationDuration: 1000,
    animationEasingUpdate: 'quinticInOut',
    series: [{
      name: 'Musician Network',
      type: 'graph',
      layout: 'force',
      data: data.nodes.map((node: any) => ({
        ...node,
        label: {
          show: true,
          position: 'right',
          formatter: '{b}',
          fontSize: 10,
          color: '#ffffff',
        },
        itemStyle: {
          color: node.category === 'artist' ? '#1f77b4' : '#ff7f0e',
          borderWidth: 0,
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.5)',
        },
      })),
      links: data.links.map((link: any) => ({
        source: link.source,
        target: link.target,
        value: link.value,
      })),
      categories: data.categories,
      roam: true,
      focusNodeAdjacency: true,
      lineStyle: {
        color: 'source',
        curveness: 0.1,
        opacity: 0.6,
      },
      emphasis: {
        focus: 'adjacency',
        lineStyle: {
          width: 3,
          opacity: 0.9,
        },
      },
      force: {
        repulsion: 200,
        edgeLength: [50, 100],
        gravity: 0.08,
        friction: 0.4,
      },
    }],
  };

  chart.setOption(option, true);
}

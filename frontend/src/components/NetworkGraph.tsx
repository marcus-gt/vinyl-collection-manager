import { useRef, useEffect, useCallback, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { MusicianNetworkData } from '../services/api';

interface NetworkGraphProps {
  data: MusicianNetworkData;
}

interface GraphNode {
  id: string;
  name: string;
  value: number;
  category: string;
  genres?: string[];
  styles?: string[];
  roles?: string[];
}

interface GraphLink {
  source: string;
  target: string;
  value: number;
  roles?: string[];
  albums?: string[];
}

export default function NetworkGraph({ data }: NetworkGraphProps) {
  const fgRef = useRef<any>();
  const [dimensions, setDimensions] = useState({ width: 0, height: 800 });
  const containerRef = useRef<HTMLDivElement>(null);

  console.log('NetworkGraph received data:', { 
    nodes: data?.nodes?.length, 
    links: data?.links?.length,
    data 
  });

  // Handle responsive sizing
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: 800
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Configure forces to pull isolated islands closer
  useEffect(() => {
    if (fgRef.current) {
      // Add a stronger center force to pull distant nodes toward the center
      const centerForce = fgRef.current.d3Force('center');
      if (centerForce) {
        centerForce.strength(0.4); // Increased from default ~0.1
      }
      
      // Optionally adjust charge force for better distribution
      const chargeForce = fgRef.current.d3Force('charge');
      if (chargeForce) {
        chargeForce.strength(-20); // Moderate repulsion
      }
      
      // Reheat the simulation to apply changes
      fgRef.current.d3ReheatSimulation();
    }
  }, [data]);

  // Zoom to fit after graph stabilizes
  useEffect(() => {
    if (fgRef.current) {
      // Wait for simulation to settle, then zoom to fit with more padding
      const timer = setTimeout(() => {
        fgRef.current?.zoomToFit(400, 80);
      }, 2500);
      
      return () => clearTimeout(timer);
    }
  }, [data]);

  // Check if data is valid
  if (!data || !data.nodes || !data.links) {
    console.error('Invalid graph data:', data);
    return (
      <div style={{
        width: '100%',
        height: '800px',
        backgroundColor: '#1e1e1e',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#e0e0e0'
      }}>
        No graph data available
      </div>
    );
  }

  // Transform data for react-force-graph
  const graphData = {
    nodes: data.nodes.map((node: any) => ({
      id: node.id,
      name: node.name,
      value: node.value || 1,
      category: node.category,
      genres: node.genres || [],
      styles: node.styles || [],
      roles: node.roles || []
    })),
    links: data.links.map((link: any) => ({
      source: link.source,
      target: link.target,
      value: link.value || 1,
      roles: link.roles || [],
      albums: link.albums || []
    }))
  };

  console.log('Transformed graphData:', graphData);

  // Node color based on category
  const getNodeColor = useCallback((node: GraphNode) => {
    return node.category === 'artist' ? '#1f77b4' : '#ff7f0e';
  }, []);

  // Node size based on connections
  const getNodeSize = useCallback((node: GraphNode) => {
    return Math.max(4, Math.min(12, node.value * 1.5));
  }, []);

  // Custom node canvas rendering for better performance
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const size = getNodeSize(node);
    const label = node.name;
    const fontSize = 12 / globalScale;
    
    // Draw node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
    ctx.fillStyle = getNodeColor(node);
    ctx.fill();
    
    // Draw label if zoom is sufficient
    if (globalScale > 1.5) {
      ctx.font = `${fontSize}px Sans-Serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, node.x, node.y + size + fontSize);
    }
  }, [getNodeColor, getNodeSize]);

  // Link color with transparency
  const getLinkColor = useCallback(() => {
    return 'rgba(150, 150, 150, 0.3)';
  }, []);

  // Link width based on connection strength
  const getLinkWidth = useCallback((link: GraphLink) => {
    return Math.max(1, link.value * 0.5);
  }, []);

  // Tooltip content
  const getNodeLabel = useCallback((node: GraphNode) => {
    let label = `<div style="background: rgba(30, 30, 30, 0.95); padding: 12px; border-radius: 8px; color: #e0e0e0; font-size: 12px; max-width: 300px;">`;
    label += `<strong style="font-size: 14px; color: #fff;">${node.name}</strong><br/>`;
    
    if (node.category === 'musician') {
      label += `<span style="color: #ff7f0e;">Musician</span><br/>`;
      label += `Works with ${node.value} artist${node.value !== 1 ? 's' : ''}<br/>`;
      if (node.roles && node.roles.length > 0) {
        const roleCount = node.roles.length;
        const displayRoles = node.roles.slice(0, 5).join(', ');
        label += `<br/><strong>Roles:</strong><br/>${displayRoles}`;
        if (roleCount > 5) label += ` <em>(+${roleCount - 5} more)</em>`;
      }
    } else {
      label += `<span style="color: #1f77b4;">Artist</span><br/>`;
      label += `${node.value} musician${node.value !== 1 ? 's' : ''}<br/>`;
    }
    
    if (node.genres && node.genres.length > 0) {
      label += `<br/><strong>Genres:</strong><br/>${node.genres.slice(0, 3).join(', ')}`;
      if (node.genres.length > 3) label += ` <em>(+${node.genres.length - 3} more)</em>`;
    }
    
    if (node.styles && node.styles.length > 0) {
      label += `<br/><strong>Styles:</strong><br/>${node.styles.slice(0, 3).join(', ')}`;
      if (node.styles.length > 3) label += ` <em>(+${node.styles.length - 3} more)</em>`;
    }
    
    label += `</div>`;
    return label;
  }, []);

  const getLinkLabel = useCallback((link: any) => {
    // Handle case where source/target are objects (after force simulation)
    const sourceName = typeof link.source === 'object' ? link.source.name : link.source;
    const targetName = typeof link.target === 'object' ? link.target.name : link.target;
    
    let label = `<div style="background: rgba(30, 30, 30, 0.95); padding: 12px; border-radius: 8px; color: #e0e0e0; font-size: 12px; max-width: 300px;">`;
    label += `<strong style="font-size: 14px; color: #fff;">${sourceName} → ${targetName}</strong><br/>`;
    label += `${link.value} collaboration${link.value !== 1 ? 's' : ''}<br/>`;
    
    if (link.roles && link.roles.length > 0) {
      const roleCount = link.roles.length;
      const displayRoles = link.roles.slice(0, 5).join(', ');
      label += `<br/><strong>Roles:</strong><br/>${displayRoles}`;
      if (roleCount > 5) label += ` <em>(+${roleCount - 5} more)</em>`;
    }
    
    if (link.albums && link.albums.length > 0) {
      // Deduplicate albums
      const uniqueAlbums = [...new Set(link.albums)];
      const albumCount = uniqueAlbums.length;
      const displayAlbums = uniqueAlbums.slice(0, 3).join(', ');
      label += `<br/><strong>Albums:</strong><br/>${displayAlbums}`;
      if (albumCount > 3) label += ` <em>(+${albumCount - 3} more)</em>`;
    }
    
    label += `</div>`;
    return label;
  }, []);

  // Handle node click - zoom to node and highlight connections
  const handleNodeClick = useCallback((node: any) => {
    if (fgRef.current) {
      // Center camera on node with smooth animation
      fgRef.current.centerAt(node.x, node.y, 1000);
      fgRef.current.zoom(3, 1000);
    }
  }, []);

  return (
    <div 
      ref={containerRef}
      style={{
        width: '100%',
        height: '800px',
        backgroundColor: '#1e1e1e',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Legend */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        background: 'rgba(30, 30, 30, 0.9)',
        padding: '12px',
        borderRadius: '8px',
        color: '#e0e0e0',
        fontSize: '12px',
        zIndex: 10,
        backdropFilter: 'blur(4px)'
      }}>
        <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>Legend</div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#1f77b4', marginRight: '8px' }}></div>
          <span>Artist</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff7f0e', marginRight: '8px' }}></div>
          <span>Musician</span>
        </div>
        <div style={{ marginTop: '12px', fontSize: '11px', color: '#aaa' }}>
          Click node to zoom<br/>
          Drag to pan<br/>
          Scroll to zoom
        </div>
      </div>

      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#1e1e1e"
        nodeLabel={getNodeLabel}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          // Increase clickable area
          const size = getNodeSize(node) + 2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkColor={getLinkColor}
        linkWidth={getLinkWidth}
        linkLabel={getLinkLabel}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleSpeed={0.003}
        onNodeClick={handleNodeClick}
        // Use force-directed layout with tighter clustering
        cooldownTicks={150}
        d3AlphaDecay={0.015}
        d3VelocityDecay={0.3}
        warmupTicks={100}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        minZoom={0.1}
        maxZoom={8}
      />
    </div>
  );
}

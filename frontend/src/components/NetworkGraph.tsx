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
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [highlightLinks, setHighlightLinks] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

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

  // Node size based on connections (scaled down a bit)
  const getNodeSize = useCallback((node: GraphNode) => {
    return Math.max(3, Math.min(9, node.value * 1.3)); // Reduced from 4-12 with 1.5x
  }, []);

  // Custom node canvas rendering for better performance
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const size = getNodeSize(node);
    const label = node.name;
    const fontSize = 12 / globalScale;
    
    // Determine if node should be highlighted
    const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(node.id);
    const opacity = isHighlighted ? 1.0 : 0.1;
    
    // Draw node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
    
    // Apply opacity to fill color
    const baseColor = getNodeColor(node);
    const colorMatch = baseColor.match(/^#([0-9a-f]{6})$/i);
    if (colorMatch) {
      const r = parseInt(colorMatch[1].substring(0, 2), 16);
      const g = parseInt(colorMatch[1].substring(2, 4), 16);
      const b = parseInt(colorMatch[1].substring(4, 6), 16);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
    } else {
      ctx.fillStyle = baseColor;
      ctx.globalAlpha = opacity;
    }
    ctx.fill();
    ctx.globalAlpha = 1.0; // Reset alpha
    
    // Draw outline for better visibility when overlapping
    ctx.strokeStyle = `rgba(30, 30, 30, ${opacity * 0.8})`; // Dark outline with opacity
    ctx.lineWidth = 0.5;
    ctx.stroke();
    
    // Draw label if zoom is sufficient
    if (globalScale > 1.5 && isHighlighted) {
      ctx.font = `${fontSize}px Sans-Serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, node.x, node.y + size + fontSize);
    }
  }, [getNodeColor, getNodeSize, highlightNodes]);

  // Link color with transparency based on highlight state
  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D) => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    const linkId = `${sourceId}-${targetId}`;
    
    const isHighlighted = highlightLinks.size === 0 || highlightLinks.has(linkId);
    const opacity = isHighlighted ? 0.3 : 0.02;
    const width = Math.max(1, link.value * 0.5);
    
    ctx.strokeStyle = `rgba(150, 150, 150, ${opacity})`;
    ctx.lineWidth = width;
    
    ctx.beginPath();
    ctx.moveTo(link.source.x, link.source.y);
    ctx.lineTo(link.target.x, link.target.y);
    ctx.stroke();
  }, [highlightLinks]);

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

  // Handle node click - highlight node and its connections
  const handleNodeClick = useCallback((node: any) => {
    // If clicking the same node, deselect it
    if (selectedNode === node.id) {
      setSelectedNode(null);
      setHighlightNodes(new Set());
      setHighlightLinks(new Set());
      return;
    }

    // Set selected node
    setSelectedNode(node.id);

    // Find all connected nodes and links
    const connectedNodes = new Set<string>([node.id]);
    const connectedLinks = new Set<string>();

    graphData.links.forEach((link: any) => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      if (sourceId === node.id) {
        connectedNodes.add(targetId);
        connectedLinks.add(`${sourceId}-${targetId}`);
      } else if (targetId === node.id) {
        connectedNodes.add(sourceId);
        connectedLinks.add(`${sourceId}-${targetId}`);
      }
    });

    setHighlightNodes(connectedNodes);
    setHighlightLinks(connectedLinks);
  }, [selectedNode, graphData]);

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
          Click node to highlight<br/>
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
        linkCanvasObject={paintLink}
        linkLabel={getLinkLabel}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleSpeed={0.003}
        onNodeClick={handleNodeClick}
        onBackgroundClick={() => {
          // Clear selection when clicking background
          setSelectedNode(null);
          setHighlightNodes(new Set());
          setHighlightLinks(new Set());
        }}
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

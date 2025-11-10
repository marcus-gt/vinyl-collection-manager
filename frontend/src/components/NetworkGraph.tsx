import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Select, ActionIcon } from '@mantine/core';
import { IconZoomReset } from '@tabler/icons-react';
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

export default function NetworkGraph({ data }: NetworkGraphProps) {
  const fgRef = useRef<any>();
  const [dimensions, setDimensions] = useState({ width: 0, height: 800 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [highlightLinks, setHighlightLinks] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [graphReady, setGraphReady] = useState(false);
  const [searchValue, setSearchValue] = useState<string | null>(null);
  const pendingZoomRef = useRef<string | null>(null);

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

  // Zoom to fit when graph loads
  useEffect(() => {
    if (fgRef.current) {
      // Small delay to ensure graph is rendered, then zoom to fit quickly
      const timer = setTimeout(() => {
        if (fgRef.current) {
          fgRef.current.zoomToFit(100, 80);
        }
      }, 200);
      
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

  // Transform data for react-force-graph (memoized to prevent re-renders)
  const graphData = useMemo(() => ({
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
  }), [data.nodes, data.links]);

  // Create search options from all nodes
  const searchOptions = useMemo(() => {
    return graphData.nodes.map((node: GraphNode) => ({
      value: node.id,
      label: `${node.name} (${node.category === 'artist' ? 'Artist' : 'Musician'})`,
      category: node.category
    })).sort((a, b) => a.label.localeCompare(b.label));
  }, [graphData.nodes]);

  // Handle node click - highlight node and its connections
  const handleNodeClick = useCallback((node: any) => {
    // If clicking the same node, deselect it
    if (selectedNode === node.id) {
      setSelectedNode(null);
      setHighlightNodes(new Set());
      setHighlightLinks(new Set());
      setSearchValue(null); // Clear search selector too
      return;
    }

    // Set selected node
    setSelectedNode(node.id);
    setSearchValue(node.id); // Update search selector to match clicked node

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

  // Zoom to a specific node
  const zoomToNode = useCallback((nodeId: string) => {
    if (!fgRef.current) return;

    // Find the node from our graphData (nodes already have x, y coordinates from the simulation)
    const node = graphData.nodes.find((n: GraphNode) => n.id === nodeId);
    
    if (node) {
      // Get the node's position - it should have x, y coordinates after simulation
      const nodeObj = node as any;
      
      if (nodeObj.x !== undefined && nodeObj.y !== undefined) {
        // Zoom to node
        fgRef.current.centerAt(nodeObj.x, nodeObj.y, 1000);
        fgRef.current.zoom(3, 1000);

        // Highlight node and connections
        handleNodeClick(nodeObj);
      } else {
        // Try again after a short delay to let simulation position the nodes
        setTimeout(() => {
          const updatedNode = graphData.nodes.find((n: GraphNode) => n.id === nodeId) as any;
          if (updatedNode && updatedNode.x !== undefined && updatedNode.y !== undefined) {
            fgRef.current.centerAt(updatedNode.x, updatedNode.y, 1000);
            fgRef.current.zoom(3, 1000);
            handleNodeClick(updatedNode);
          }
        }, 500);
      }
    }
  }, [handleNodeClick, graphData.nodes]);

  // Handle when graph engine stops (simulation stabilizes)
  const handleEngineStop = useCallback(() => {
    console.log('Graph engine stopped, graph is ready');
    setGraphReady(true);
    
    // If there's a pending zoom request, execute it now
    if (pendingZoomRef.current) {
      const nodeId = pendingZoomRef.current;
      pendingZoomRef.current = null;
      zoomToNode(nodeId);
    }
  }, [zoomToNode]);

  // Handle search selection
  const handleSearchSelect = useCallback((nodeId: string | null) => {
    setSearchValue(nodeId);
    
    if (!nodeId) {
      return;
    }

    if (graphReady && fgRef.current) {
      // Graph is ready, zoom immediately
      zoomToNode(nodeId);
    } else {
      // Graph not ready, store for later
      pendingZoomRef.current = nodeId;
    }
  }, [graphReady, zoomToNode]);

  // Handle reset zoom
  const handleResetZoom = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400, 80);
      // Clear selection
      setSelectedNode(null);
      setHighlightNodes(new Set());
      setHighlightLinks(new Set());
      setSearchValue(null);
    }
  }, []);

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
      {/* Search box */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '300px',
        maxWidth: 'calc(100% - 40px)',
        zIndex: 10
      }}>
        <Select
          placeholder="Search for artist or musician..."
          data={searchOptions}
          value={searchValue}
          searchable
          clearable
          onChange={handleSearchSelect}
          styles={{
            input: {
              backgroundColor: 'rgba(30, 30, 30, 0.95)',
              color: '#e0e0e0',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(4px)'
            },
            dropdown: {
              backgroundColor: 'rgba(30, 30, 30, 0.98)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(8px)'
            },
            option: {
              color: '#e0e0e0',
              '&[dataSelected="true"]': {
                backgroundColor: 'rgba(31, 119, 180, 0.3)'
              },
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.1)'
              }
            }
          }}
        />
      </div>

      {/* Reset zoom button */}
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        zIndex: 10
      }}>
        <ActionIcon
          size="lg"
          variant="filled"
          color="dark"
          onClick={handleResetZoom}
          title="Reset zoom"
          style={{
            backgroundColor: 'rgba(30, 30, 30, 0.9)',
            backdropFilter: 'blur(4px)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          <IconZoomReset size={18} />
        </ActionIcon>
      </div>

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
        onNodeClick={handleNodeClick}
        onBackgroundClick={() => {
          // Clear selection when clicking background
          setSelectedNode(null);
          setHighlightNodes(new Set());
          setHighlightLinks(new Set());
          setSearchValue(null); // Clear search selector too
        }}
        onEngineStop={handleEngineStop}
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

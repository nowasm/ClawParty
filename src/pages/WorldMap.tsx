import { useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Globe, Users, Server, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { SiteHeader } from '@/components/scene/SiteHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { GRID_COLS, GRID_ROWS, toMapId, toMapCoords, getDefaultPreset } from '@/lib/mapRegistry';

// ============================================================================
// Types
// ============================================================================

interface MapCellInfo {
  mapId: number;
  syncNodes: number;
  players: number;
  hasServers: boolean;
}

// ============================================================================
// Preset colors for visual variety
// ============================================================================

const PRESET_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  '': { bg: 'bg-green-500/20', border: 'border-green-500/30', label: 'Plains' },
  '__preset__desert': { bg: 'bg-amber-500/20', border: 'border-amber-500/30', label: 'Desert' },
  '__preset__snow': { bg: 'bg-sky-300/20', border: 'border-sky-300/30', label: 'Snow' },
  '__preset__lava': { bg: 'bg-red-500/20', border: 'border-red-500/30', label: 'Lava' },
  '__preset__ocean': { bg: 'bg-blue-500/20', border: 'border-blue-500/30', label: 'Ocean' },
  '__preset__night': { bg: 'bg-indigo-500/20', border: 'border-indigo-500/30', label: 'Night' },
};

// ============================================================================
// Hook to fetch all heartbeat data for the world map
// ============================================================================

function useWorldMapData() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['world-map-heartbeats'],
    queryFn: async () => {
      // Query all recent heartbeat events
      const events: NostrEvent[] = await nostr.query([
        {
          kinds: [20311],
          '#t': ['3d-scene-sync'],
          limit: 200,
        },
      ]);

      // Aggregate: for each map, count sync nodes and total players
      const mapData = new Map<number, MapCellInfo>();
      const now = Math.floor(Date.now() / 1000);

      // Deduplicate by syncUrl (keep latest per server)
      const latestByServer = new Map<string, NostrEvent>();
      for (const event of events) {
        const syncTag = event.tags.find(([name]) => name === 'sync');
        const syncUrl = syncTag?.[1];
        if (!syncUrl) continue;

        const existing = latestByServer.get(syncUrl);
        if (!existing || event.created_at > existing.created_at) {
          latestByServer.set(syncUrl, event);
        }
      }

      for (const event of latestByServer.values()) {
        // Skip stale heartbeats (> 3 minutes old)
        if (now - event.created_at > 180) continue;

        const statusTag = event.tags.find(([name]) => name === 'status');
        if (statusTag?.[1] === 'offline') continue;

        const servesAll = event.tags.some(([name, val]) => name === 'serves' && val === 'all');

        // Process map tags
        for (const tag of event.tags) {
          if (tag[0] !== 'map') continue;
          const mapId = parseInt(tag[1], 10);
          if (isNaN(mapId) || mapId < 0 || mapId > 9999) continue;

          const playerCount = tag[2] ? parseInt(tag[2], 10) : 0;
          const existing = mapData.get(mapId) ?? {
            mapId,
            syncNodes: 0,
            players: 0,
            hasServers: false,
          };

          existing.syncNodes += 1;
          existing.players += isNaN(playerCount) ? 0 : playerCount;
          existing.hasServers = true;
          mapData.set(mapId, existing);
        }

        // If the server serves all maps but doesn't list them individually,
        // we note it as a general available server (handled via servesAll)
        if (servesAll) {
          // We can't add to all 10,000 maps here — just note for the UI
        }
      }

      return {
        mapData,
        totalServers: latestByServer.size,
        totalPlayers: Array.from(mapData.values()).reduce((sum, m) => sum + m.players, 0),
      };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

// ============================================================================
// WorldMap Component
// ============================================================================

/** How many cells to show per axis at each zoom level */
const ZOOM_LEVELS = [10, 20, 50, 100]; // 10x10, 20x20, 50x50, 100x100

const WorldMap = () => {
  const navigate = useNavigate();
  const [zoomIndex, setZoomIndex] = useState(1); // Start at 20x20
  const [viewOffset, setViewOffset] = useState({ x: 40, y: 40 }); // Center of grid
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const { data: worldData, isLoading } = useWorldMapData();

  const visibleCells = ZOOM_LEVELS[zoomIndex];

  // Calculate visible range
  const viewRange = useMemo(() => {
    const halfView = Math.floor(visibleCells / 2);
    const startX = Math.max(0, Math.min(GRID_COLS - visibleCells, viewOffset.x - halfView));
    const startY = Math.max(0, Math.min(GRID_ROWS - visibleCells, viewOffset.y - halfView));
    const endX = Math.min(GRID_COLS, startX + visibleCells);
    const endY = Math.min(GRID_ROWS, startY + visibleCells);
    return { startX, startY, endX, endY };
  }, [viewOffset, visibleCells]);

  // Generate visible cells
  const cells = useMemo(() => {
    const result: { mapId: number; x: number; y: number; preset: string; info?: MapCellInfo }[] = [];
    for (let y = viewRange.startY; y < viewRange.endY; y++) {
      for (let x = viewRange.startX; x < viewRange.endX; x++) {
        const mapId = toMapId(x, y);
        result.push({
          mapId,
          x,
          y,
          preset: getDefaultPreset(mapId),
          info: worldData?.mapData.get(mapId),
        });
      }
    }
    return result;
  }, [viewRange, worldData]);

  const zoomIn = useCallback(() => {
    setZoomIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomIndex((prev) => Math.min(ZOOM_LEVELS.length - 1, prev + 1));
  }, []);

  const resetView = useCallback(() => {
    setZoomIndex(1);
    setViewOffset({ x: 50, y: 50 });
  }, []);

  const handleCellClick = useCallback((mapId: number) => {
    if (isDragging) return;
    navigate(`/map/${mapId}`);
  }, [navigate, isDragging]);

  // Drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(false);
    dragStart.current = { x: e.clientX, y: e.clientY, offsetX: viewOffset.x, offsetY: viewOffset.y };

    const handleMouseMove = (me: MouseEvent) => {
      if (!dragStart.current) return;
      const dx = me.clientX - dragStart.current.x;
      const dy = me.clientY - dragStart.current.y;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        setIsDragging(true);
      }

      // Convert pixel delta to cell delta
      const cellSize = gridRef.current ? gridRef.current.clientWidth / visibleCells : 20;
      const cellDx = Math.round(dx / cellSize);
      const cellDy = Math.round(dy / cellSize);

      setViewOffset({
        x: Math.max(0, Math.min(GRID_COLS - 1, dragStart.current.offsetX - cellDx)),
        y: Math.max(0, Math.min(GRID_ROWS - 1, dragStart.current.offsetY - cellDy)),
      });
    };

    const handleMouseUp = () => {
      dragStart.current = null;
      setTimeout(() => setIsDragging(false), 50);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [viewOffset, visibleCells]);

  // Stats
  const totalServers = worldData?.totalServers ?? 0;
  const totalPlayers = worldData?.totalPlayers ?? 0;
  const activeMaps = worldData?.mapData.size ?? 0;

  // Hovered cell info
  const hoveredInfo = hoveredCell !== null ? cells.find((c) => c.mapId === hoveredCell) : null;

  useSeoMeta({
    title: 'World Map - ClawParty',
    description: 'Explore the 10,000-map world. Find maps with active players and sync servers.',
  });

  const gridCols = viewRange.endX - viewRange.startX;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero section */}
      <section className="relative isolate overflow-hidden border-b border-border bg-gradient-to-b from-background via-background to-card/30">
        <div className="absolute inset-0 -z-10 opacity-[0.03]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 2px 2px, hsl(var(--primary)) 1px, transparent 0)`,
              backgroundSize: '48px 48px',
            }}
          />
        </div>

        <div className="container py-12 md:py-16">
          <div className="mx-auto max-w-3xl text-center space-y-4">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" style={{ animationDuration: '3s' }} />
                <Globe className="h-9 w-9 text-primary relative" />
              </div>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              World Map
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              10,000 maps in a 100x100 grid. Click any map to enter and explore.
            </p>

            {/* Stats */}
            <div className="flex items-center justify-center gap-4 pt-2">
              <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
                <Server className="h-3.5 w-3.5" />
                {totalServers} sync nodes
              </Badge>
              <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
                <Users className="h-3.5 w-3.5" />
                {totalPlayers} players
              </Badge>
              <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
                <Globe className="h-3.5 w-3.5" />
                {activeMaps} active maps
              </Badge>
            </div>
          </div>
        </div>
      </section>

      {/* World map grid */}
      <section className="container py-6 md:py-8">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-muted-foreground">
            Showing {visibleCells}x{visibleCells} cells
            {hoveredInfo && (
              <span className="ml-3 text-foreground">
                Map #{hoveredInfo.mapId} ({hoveredInfo.x}, {hoveredInfo.y})
                {hoveredInfo.info && (
                  <> &middot; {hoveredInfo.info.players} players &middot; {hoveredInfo.info.syncNodes} nodes</>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={zoomIn}
                    disabled={zoomIndex === 0}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom in</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={zoomOut}
                    disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom out</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={resetView}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset view</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Grid */}
        <Card className="overflow-hidden">
          <CardContent className="p-2">
            {isLoading ? (
              <div className="aspect-square flex items-center justify-center">
                <div className="text-muted-foreground animate-pulse">Loading world data...</div>
              </div>
            ) : (
              <div
                ref={gridRef}
                className="aspect-square select-none cursor-grab active:cursor-grabbing"
                onMouseDown={handleMouseDown}
              >
                <div
                  className="grid gap-px h-full"
                  style={{
                    gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                  }}
                >
                  {cells.map((cell) => {
                    const presetStyle = PRESET_COLORS[cell.preset] ?? PRESET_COLORS[''];
                    const hasActivity = cell.info && (cell.info.players > 0 || cell.info.syncNodes > 0);

                    return (
                      <button
                        key={cell.mapId}
                        className={cn(
                          'relative rounded-[2px] transition-all duration-150',
                          'hover:ring-2 hover:ring-primary hover:z-10 hover:scale-110',
                          presetStyle.bg,
                          hasActivity && 'ring-1',
                          hasActivity && presetStyle.border,
                          hoveredCell === cell.mapId && 'ring-2 ring-primary z-10',
                        )}
                        onClick={() => handleCellClick(cell.mapId)}
                        onMouseEnter={() => setHoveredCell(cell.mapId)}
                        onMouseLeave={() => setHoveredCell(null)}
                        title={`Map #${cell.mapId} (${cell.x}, ${cell.y}) - ${presetStyle.label}`}
                      >
                        {/* Player indicator dot */}
                        {cell.info && cell.info.players > 0 && visibleCells <= 50 && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-2 h-2 bg-primary rounded-full animate-pulse shadow-lg shadow-primary/50" />
                          </div>
                        )}
                        {/* Server indicator (tiny corner dot) */}
                        {cell.info && cell.info.syncNodes > 0 && cell.info.players === 0 && visibleCells <= 20 && (
                          <div className="absolute top-0.5 right-0.5">
                            <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                          </div>
                        )}
                        {/* Cell label at highest zoom */}
                        {visibleCells <= 10 && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-[9px] text-muted-foreground/70">
                            <span>{cell.x},{cell.y}</span>
                            {cell.info && cell.info.players > 0 && (
                              <span className="text-primary font-medium">{cell.info.players}p</span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-muted-foreground">
          <span className="font-medium">Terrain:</span>
          {Object.entries(PRESET_COLORS).map(([key, style]) => (
            <div key={key || 'plains'} className="flex items-center gap-1.5">
              <div className={cn('w-3 h-3 rounded-sm', style.bg, 'border', style.border)} />
              <span>{style.label}</span>
            </div>
          ))}
          <span className="mx-2">|</span>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-primary rounded-full" />
            <span>Players online</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            <span>Sync node</span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default WorldMap;

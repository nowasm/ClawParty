import { useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import {
  Globe, Users, Server, ZoomIn, ZoomOut, Maximize2,
  Flame, Clock, ArrowRight, Map as MapIcon, Zap, Crown,
} from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { SiteHeader } from '@/components/scene/SiteHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
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
  /** Latest heartbeat timestamp for this map */
  lastSeen: number;
}

/** A ranked map for display in the leaderboard cards */
interface RankedMap extends MapCellInfo {
  x: number;
  y: number;
  preset: string;
  rank: number;
}

// ============================================================================
// Preset colors for visual variety
// ============================================================================

const PRESET_COLORS: Record<string, { bg: string; border: string; label: string; gradient: string; icon: string }> = {
  '': {
    bg: 'bg-green-500/20', border: 'border-green-500/30', label: 'Plains',
    gradient: 'from-green-500/30 to-emerald-600/10', icon: 'text-green-500',
  },
  '__preset__desert': {
    bg: 'bg-amber-500/20', border: 'border-amber-500/30', label: 'Desert',
    gradient: 'from-amber-500/30 to-orange-600/10', icon: 'text-amber-500',
  },
  '__preset__snow': {
    bg: 'bg-sky-300/20', border: 'border-sky-300/30', label: 'Snow',
    gradient: 'from-sky-300/30 to-blue-400/10', icon: 'text-sky-400',
  },
  '__preset__lava': {
    bg: 'bg-red-500/20', border: 'border-red-500/30', label: 'Lava',
    gradient: 'from-red-500/30 to-orange-700/10', icon: 'text-red-500',
  },
  '__preset__ocean': {
    bg: 'bg-blue-500/20', border: 'border-blue-500/30', label: 'Ocean',
    gradient: 'from-blue-500/30 to-cyan-600/10', icon: 'text-blue-500',
  },
  '__preset__night': {
    bg: 'bg-indigo-500/20', border: 'border-indigo-500/30', label: 'Night',
    gradient: 'from-indigo-500/30 to-violet-600/10', icon: 'text-indigo-400',
  },
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
            lastSeen: 0,
          };

          existing.syncNodes += 1;
          existing.players += isNaN(playerCount) ? 0 : playerCount;
          existing.hasServers = true;
          existing.lastSeen = Math.max(existing.lastSeen, event.created_at);
          mapData.set(mapId, existing);
        }

        // If the server serves all maps but doesn't list them individually,
        // we note it as a general available server (handled via servesAll)
        if (servesAll) {
          // We can't add to all 10,000 maps here — just note for the UI
        }
      }

      // Build ranked lists
      const allActive = Array.from(mapData.values()).filter((m) => m.hasServers);

      // Hot maps: sorted by player count descending
      const hotMaps: RankedMap[] = [...allActive]
        .sort((a, b) => b.players - a.players || b.syncNodes - a.syncNodes)
        .slice(0, 12)
        .map((m, i) => {
          const coords = toMapCoords(m.mapId);
          return { ...m, ...coords, preset: getDefaultPreset(m.mapId), rank: i + 1 };
        });

      // Recent maps: sorted by lastSeen descending (most recently active first)
      const recentMaps: RankedMap[] = [...allActive]
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .slice(0, 12)
        .map((m, i) => {
          const coords = toMapCoords(m.mapId);
          return { ...m, ...coords, preset: getDefaultPreset(m.mapId), rank: i + 1 };
        });

      return {
        mapData,
        hotMaps,
        recentMaps,
        totalServers: latestByServer.size,
        totalPlayers: allActive.reduce((sum, m) => sum + m.players, 0),
      };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

// ============================================================================
// Time-ago helper
// ============================================================================

function timeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 120) return '1 min ago';
  if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
  if (diff < 7200) return '1 hour ago';
  return `${Math.floor(diff / 3600)} hours ago`;
}

// ============================================================================
// MapRankCard component — visually rich card for each ranked map
// ============================================================================

function MapRankCard({
  map,
  mode,
  onClick,
}: {
  map: RankedMap;
  mode: 'hot' | 'recent';
  onClick: () => void;
}) {
  const presetStyle = PRESET_COLORS[map.preset] ?? PRESET_COLORS[''];
  const isTop3 = map.rank <= 3;
  const medalColors = ['', 'text-yellow-500', 'text-slate-400', 'text-amber-700'];

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-300',
        'hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1 hover:border-primary/40',
        'bg-card text-left w-full',
        isTop3 && 'ring-1 ring-primary/20',
      )}
    >
      {/* Top gradient bar */}
      <div className={cn('h-1.5 w-full bg-gradient-to-r', presetStyle.gradient)} />

      {/* Card body */}
      <div className="flex items-start gap-3 p-4">
        {/* Rank badge */}
        <div className={cn(
          'flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg font-bold text-sm',
          isTop3
            ? 'bg-primary/10 text-primary'
            : 'bg-muted text-muted-foreground',
        )}>
          {isTop3 ? (
            <Crown className={cn('h-5 w-5', medalColors[map.rank])} />
          ) : (
            <span>#{map.rank}</span>
          )}
        </div>

        {/* Map info */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">
              Map #{map.mapId}
            </span>
            <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0 h-4', presetStyle.icon)}>
              {presetStyle.label}
            </Badge>
          </div>

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapIcon className="h-3 w-3" />
            <span>({map.x}, {map.y})</span>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 pt-1">
            {map.players > 0 && (
              <div className="flex items-center gap-1">
                <div className="relative">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  {mode === 'hot' && map.players >= 3 && (
                    <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  )}
                </div>
                <span className="text-xs font-medium text-primary">
                  {map.players}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Zap className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs text-muted-foreground">
                {map.syncNodes} node{map.syncNodes !== 1 ? 's' : ''}
              </span>
            </div>
            {mode === 'recent' && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">
                  {timeAgo(map.lastSeen)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Enter arrow */}
        <div className="flex-shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
          <ArrowRight className="h-4 w-4 text-primary" />
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// MapRankSkeleton — loading skeleton for rank cards
// ============================================================================

function MapRankSkeleton() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Skeleton className="h-1.5 w-full" />
      <div className="flex items-start gap-3 p-4">
        <Skeleton className="w-9 h-9 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    </div>
  );
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
  const [rankTab, setRankTab] = useState<'hot' | 'recent'>('hot');
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

  // Navigate to a map
  const handleMapCardClick = useCallback((mapId: number) => {
    navigate(`/map/${mapId}`);
  }, [navigate]);

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

  // Ranked maps
  const hotMaps = worldData?.hotMaps ?? [];
  const recentMaps = worldData?.recentMaps ?? [];
  const displayedMaps = rankTab === 'hot' ? hotMaps : recentMaps;
  const hasRankedMaps = hotMaps.length > 0 || recentMaps.length > 0;

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

        <div className="container py-10 md:py-14">
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
              10,000 maps in a 100x100 grid. Find the hottest maps and jump right in.
            </p>

            {/* Stats */}
            <div className="flex items-center justify-center gap-3 md:gap-4 pt-2 flex-wrap">
              <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
                <Server className="h-3.5 w-3.5" />
                {totalServers} sync nodes
              </Badge>
              <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
                <Users className="h-3.5 w-3.5" />
                {totalPlayers} players online
              </Badge>
              <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
                <Globe className="h-3.5 w-3.5" />
                {activeMaps} active maps
              </Badge>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* MAP RANKINGS — Hot & Recent */}
      {/* ================================================================== */}
      <section className="container py-8 md:py-10">
        <div className="space-y-6">
          {/* Section header with tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2.5">
                {rankTab === 'hot' ? (
                  <>
                    <Flame className="h-6 w-6 text-orange-500" />
                    Hottest Maps
                  </>
                ) : (
                  <>
                    <Clock className="h-6 w-6 text-blue-500" />
                    Recently Active
                  </>
                )}
              </h2>
              <p className="text-sm text-muted-foreground">
                {rankTab === 'hot'
                  ? 'Maps with the most players right now'
                  : 'Maps that were recently active'}
              </p>
            </div>

            <Tabs value={rankTab} onValueChange={(v) => setRankTab(v as 'hot' | 'recent')}>
              <TabsList className="grid grid-cols-2 w-52">
                <TabsTrigger value="hot" className="gap-1.5 text-sm">
                  <Flame className="h-3.5 w-3.5" />
                  Hot
                </TabsTrigger>
                <TabsTrigger value="recent" className="gap-1.5 text-sm">
                  <Clock className="h-3.5 w-3.5" />
                  Recent
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Map cards grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <MapRankSkeleton key={i} />
              ))}
            </div>
          ) : hasRankedMaps ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {displayedMaps.map((map) => (
                <MapRankCard
                  key={map.mapId}
                  map={map}
                  mode={rankTab}
                  onClick={() => handleMapCardClick(map.mapId)}
                />
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 px-8 text-center">
                <div className="max-w-sm mx-auto space-y-4">
                  <div className="flex justify-center">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <Globe className="h-6 w-6 text-muted-foreground" />
                    </div>
                  </div>
                  <p className="text-muted-foreground">
                    No active maps yet. Start a sync server or wait for players to come online.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Divider */}
      <div className="container">
        <div className="border-t border-border" />
      </div>

      {/* ================================================================== */}
      {/* WORLD GRID MAP — full 100x100 zoomable grid */}
      {/* ================================================================== */}
      <section className="container py-8 md:py-10">
        <div className="space-y-4">
          {/* Section header + Toolbar */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2.5">
                <MapIcon className="h-6 w-6 text-primary" />
                World Grid
              </h2>
              <div className="text-sm text-muted-foreground">
                Showing {visibleCells}x{visibleCells} cells
                {hoveredInfo && (
                  <span className="ml-3 text-foreground font-medium">
                    Map #{hoveredInfo.mapId} ({hoveredInfo.x}, {hoveredInfo.y})
                    {hoveredInfo.info && (
                      <> &middot; {hoveredInfo.info.players} players &middot; {hoveredInfo.info.syncNodes} nodes</>
                    )}
                  </span>
                )}
              </div>
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
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
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
        </div>
      </section>
    </div>
  );
};

export default WorldMap;

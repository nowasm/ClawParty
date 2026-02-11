import { useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import {
  Globe, Users, ZoomIn, ZoomOut, Maximize2,
  Flame, ArrowRight, Map as MapIcon, Crown, Shield,
  Server, Activity, Clock, MapPinned, Wifi,
} from 'lucide-react';
import { SiteHeader } from '@/components/scene/SiteHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  GRID_COLS, GRID_ROWS,
  toMapId, toMapCoords, getDefaultPreset,
} from '@/lib/mapRegistry';
import { useGuardedMaps, type GuardedMapInfo } from '@/hooks/useGuardedMaps';
import { useSyncServerList, type SyncServerNode } from '@/hooks/useSyncServerList';
import { getPresetByMapId } from '@/lib/scene';

// ============================================================================
// Types
// ============================================================================

/** A ranked map for display in the leaderboard cards */
interface RankedMap {
  mapId: number;
  x: number;
  y: number;
  preset: string;
  guardianCount: number;
  playerCount: number;
  rank: number;
}

// ============================================================================
// Preset colors
// ============================================================================

const PRESET_COLORS: Record<string, { bg: string; border: string; label: string; gradient: string }> = {
  '': {
    bg: 'bg-green-500/40', border: 'border-green-500/50', label: 'Plains',
    gradient: 'from-green-500/30 to-emerald-600/10',
  },
  '__preset__desert': {
    bg: 'bg-amber-500/40', border: 'border-amber-500/50', label: 'Desert',
    gradient: 'from-amber-500/30 to-orange-600/10',
  },
  '__preset__snow': {
    bg: 'bg-sky-300/40', border: 'border-sky-300/50', label: 'Snow',
    gradient: 'from-sky-300/30 to-blue-400/10',
  },
  '__preset__lava': {
    bg: 'bg-red-500/40', border: 'border-red-500/50', label: 'Lava',
    gradient: 'from-red-500/30 to-orange-700/10',
  },
  '__preset__ocean': {
    bg: 'bg-blue-500/40', border: 'border-blue-500/50', label: 'Ocean',
    gradient: 'from-blue-500/30 to-cyan-600/10',
  },
  '__preset__night': {
    bg: 'bg-indigo-500/40', border: 'border-indigo-500/50', label: 'Night',
    gradient: 'from-indigo-500/30 to-violet-600/10',
  },
};

// ============================================================================
// Time-ago helper
// ============================================================================

// ============================================================================
// MapRankCard — card for ranked maps
// ============================================================================

function MapRankCard({
  map,
  mode: _mode,
  onClick,
}: {
  map: RankedMap;
  mode: 'hot' | 'recent';
  onClick: () => void;
}) {
  const presetStyle = PRESET_COLORS[map.preset] ?? PRESET_COLORS[''];
  const isTop3 = map.rank <= 3;
  const medalColors = ['', 'text-yellow-500', 'text-slate-400', 'text-amber-700'];
  const mapPreset = getPresetByMapId(map.mapId);

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
      <div className={cn('h-1.5 w-full bg-gradient-to-r', presetStyle.gradient)} />
      <div className="flex items-start gap-3 p-4">
        <div className={cn(
          'flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg font-bold text-sm',
          isTop3 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}>
          {isTop3 ? (
            <Crown className={cn('h-5 w-5', medalColors[map.rank])} />
          ) : (
            <span>#{map.rank}</span>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">
              {mapPreset ? mapPreset.title : `Map #${map.mapId}`}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapIcon className="h-3 w-3" />
            <span>({map.x}, {map.y})</span>
          </div>
          <div className="flex items-center gap-3 pt-1">
            {map.playerCount > 0 && (
              <div className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-primary">{map.playerCount}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Shield className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs text-muted-foreground">
                {map.guardianCount} guardian{map.guardianCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
          <ArrowRight className="h-4 w-4 text-primary" />
        </div>
      </div>
    </button>
  );
}

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
// SyncServerCard — card for a sync server node
// ============================================================================

/** Format uptime seconds into a human-readable string */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function SyncServerCard({ server }: { server: SyncServerNode }) {
  const loadPercent = server.maxPlayers > 0
    ? Math.round((server.currentPlayers / server.maxPlayers) * 100)
    : 0;

  const loadColor = loadPercent > 70
    ? 'text-red-500'
    : loadPercent > 40
      ? 'text-amber-500'
      : 'text-emerald-500';

  const loadBarColor = loadPercent > 70
    ? 'bg-red-500'
    : loadPercent > 40
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  // Display a short version of the sync URL
  const displayUrl = (() => {
    try {
      const url = new URL(server.syncUrl);
      return url.host;
    } catch {
      return server.syncUrl;
    }
  })();

  return (
    <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-md hover:shadow-primary/5 hover:border-primary/30">
      {/* Status indicator bar */}
      <div className={cn(
        'h-1 w-full',
        server.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500',
      )} />

      <CardContent className="p-4 space-y-3">
        {/* Header: URL + Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn(
              'flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg',
              'bg-primary/10',
            )}>
              <Server className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{displayUrl}</p>
              <p className="text-[10px] text-muted-foreground font-mono truncate">
                {server.pubkey.slice(0, 12)}...
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'flex-shrink-0 text-[10px] gap-1 h-5',
              server.status === 'active' ? 'text-emerald-600 border-emerald-500/30' : 'text-amber-600 border-amber-500/30',
            )}
          >
            <span className={cn(
              'w-1.5 h-1.5 rounded-full',
              server.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500',
            )} />
            {server.status}
          </Badge>
        </div>

        {/* Load bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Load</span>
            <span className={cn('font-medium', loadColor)}>
              {server.currentPlayers}/{server.maxPlayers} ({loadPercent}%)
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', loadBarColor)}
              style={{ width: `${Math.min(100, loadPercent)}%` }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
          <div className="flex items-center gap-1" title="Active rooms">
            <Activity className="h-3 w-3" />
            <span>{server.activeRooms} room{server.activeRooms !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1" title="Maps served">
            <MapPinned className="h-3 w-3" />
            <span>{server.servesAll ? 'All maps' : `${server.servedMapIds.length} map${server.servedMapIds.length !== 1 ? 's' : ''}`}</span>
          </div>
          {server.region && (
            <div className="flex items-center gap-1" title="Region">
              <Globe className="h-3 w-3" />
              <span>{server.region}</span>
            </div>
          )}
          <div className="flex items-center gap-1" title="Uptime">
            <Clock className="h-3 w-3" />
            <span>{formatUptime(server.uptime)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SyncServerSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="h-1 w-full" />
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// WorldMap Component
// ============================================================================

const ZOOM_LEVELS = [10, 20, 50, 100];

const WorldMap = () => {
  const navigate = useNavigate();
  const [zoomIndex, setZoomIndex] = useState(3);
  const [viewOffset, setViewOffset] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);
  const [rankTab, setRankTab] = useState<'hot' | 'recent'>('hot');
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const { guardedMaps, guardedSet, isEnterable, isLoading } = useGuardedMaps();
  const { servers: syncServers, isLoading: serversLoading } = useSyncServerList();

  const visibleCells = ZOOM_LEVELS[zoomIndex];

  // Build ranked lists from guarded maps
  const { hotMaps, recentMaps, totalPlayers, guardedCount } = useMemo(() => {
    const allGuarded = Array.from(guardedMaps.values());

    const hot: RankedMap[] = [...allGuarded]
      .sort((a, b) => b.playerCount - a.playerCount || b.guardianCount - a.guardianCount)
      .filter((m) => m.playerCount > 0 || m.guardianCount > 0)
      .slice(0, 12)
      .map((m, i) => {
        const coords = toMapCoords(m.mapId);
        return {
          ...m, ...coords,
          preset: getDefaultPreset(m.mapId),
          rank: i + 1,
        };
      });

    const recent: RankedMap[] = [...allGuarded]
      .sort((a, b) => b.guardianCount - a.guardianCount || b.playerCount - a.playerCount)
      .slice(0, 12)
      .map((m, i) => {
        const coords = toMapCoords(m.mapId);
        return {
          ...m, ...coords,
          preset: getDefaultPreset(m.mapId),
          rank: i + 1,
        };
      });

    let tPlayers = 0;
    for (const m of allGuarded) {
      tPlayers += m.playerCount;
    }

    return {
      hotMaps: hot,
      recentMaps: recent,
      totalPlayers: tPlayers,
      guardedCount: guardedSet.size,
    };
  }, [guardedMaps, guardedSet]);

  const displayedMaps = rankTab === 'hot' ? hotMaps : recentMaps;
  const hasRankedMaps = hotMaps.length > 0 || recentMaps.length > 0;

  // Calculate visible range
  const viewRange = useMemo(() => {
    const halfView = Math.floor(visibleCells / 2);
    const startX = Math.max(0, Math.min(GRID_COLS - visibleCells, viewOffset.x - halfView));
    const startY = Math.max(0, Math.min(GRID_ROWS - visibleCells, viewOffset.y - halfView));
    const endX = Math.min(GRID_COLS, startX + visibleCells);
    const endY = Math.min(GRID_ROWS, startY + visibleCells);
    return { startX, startY, endX, endY };
  }, [viewOffset, visibleCells]);

  // Heat (player count) per map for coloring; 0 = gray, >0 = colored by preset + intensity
  const heatByMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const [mapId, info] of guardedMaps) {
      map.set(mapId, info.playerCount);
    }
    return map;
  }, [guardedMaps]);

  // Generate visible cells (all tiles enterable; color by heat)
  const cells = useMemo(() => {
    const result: {
      mapId: number; x: number; y: number; preset: string;
      info?: GuardedMapInfo; enterable: boolean; heat: number;
    }[] = [];
    for (let y = viewRange.startY; y < viewRange.endY; y++) {
      for (let x = viewRange.startX; x < viewRange.endX; x++) {
        const mapId = toMapId(x, y);
        const heat = heatByMap.get(mapId) ?? 0;
        result.push({
          mapId, x, y,
          preset: getDefaultPreset(mapId),
          info: guardedMaps.get(mapId),
          enterable: isEnterable(mapId),
          heat,
        });
      }
    }
    return result;
  }, [viewRange, guardedMaps, heatByMap, isEnterable]);

  const zoomIn = useCallback(() => setZoomIndex((p) => Math.max(0, p - 1)), []);
  const zoomOut = useCallback(() => setZoomIndex((p) => Math.min(ZOOM_LEVELS.length - 1, p + 1)), []);
  const resetView = useCallback(() => {
    setZoomIndex(3);
    setViewOffset({ x: 50, y: 50 });
  }, []);

  const handleCellClick = useCallback((mapId: number, enterable: boolean) => {
    if (isDragging || !enterable) return;
    navigate(`/map/${mapId}`);
  }, [navigate, isDragging]);

  const handleMapCardClick = useCallback((mapId: number) => navigate(`/map/${mapId}`), [navigate]);

  // Drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(false);
    dragStart.current = { x: e.clientX, y: e.clientY, offsetX: viewOffset.x, offsetY: viewOffset.y };

    const handleMouseMove = (me: MouseEvent) => {
      if (!dragStart.current) return;
      const dx = me.clientX - dragStart.current.x;
      const dy = me.clientY - dragStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) setIsDragging(true);

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

  // Hovered cell info
  const hoveredInfo = hoveredCell !== null ? cells.find((c) => c.mapId === hoveredCell) : null;

  useSeoMeta({
    title: 'World Map - ClawParty',
    description: 'Explore the 10,000-tile world guarded by lobsters.',
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
              Lobster World
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              10,000 tiles, all enterable. Color shows heat (player count); gray = empty, colored = active.
            </p>

            <div className="flex items-center justify-center gap-3 md:gap-4 pt-2 flex-wrap">
              <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
                <Shield className="h-3.5 w-3.5" />
                {guardedCount} tiles guarded
              </Badge>
              <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
                <Users className="h-3.5 w-3.5" />
                {totalPlayers} players online
              </Badge>
            </div>
          </div>
        </div>
      </section>

      {/* Rankings */}
      <section className="container py-8 md:py-10">
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2.5">
                {rankTab === 'hot' ? (
                  <><Flame className="h-6 w-6 text-orange-500" /> Hottest Maps</>
                ) : (
                  <><Shield className="h-6 w-6 text-emerald-500" /> Most Guarded</>
                )}
              </h2>
              <p className="text-sm text-muted-foreground">
                {rankTab === 'hot'
                  ? 'Maps with the most players right now'
                  : 'Maps with the most guardian lobsters'}
              </p>
            </div>
            <Tabs value={rankTab} onValueChange={(v) => setRankTab(v as 'hot' | 'recent')}>
              <TabsList className="grid grid-cols-2 w-52">
                <TabsTrigger value="hot" className="gap-1.5 text-sm">
                  <Flame className="h-3.5 w-3.5" />
                  Hot
                </TabsTrigger>
                <TabsTrigger value="recent" className="gap-1.5 text-sm">
                  <Shield className="h-3.5 w-3.5" />
                  Guarded
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => <MapRankSkeleton key={i} />)}
            </div>
          ) : hasRankedMaps ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {displayedMaps.map((map) => (
                <MapRankCard key={map.mapId} map={map} mode={rankTab} onClick={() => handleMapCardClick(map.mapId)} />
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 px-8 text-center">
                <div className="max-w-sm mx-auto space-y-4">
                  <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                  <p className="text-muted-foreground">
                    No guardians active yet. Waiting for lobsters to protect the world...
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Active Sync Servers */}
      <section className="container py-8 md:py-10">
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2.5">
              <Wifi className="h-6 w-6 text-primary" />
              Active Sync Servers
            </h2>
            <p className="text-sm text-muted-foreground">
              Guardian nodes providing real-time multiplayer sync. Servers publish heartbeats every 60 seconds via Nostr.
            </p>
          </div>

          {serversLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => <SyncServerSkeleton key={i} />)}
            </div>
          ) : syncServers.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {syncServers.map((server) => (
                <SyncServerCard key={server.syncUrl} server={server} />
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 px-8 text-center">
                <div className="max-w-sm mx-auto space-y-4">
                  <Server className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                  <div className="space-y-2">
                    <p className="text-muted-foreground">
                      No sync servers are online right now. Maps can still be explored in offline mode.
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      Servers broadcast kind 10311 heartbeat events to Nostr relays for discovery.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <div className="container"><div className="border-t border-border" /></div>

      {/* World Grid */}
      <section className="container py-8 md:py-10">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2.5">
                <MapIcon className="h-6 w-6 text-primary" />
                World Grid
              </h2>
              <div className="text-sm text-muted-foreground">
                {visibleCells}x{visibleCells} view
                {hoveredInfo && (
                  <span className="ml-3 text-foreground font-medium">
                    Map #{hoveredInfo.mapId} ({hoveredInfo.x}, {hoveredInfo.y})
                    {hoveredInfo.info && (
                      <> &middot; {hoveredInfo.info.guardianCount} guardian{hoveredInfo.info.guardianCount !== 1 ? 's' : ''} &middot; {hoveredInfo.info.playerCount} players</>
                    )}
                    {hoveredInfo.heat === 0 && ' &middot; 0 players'}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={zoomIn} disabled={zoomIndex === 0}>
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom in</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={zoomOut} disabled={zoomIndex === ZOOM_LEVELS.length - 1}>
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom out</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={resetView}>
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reset view</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

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
                    style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}
                  >
                    {cells.map((cell) => {
                      const presetStyle = PRESET_COLORS[cell.preset] ?? PRESET_COLORS[''];
                      const isGuarded = !!cell.info && cell.info.guardianCount > 0;
                      const hasHeat = cell.heat > 0; // 0 players = gray, any players = preset color by heat

                      return (
                        <button
                          key={cell.mapId}
                          className={cn(
                            'relative rounded-[2px] transition-all duration-150',
                            hasHeat
                              ? cn(
                                  presetStyle.bg,
                                  'hover:ring-2 hover:ring-primary hover:z-10 hover:scale-110',
                                  isGuarded && 'ring-1',
                                  isGuarded && presetStyle.border,
                                )
                              : cn(
                                  'bg-muted/30 dark:bg-muted/20',
                                  'hover:ring-2 hover:ring-primary/50 hover:z-10 hover:scale-105',
                                ),
                            hoveredCell === cell.mapId && 'ring-2 ring-primary z-10',
                          )}
                          onClick={() => handleCellClick(cell.mapId, cell.enterable)}
                          onMouseEnter={() => setHoveredCell(cell.mapId)}
                          onMouseLeave={() => setHoveredCell(null)}
                          title={
                            `Map #${cell.mapId} (${cell.x}, ${cell.y}) - ${presetStyle.label}${cell.info ? ` · ${cell.info.guardianCount} guardians · ${cell.info.playerCount} players` : ' · 0 players'}`
                          }
                        >
                          {/* Player indicator */}
                          {cell.info && cell.info.playerCount > 0 && visibleCells <= 50 && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-2 h-2 bg-primary rounded-full animate-pulse shadow-lg shadow-primary/50" />
                            </div>
                          )}
                          {/* Guardian indicator (small shield) */}
                          {isGuarded && cell.info && cell.info.playerCount === 0 && visibleCells <= 20 && (
                            <div className="absolute top-0.5 right-0.5">
                              <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                            </div>
                          )}
                          {/* Cell label at highest zoom */}
                          {visibleCells <= 10 && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-[9px] text-muted-foreground/70">
                              <span>{cell.x},{cell.y}</span>
                              {cell.heat > 0 && (
                                <span className="text-primary font-medium">{cell.heat}p</span>
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
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-green-500/40 border border-green-500/50" />
              <span>Has players (heat)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-muted/30 border border-muted" />
              <span>Empty (0 players)</span>
            </div>
            <span className="mx-1">|</span>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-primary rounded-full" />
              <span>Players</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              <span>Guardian</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default WorldMap;

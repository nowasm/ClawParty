import { useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import {
  Globe, Users, ZoomIn, ZoomOut, Maximize2,
  Flame, Clock, ArrowRight, Map as MapIcon, Crown, Shield, Lock,
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
  GRID_COLS, GRID_ROWS, SEED_MAP_IDS,
  toMapId, toMapCoords, getDefaultPreset, isSeedMap,
} from '@/lib/mapRegistry';
import { useGuardedMaps, type GuardedMapInfo } from '@/hooks/useGuardedMaps';
import { getSeedPreset } from '@/lib/scene';

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
  isSeed: boolean;
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
// MapRankCard — card for ranked maps
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
  const seedPreset = getSeedPreset(map.mapId);

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
              {seedPreset ? seedPreset.title : `Map #${map.mapId}`}
            </span>
            {map.isSeed && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                Seed
              </Badge>
            )}
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
// WorldMap Component
// ============================================================================

const ZOOM_LEVELS = [10, 20, 50, 100];

const WorldMap = () => {
  const navigate = useNavigate();
  const [zoomIndex, setZoomIndex] = useState(1);
  const [viewOffset, setViewOffset] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);
  const [rankTab, setRankTab] = useState<'hot' | 'recent'>('hot');
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const { guardedMaps, guardedSet, isEnterable, isLoading } = useGuardedMaps();

  const visibleCells = ZOOM_LEVELS[zoomIndex];

  // Build ranked lists from guarded maps
  const { hotMaps, recentMaps, totalGuardians, totalPlayers, guardedCount } = useMemo(() => {
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
          isSeed: isSeedMap(m.mapId),
        };
      });

    // For recent, we don't have timestamps per-map, so use guardian count as proxy
    const recent: RankedMap[] = [...allGuarded]
      .sort((a, b) => b.guardianCount - a.guardianCount || b.playerCount - a.playerCount)
      .slice(0, 12)
      .map((m, i) => {
        const coords = toMapCoords(m.mapId);
        return {
          ...m, ...coords,
          preset: getDefaultPreset(m.mapId),
          rank: i + 1,
          isSeed: isSeedMap(m.mapId),
        };
      });

    // Count unique guardians (deduplicated by guardedMaps already)
    let tGuardians = 0;
    let tPlayers = 0;
    for (const m of allGuarded) {
      tGuardians = Math.max(tGuardians, m.guardianCount); // approximate
      tPlayers += m.playerCount;
    }

    return {
      hotMaps: hot,
      recentMaps: recent,
      totalGuardians: allGuarded.reduce((max, m) => Math.max(max, m.guardianCount), 0),
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

  // Generate visible cells
  const cells = useMemo(() => {
    const result: {
      mapId: number; x: number; y: number; preset: string;
      info?: GuardedMapInfo; isSeed: boolean; enterable: boolean;
    }[] = [];
    for (let y = viewRange.startY; y < viewRange.endY; y++) {
      for (let x = viewRange.startX; x < viewRange.endX; x++) {
        const mapId = toMapId(x, y);
        result.push({
          mapId, x, y,
          preset: getDefaultPreset(mapId),
          info: guardedMaps.get(mapId),
          isSeed: isSeedMap(mapId),
          enterable: isEnterable(mapId),
        });
      }
    }
    return result;
  }, [viewRange, guardedMaps, isEnterable]);

  const zoomIn = useCallback(() => setZoomIndex((p) => Math.max(0, p - 1)), []);
  const zoomOut = useCallback(() => setZoomIndex((p) => Math.min(ZOOM_LEVELS.length - 1, p + 1)), []);
  const resetView = useCallback(() => {
    setZoomIndex(1);
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
              10,000 tiles guarded by lobsters. Green tiles are protected and ready to explore.
              Gray tiles await their guardian.
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
                    {hoveredInfo.isSeed && ' [Seed]'}
                    {hoveredInfo.info && (
                      <> &middot; {hoveredInfo.info.guardianCount} guardian{hoveredInfo.info.guardianCount !== 1 ? 's' : ''} &middot; {hoveredInfo.info.playerCount} players</>
                    )}
                    {!hoveredInfo.enterable && ' (locked)'}
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
                      const isGreen = cell.enterable;

                      return (
                        <button
                          key={cell.mapId}
                          className={cn(
                            'relative rounded-[2px] transition-all duration-150',
                            // Green (guarded/seed) vs Gray (unguarded)
                            isGreen
                              ? cn(
                                  presetStyle.bg,
                                  'hover:ring-2 hover:ring-primary hover:z-10 hover:scale-110',
                                  isGuarded && 'ring-1',
                                  isGuarded && presetStyle.border,
                                  cell.isSeed && !isGuarded && 'ring-1 ring-dashed ring-primary/30',
                                )
                              : cn(
                                  'bg-muted/30 dark:bg-muted/20',
                                  'cursor-not-allowed opacity-60',
                                ),
                            hoveredCell === cell.mapId && isGreen && 'ring-2 ring-primary z-10',
                          )}
                          onClick={() => handleCellClick(cell.mapId, cell.enterable)}
                          onMouseEnter={() => setHoveredCell(cell.mapId)}
                          onMouseLeave={() => setHoveredCell(null)}
                          title={
                            isGreen
                              ? `${cell.isSeed ? '[Seed] ' : ''}Map #${cell.mapId} (${cell.x}, ${cell.y}) - ${presetStyle.label}${cell.info ? ` · ${cell.info.guardianCount} guardians · ${cell.info.playerCount} players` : ''}`
                              : `Map #${cell.mapId} (${cell.x}, ${cell.y}) - Awaiting guardian`
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
                          {/* Seed indicator */}
                          {cell.isSeed && visibleCells <= 20 && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary/60 rounded-full" />
                          )}
                          {/* Cell label at highest zoom */}
                          {visibleCells <= 10 && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-[9px] text-muted-foreground/70">
                              {cell.isSeed ? (
                                <span className="text-primary font-bold text-[8px]">SEED</span>
                              ) : (
                                <span>{cell.x},{cell.y}</span>
                              )}
                              {cell.info && cell.info.playerCount > 0 && (
                                <span className="text-primary font-medium">{cell.info.playerCount}p</span>
                              )}
                              {!isGreen && (
                                <Lock className="h-2 w-2 text-muted-foreground/40" />
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
              <span>Guarded (enterable)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-muted/30 border border-muted" />
              <span>Unguarded (locked)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-primary/20 border-b-2 border-primary/60" />
              <span>Seed point</span>
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

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Server,
  Wifi,
  WifiOff,
  Loader2,
  Star,
  Activity,
  Clock,
  Gauge,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ServerConnectionSnapshot } from '@/lib/multiSyncManager';
import type { ConnectionState } from '@/hooks/useSceneSync';

interface SyncDebugPanelProps {
  /** Overall connection state */
  connectionState: ConnectionState;
  /** Per-server connection snapshots */
  serverConnections: ServerConnectionSnapshot[];
  /** Number of connected peers */
  connectedPeers: number;
  /** The sync URLs that were provided to the sync manager */
  syncUrls: string[];
}

/** Format RTT for display */
function formatRtt(rtt: number): string {
  if (!isFinite(rtt)) return '—';
  if (rtt < 1) return '<1ms';
  return `${Math.round(rtt)}ms`;
}

/** Get a short display name from a WebSocket URL */
function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url;
  }
}

/** Get badge variant and label for a connection state */
function getStateBadge(state: string): { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string } {
  switch (state) {
    case 'connected':
      return { variant: 'default', label: 'Connected' };
    case 'connecting':
      return { variant: 'secondary', label: 'Connecting' };
    case 'authenticating':
      return { variant: 'secondary', label: 'Auth...' };
    case 'disconnected':
      return { variant: 'destructive', label: 'Offline' };
    default:
      return { variant: 'outline', label: state };
  }
}

/** Get the state icon */
function StateIcon({ state }: { state: string }) {
  switch (state) {
    case 'connected':
      return <Wifi className="h-3 w-3 text-green-500" />;
    case 'connecting':
    case 'authenticating':
      return <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />;
    case 'disconnected':
      return <WifiOff className="h-3 w-3 text-red-500" />;
    default:
      return <Server className="h-3 w-3 text-muted-foreground" />;
  }
}

export function SyncDebugPanel({
  connectionState,
  serverConnections,
  connectedPeers,
  syncUrls,
}: SyncDebugPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const connectedServers = serverConnections.filter((s) => s.state === 'connected').length;
  const totalServers = serverConnections.length;
  const primaryServer = serverConnections.find((s) => s.isPrimary);

  // Overall status indicator color
  const statusColor =
    connectionState === 'connected'
      ? 'bg-green-500'
      : connectionState === 'connecting'
        ? 'bg-yellow-500'
        : 'bg-red-500';

  return (
    <div className="bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-lg text-xs font-mono w-72 overflow-hidden">
      {/* Header - always visible */}
      <Button
        variant="ghost"
        className="w-full h-auto px-3 py-2 rounded-none justify-between hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${statusColor} animate-pulse`} />
          <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            Sync Debug
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-5 text-[10px] px-1.5 gap-1 font-mono">
            <Server className="h-2.5 w-2.5" />
            {connectedServers}/{totalServers}
          </Badge>
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </Button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border">
          {/* Summary row */}
          <div className="px-3 py-2 border-b border-border/50 flex items-center gap-4 text-muted-foreground">
            <div className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              <span>{connectionState}</span>
            </div>
            <div className="flex items-center gap-1">
              <Gauge className="h-3 w-3" />
              <span>{connectedPeers} peers</span>
            </div>
          </div>

          {/* Server list */}
          {serverConnections.length === 0 ? (
            <div className="px-3 py-4 text-center text-muted-foreground">
              No sync servers configured
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {serverConnections.map((conn) => {
                const badge = getStateBadge(conn.state);
                return (
                  <div
                    key={conn.url}
                    className={`px-3 py-2 space-y-1 ${
                      conn.isPrimary ? 'bg-primary/5' : ''
                    }`}
                  >
                    {/* Server URL + primary badge */}
                    <div className="flex items-center gap-1.5">
                      <StateIcon state={conn.state} />
                      <span className="truncate flex-1 text-foreground" title={conn.url}>
                        {shortUrl(conn.url)}
                      </span>
                      {conn.isPrimary && (
                        <Badge
                          variant="default"
                          className="h-4 text-[9px] px-1 gap-0.5 bg-amber-500/90 hover:bg-amber-500 text-white"
                        >
                          <Star className="h-2 w-2" />
                          PRIMARY
                        </Badge>
                      )}
                    </div>
                    {/* Stats row */}
                    <div className="flex items-center gap-3 text-muted-foreground pl-4">
                      <Badge variant={badge.variant} className="h-4 text-[9px] px-1.5">
                        {badge.label}
                      </Badge>
                      <div className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        <span>RTT: {formatRtt(conn.rtt)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Configured URLs (if there are URLs not yet in connections) */}
          {syncUrls.length > 0 && syncUrls.some((u) => !serverConnections.find((s) => s.url === u)) && (
            <div className="px-3 py-2 border-t border-border/50">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                Pending URLs
              </div>
              {syncUrls
                .filter((u) => !serverConnections.find((s) => s.url === u))
                .map((url) => (
                  <div key={url} className="text-muted-foreground truncate pl-2" title={url}>
                    {shortUrl(url)}
                  </div>
                ))}
            </div>
          )}

          {/* Primary server info */}
          {primaryServer && (
            <div className="px-3 py-2 border-t border-border/50 text-muted-foreground">
              <div className="text-[10px] uppercase tracking-wide mb-0.5">Primary Server</div>
              <div className="text-foreground truncate" title={primaryServer.url}>
                {shortUrl(primaryServer.url)}
              </div>
              <div className="text-[10px]">
                Position data is received from this server (lowest RTT)
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

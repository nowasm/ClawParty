/**
 * LineSelector — lobster guardian line selection UI.
 *
 * Shows which guardian line the player is connected to,
 * and allows switching between up to 3 available lines.
 */

import { useState } from 'react';
import { ChevronDown, Users, Wifi, WifiOff, Shield, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { GuardianLine } from '@/hooks/useLineSelection';

interface LineSelectorProps {
  /** Available guardian lines (max 3) */
  lines: GuardianLine[];
  /** Currently connected line */
  currentLine: GuardianLine | null;
  /** Total guardians for this map */
  totalGuardians: number;
  /** Whether the map is unguarded */
  isUnguarded: boolean;
  /** Whether data is loading */
  isLoading: boolean;
  /** Callback when user selects a line */
  onSelectLine: (id: string) => void;
  /** Connection state from sync hook */
  connectionState: 'disconnected' | 'connecting' | 'connected';
}

export function LineSelector({
  lines,
  currentLine,
  totalGuardians,
  isUnguarded,
  isLoading,
  onSelectLine,
  connectionState,
}: LineSelectorProps) {
  const [open, setOpen] = useState(false);

  if (isUnguarded && !isLoading) {
    return (
      <Badge variant="destructive" className="gap-1.5 h-7 text-xs">
        <WifiOff className="h-3 w-3" />
        No Guardian
      </Badge>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <Badge variant="secondary" className="gap-1.5 h-7 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Discovering...
      </Badge>
    );
  }

  // Single line — simplified display
  if (lines.length <= 1) {
    return (
      <Badge
        variant={connectionState === 'connected' ? 'default' : 'secondary'}
        className="gap-1.5 h-7 text-xs"
      >
        {connectionState === 'connected' ? (
          <Shield className="h-3 w-3" />
        ) : connectionState === 'connecting' ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <WifiOff className="h-3 w-3" />
        )}
        {currentLine
          ? `Line 1 (${currentLine.playerCount})`
          : 'Connecting...'}
      </Badge>
    );
  }

  // Multiple lines — popover selector
  const currentIndex = currentLine
    ? lines.findIndex((l) => l.id === currentLine.id) + 1
    : 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-7 gap-1.5 text-xs px-2.5',
            connectionState === 'connected' && 'border-green-500/50 text-green-700 dark:text-green-400',
          )}
        >
          {connectionState === 'connected' ? (
            <Shield className="h-3 w-3" />
          ) : connectionState === 'connecting' ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          Line {currentIndex} ({currentLine?.playerCount ?? 0})
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground px-2 py-1">
            {totalGuardians} guardian{totalGuardians !== 1 ? 's' : ''} available
            {totalGuardians > 3 && ` (showing top 3)`}
          </p>
          {lines.map((line, idx) => {
            const isActive = currentLine?.id === line.id;
            const loadPct = line.capacity > 0
              ? Math.round((line.playerCount / line.capacity) * 100)
              : 0;

            return (
              <button
                key={line.id}
                onClick={() => {
                  onSelectLine(line.id);
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted text-foreground',
                )}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Shield className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
                  <div className="text-left min-w-0">
                    <div className="font-medium truncate">
                      Line {idx + 1}
                      {line.isPrimary && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">
                          recommended
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      #{line.id}{line.region ? ` · ${line.region}` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className={cn(
                    'text-xs tabular-nums',
                    loadPct > 70 ? 'text-orange-500' : 'text-muted-foreground',
                  )}>
                    {line.playerCount}/{line.capacity}
                  </span>
                  {isActive && <Wifi className="h-3 w-3 text-green-500" />}
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

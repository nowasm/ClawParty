import { useParams, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Users, MapPin, Shield, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { SceneViewer } from '@/components/scene/SceneViewer';
import { SceneChat } from '@/components/scene/SceneChat';
import { EmojiBar } from '@/components/scene/EmojiBar';
import { SiteHeader } from '@/components/scene/SiteHeader';
import { SyncDebugPanel } from '@/components/scene/SyncDebugPanel';
import { LineSelector } from '@/components/scene/LineSelector';
import { useAvatars } from '@/hooks/useAvatar';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAvatar } from '@/hooks/useAvatar';
import { useSceneSync } from '@/hooks/useSceneSync';
import { useLineSelection } from '@/hooks/useLineSelection';
import NotFound from './NotFound';
import { AVATAR_PRESETS, getSeedPreset, type AvatarConfig } from '@/lib/scene';
import { isValidMapId, toMapCoords, getDefaultPreset, isSeedMap } from '@/lib/mapRegistry';
import { useCallback, useMemo, useEffect, useRef, useState } from 'react';

const MapView = () => {
  const { mapId: mapIdStr } = useParams<{ mapId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useCurrentUser();

  // Parse and validate map ID
  const mapId = mapIdStr !== undefined ? parseInt(mapIdStr, 10) : NaN;
  const validMapId = !isNaN(mapId) && isValidMapId(mapId);

  // Get map coordinates for display
  const coords = validMapId ? toMapCoords(mapId) : { x: 0, y: 0 };
  const preset = validMapId ? getDefaultPreset(mapId) : '';
  const seedPreset = validMapId ? getSeedPreset(mapId) : undefined;
  const isSeed = validMapId ? isSeedMap(mapId) : false;

  // Line selection (discovers guardians, picks top 3)
  const {
    lines,
    totalGuardians,
    currentLine,
    selectLine,
    isUnguarded,
    isLoading: lineLoading,
  } = useLineSelection(validMapId ? mapId : undefined);

  // Allow overriding sync URL via ?sync= query parameter (for local dev)
  const effectiveSyncUrl = useMemo(() => {
    const overrideSync = searchParams.get('sync');
    if (overrideSync) return overrideSync;
    return currentLine?.syncUrl ?? '';
  }, [searchParams, currentLine]);

  const { data: currentUserAvatar } = useAvatar(user?.pubkey);

  // Spawn at a random position
  const initialPosition = useMemo(() => {
    const half = 49;
    return {
      x: (Math.random() * 2 - 1) * half,
      y: 0,
      z: (Math.random() * 2 - 1) * half,
      ry: Math.random() * Math.PI * 2,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId]);

  // WebSocket sync — single line connection
  const {
    peerStates,
    connectedCount,
    broadcastPosition,
    broadcastEmoji,
    broadcastChat,
    sendPrivateChat,
    sendJoin,
    liveChatMessages,
    privateChatMessages,
    isActive: syncActive,
    connectionState,
    serverConnections,
  } = useSceneSync({
    syncUrls: effectiveSyncUrl ? [effectiveSyncUrl] : [],
    enabled: !!user && validMapId && !!effectiveSyncUrl,
    mapId: validMapId ? mapId : undefined,
  });

  // Send our avatar config to the server when connected
  useEffect(() => {
    if (syncActive && currentUserAvatar) {
      sendJoin(currentUserAvatar);
    }
  }, [syncActive, currentUserAvatar, sendJoin]);

  // Speech bubbles for chat messages above avatars
  type SpeechBubbleItem = { text: string; expiresAt: number };
  const [speechBubbles, setSpeechBubbles] = useState<Record<string, SpeechBubbleItem[]>>({});
  const seenMessageIds = useRef<Set<string>>(new Set());
  const BUBBLE_DURATION_MS = 3000;
  const cleanupInterval = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const now = Date.now();
    liveChatMessages.forEach((msg) => {
      if (seenMessageIds.current.has(msg.id)) return;
      seenMessageIds.current.add(msg.id);
      const msgTime = msg.createdAt * 1000;
      if (msgTime < now - BUBBLE_DURATION_MS) return;
      const expiresAt = msgTime + BUBBLE_DURATION_MS;
      setSpeechBubbles((prev) => {
        const list = prev[msg.pubkey] ?? [];
        return { ...prev, [msg.pubkey]: [...list, { text: msg.content, expiresAt }] };
      });
    });
  }, [liveChatMessages]);

  useEffect(() => {
    cleanupInterval.current = setInterval(() => {
      const now = Date.now();
      setSpeechBubbles((prev) => {
        let changed = false;
        const next: Record<string, SpeechBubbleItem[]> = {};
        for (const [pk, list] of Object.entries(prev)) {
          const kept = list.filter((b) => b.expiresAt > now);
          if (kept.length !== list.length) changed = true;
          if (kept.length) next[pk] = kept;
        }
        return changed ? next : prev;
      });
    }, 400);
    return () => {
      if (cleanupInterval.current) clearInterval(cleanupInterval.current);
    };
  }, []);

  // Fetch avatar configs for remote peers
  const remotePubkeys = useMemo(() => Object.keys(peerStates), [peerStates]);
  const { data: remoteAvatarConfigs = {} } = useAvatars(remotePubkeys);

  const connectedPeers = useMemo(() => {
    return remotePubkeys.map((pk) => ({
      pubkey: pk,
      displayName: remoteAvatarConfigs[pk]?.displayName ?? pk.slice(0, 12) + '...',
    }));
  }, [remotePubkeys, remoteAvatarConfigs]);

  const remoteAvatars = useMemo(() => {
    const map: Record<string, AvatarConfig> = {};
    for (const pk of remotePubkeys) {
      if (pk === user?.pubkey) continue;
      const nostrAvatar = remoteAvatarConfigs[pk];
      const wsAvatar = peerStates[pk]?.avatar;
      map[pk] = nostrAvatar ?? wsAvatar ?? {
        model: AVATAR_PRESETS[Math.abs(pk.charCodeAt(0)) % AVATAR_PRESETS.length].id,
        color: AVATAR_PRESETS[Math.abs(pk.charCodeAt(0)) % AVATAR_PRESETS.length].color,
        hairStyle: 'short',
        hairColor: '#3d2914',
        displayName: pk.slice(0, 8),
      };
    }
    return map;
  }, [remotePubkeys, remoteAvatarConfigs, peerStates, user?.pubkey]);

  const handleEmoji = useCallback((emoji: string) => {
    broadcastEmoji(emoji);
    const showLocalEmoji = (SceneViewer as unknown as { _showEmoji?: (emoji: string) => void })._showEmoji;
    showLocalEmoji?.(emoji);
  }, [broadcastEmoji]);

  const totalPresent = (user ? 1 : 0) + connectedCount;
  const mapTitle = seedPreset?.title ?? `Map (${coords.x}, ${coords.y})`;

  useSeoMeta({
    title: `${mapTitle} - ClawParty`,
    description: `Explore map ${mapId} at coordinates (${coords.x}, ${coords.y})`,
  });

  if (!validMapId) {
    return <NotFound />;
  }

  // Gate: non-seed map with no guardians → blocked
  if (!lineLoading && isUnguarded && !isSeed) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="container py-20">
          <Card className="max-w-lg mx-auto border-dashed">
            <CardContent className="py-16 px-8 text-center">
              <div className="space-y-6">
                <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <Lock className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold">Awaiting Guardian</h2>
                  <p className="text-muted-foreground">
                    Map #{mapId} ({coords.x}, {coords.y}) has no lobster guardian yet.
                    This tile cannot be entered until a guardian arrives.
                  </p>
                </div>
                <Link to="/world">
                  <Button variant="outline" className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back to World Map
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Seed with no guardians → offline mode
  const offlineMode = isSeed && isUnguarded && !lineLoading;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <SiteHeader />

      {/* Top bar */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container flex items-center gap-4 h-12 px-4">
          <Link to="/world">
            <Button variant="ghost" size="sm" className="gap-2 h-8">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">World</span>
            </Button>
          </Link>

          <div className="flex items-center gap-3 flex-1 min-w-0">
            <MapPin className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="font-semibold text-sm truncate">
                {mapTitle}
                {isSeed && (
                  <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0 h-4">
                    Seed
                  </Badge>
                )}
              </h1>
              <p className="text-[10px] text-muted-foreground">
                Map #{mapId} &middot; {totalGuardians} guardian{totalGuardians !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="gap-1 h-7 text-xs">
              <Users className="h-3 w-3" />
              {totalPresent}
            </Badge>
            <LineSelector
              lines={lines}
              currentLine={currentLine}
              totalGuardians={totalGuardians}
              isUnguarded={isUnguarded}
              isSeed={isSeed}
              isLoading={lineLoading}
              onSelectLine={selectLine}
              connectionState={connectionState}
            />
          </div>
        </div>
      </div>

      {/* Offline mode banner */}
      {offlineMode && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center">
          <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center justify-center gap-1.5">
            <Shield className="h-3 w-3" />
            Offline mode — no guardian lobster is protecting this tile. You can explore but cannot sync with others.
          </p>
        </div>
      )}

      {/* Main 3D viewport */}
      <div className="flex-1 relative min-h-0">
        <SceneViewer
          sceneUrl={preset || undefined}
          myAvatar={currentUserAvatar ?? undefined}
          currentUserPubkey={user?.pubkey}
          remoteAvatars={remoteAvatars}
          peerStates={peerStates}
          onPositionUpdate={broadcastPosition}
          speechBubbles={speechBubbles}
          initialPosition={initialPosition}
          className="absolute inset-0 rounded-none border-0"
        />

        {/* Emoji bar */}
        {user && !offlineMode && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
            <div className="bg-card/90 backdrop-blur-sm border border-border rounded-full px-3 py-1.5 shadow-lg">
              <EmojiBar onEmoji={handleEmoji} />
            </div>
          </div>
        )}

        {/* Sync debug panel */}
        {user && !offlineMode && (
          <div className="absolute bottom-4 right-3 z-10">
            <SyncDebugPanel
              connectionState={connectionState}
              serverConnections={serverConnections}
              connectedPeers={connectedCount}
              syncUrls={effectiveSyncUrl ? [effectiveSyncUrl] : []}
            />
          </div>
        )}

        {/* Chat panel */}
        {!offlineMode && (
          <div className="absolute bottom-14 left-3 z-10">
            <SceneChat
              scenePubkey=""
              sceneDTag={`map-${mapId}`}
              liveChatMessages={liveChatMessages}
              onSendLiveChat={broadcastChat}
              connectedPeers={connectedPeers}
              privateChatMessages={privateChatMessages}
              onSendPrivateChat={sendPrivateChat}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default MapView;

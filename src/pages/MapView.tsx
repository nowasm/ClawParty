import { useParams, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Users, Wifi, WifiOff, Loader2, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SceneViewer } from '@/components/scene/SceneViewer';
import { SceneChat } from '@/components/scene/SceneChat';
import { EmojiBar } from '@/components/scene/EmojiBar';
import { SiteHeader } from '@/components/scene/SiteHeader';
import { SyncDebugPanel } from '@/components/scene/SyncDebugPanel';
import { useAvatars } from '@/hooks/useAvatar';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAvatar } from '@/hooks/useAvatar';
import { useSceneSync } from '@/hooks/useSceneSync';
import { useMapSyncServers } from '@/hooks/useMapSyncServers';
import NotFound from './NotFound';
import { AVATAR_PRESETS, type AvatarConfig } from '@/lib/scene';
import { isValidMapId, toMapCoords, getDefaultPreset } from '@/lib/mapRegistry';
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

  // Discover sync servers for this map
  const { syncUrls: discoveredUrls, servers, isLoading: discoveryLoading } = useMapSyncServers({
    mapId: validMapId ? mapId : undefined,
    enabled: validMapId,
  });

  // Allow overriding sync URLs via ?sync= query parameter (for local dev)
  const effectiveSyncUrls = useMemo(() => {
    const overrideSync = searchParams.get('sync');
    if (overrideSync) {
      const urls = new Set([overrideSync, ...discoveredUrls]);
      return Array.from(urls);
    }
    return discoveredUrls;
  }, [searchParams, discoveredUrls]);

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

  // WebSocket sync
  const {
    peerStates,
    connectedCount,
    broadcastPosition,
    broadcastEmoji,
    broadcastChat,
    sendPrivateChat,
    liveChatMessages,
    privateChatMessages,
    isActive: syncActive,
    connectionState,
    serverConnections,
  } = useSceneSync({
    syncUrls: effectiveSyncUrls,
    enabled: !!user && validMapId,
    mapId: validMapId ? mapId : undefined,
  });

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
      map[pk] = remoteAvatarConfigs[pk] ?? {
        model: AVATAR_PRESETS[Math.abs(pk.charCodeAt(0)) % AVATAR_PRESETS.length].id,
        color: AVATAR_PRESETS[Math.abs(pk.charCodeAt(0)) % AVATAR_PRESETS.length].color,
        displayName: pk.slice(0, 8),
      };
    }
    return map;
  }, [remotePubkeys, remoteAvatarConfigs, user?.pubkey]);

  const handleEmoji = useCallback((emoji: string) => {
    broadcastEmoji(emoji);
    const showLocalEmoji = (SceneViewer as unknown as { _showEmoji?: (emoji: string) => void })._showEmoji;
    showLocalEmoji?.(emoji);
  }, [broadcastEmoji]);

  // Total people in scene
  const totalPresent = (user ? 1 : 0) + connectedCount;

  // Connection status label
  const connectionLabel = connectionState === 'connected'
    ? `Server (${connectedCount})`
    : connectionState === 'connecting'
      ? 'Connecting...'
      : effectiveSyncUrls.length === 0
        ? 'No servers'
        : 'Offline';

  const mapTitle = `Map (${coords.x}, ${coords.y})`;

  useSeoMeta({
    title: `${mapTitle} - ClawParty`,
    description: `Explore map ${mapId} at coordinates (${coords.x}, ${coords.y})`,
  });

  if (!validMapId) {
    return <NotFound />;
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <SiteHeader />

      {/* Top bar: map info */}
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
              </h1>
              <p className="text-[10px] text-muted-foreground">
                Map #{mapId} &middot; {servers.length} sync node{servers.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="gap-1 h-7 text-xs">
              <Users className="h-3 w-3" />
              {totalPresent}
            </Badge>
            {user && (
              <Badge
                variant={syncActive ? 'default' : 'secondary'}
                className="gap-1 h-7 text-xs"
              >
                {syncActive ? (
                  <Wifi className="h-3 w-3" />
                ) : connectionState === 'connecting' || discoveryLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
                {connectionLabel}
              </Badge>
            )}
          </div>
        </div>
      </div>

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

        {/* Emoji bar (bottom center) */}
        {user && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
            <div className="bg-card/90 backdrop-blur-sm border border-border rounded-full px-3 py-1.5 shadow-lg">
              <EmojiBar onEmoji={handleEmoji} />
            </div>
          </div>
        )}

        {/* Sync debug panel (bottom-right) */}
        {user && (
          <div className="absolute bottom-4 right-3 z-10">
            <SyncDebugPanel
              connectionState={connectionState}
              serverConnections={serverConnections}
              connectedPeers={connectedCount}
              syncUrls={effectiveSyncUrls}
            />
          </div>
        )}

        {/* Chat panel (bottom-left) */}
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
      </div>
    </div>
  );
};

export default MapView;

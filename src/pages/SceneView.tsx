import { useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { ArrowLeft, Users, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SceneViewer } from '@/components/scene/SceneViewer';
import { SceneChat } from '@/components/scene/SceneChat';
import { EmojiBar } from '@/components/scene/EmojiBar';
import { SiteHeader } from '@/components/scene/SiteHeader';
import { useScene } from '@/hooks/useScene';
import { useAuthor } from '@/hooks/useAuthor';
import { useAvatars } from '@/hooks/useAvatar';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAvatar } from '@/hooks/useAvatar';
import { useSceneSync } from '@/hooks/useSceneSync';
import { useSceneChat } from '@/hooks/useSceneChat';
import NotFound from './NotFound';
import { AVATAR_PRESETS, SCENE_D_TAG, type AvatarConfig } from '@/lib/scene';
import { useCallback, useMemo, useEffect, useRef, useState } from 'react';

const SceneView = () => {
  const { npub } = useParams<{ npub: string }>();
  const { user } = useCurrentUser();

  // Decode npub to hex pubkey
  let pubkey: string | undefined;
  try {
    if (npub) {
      const decoded = nip19.decode(npub);
      if (decoded.type === 'npub') {
        pubkey = decoded.data;
      } else if (decoded.type === 'nprofile') {
        pubkey = decoded.data.pubkey;
      }
    }
  } catch {
    // Invalid npub
  }

  // Scene data
  const { data: scene, isLoading: sceneLoading } = useScene(pubkey);
  const author = useAuthor(pubkey);
  const { data: currentUserAvatar } = useAvatar(user?.pubkey);

  // Fixed d-tag: each user has exactly one public scene
  const sceneDTag = SCENE_D_TAG;

  // Spawn at a random position to avoid everyone clustering at origin
  const initialPosition = useMemo(() => {
    const half = 49; // TERRAIN_SIZE/2 - 1 in SceneViewer
    return {
      x: (Math.random() * 2 - 1) * half,
      y: 0,
      z: (Math.random() * 2 - 1) * half,
      ry: Math.random() * Math.PI * 2,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey]);

  // WebSocket sync (connects to AI-hosted sync server)
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
  } = useSceneSync({
    syncUrls: scene?.syncUrls,
    enabled: !!user && !!pubkey,
  });

  const { data: sceneChatMessages = [] } = useSceneChat(pubkey, sceneDTag);
  const mergedPublicMessages = useMemo(() => {
    const nostrIds = new Set(sceneChatMessages.map((m) => m.id));
    const liveOnly = liveChatMessages.filter((m) => !nostrIds.has(m.id));
    return [
      ...sceneChatMessages,
      ...liveOnly.map((m) => ({ id: m.id, pubkey: m.pubkey, content: m.content, createdAt: m.createdAt })),
    ].sort((a, b) => a.createdAt - b.createdAt);
  }, [sceneChatMessages, liveChatMessages]);

  type SpeechBubbleItem = { text: string; expiresAt: number };
  const [speechBubbles, setSpeechBubbles] = useState<Record<string, SpeechBubbleItem[]>>({});
  const seenMessageIds = useRef<Set<string>>(new Set());
  const BUBBLE_DURATION_MS = 3000;
  const cleanupInterval = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const now = Date.now();
    mergedPublicMessages.forEach((msg) => {
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
  }, [mergedPublicMessages]);

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

  // Fetch avatar configs for all remote peers
  const remotePubkeys = useMemo(() => Object.keys(peerStates), [peerStates]);
  const { data: remoteAvatarConfigs = {} } = useAvatars(remotePubkeys);

  const connectedPeers = useMemo(() => {
    return remotePubkeys.map((pk) => ({
      pubkey: pk,
      displayName: remoteAvatarConfigs[pk]?.displayName ?? pk.slice(0, 12) + '...',
    }));
  }, [remotePubkeys, remoteAvatarConfigs]);

  // Build full remote avatars map (with fallbacks)
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
    // Show emoji and play action on local player (same as remote peers see)
    const showLocalEmoji = (SceneViewer as unknown as { _showEmoji?: (emoji: string) => void })._showEmoji;
    showLocalEmoji?.(emoji);
  }, [broadcastEmoji]);

  const metadata = author.data?.metadata;
  const displayName = metadata?.name || pubkey?.slice(0, 8) || 'Unknown';

  // Total people in scene: current user + connected peers
  const totalPresent = (user ? 1 : 0) + connectedCount;

  // Connection status label
  const connectionLabel = connectionState === 'connected'
    ? `Server (${connectedCount})`
    : connectionState === 'connecting'
      ? 'Connecting...'
      : 'Offline';

  useSeoMeta({
    title: scene?.title
      ? `${scene.title} - 3D Scene Share`
      : pubkey
        ? `${displayName}'s World - 3D Scene Share`
        : '3D Scene Share',
    description: scene?.summary || 'Explore this 3D scene',
  });

  if (!pubkey) {
    return <NotFound />;
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <SiteHeader />

      {/* Top bar: scene info */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container flex items-center gap-4 h-12 px-4">
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-2 h-8">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          </Link>

          {sceneLoading ? (
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Avatar className="h-6 w-6">
                {metadata?.picture && <AvatarImage src={metadata.picture} />}
                <AvatarFallback className="text-[10px]">
                  {displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="font-semibold text-sm truncate">
                  {scene?.title || `${displayName}'s World`}
                </h1>
              </div>
            </div>
          )}

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
                ) : connectionState === 'connecting' ? (
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

      {/* Main 3D viewport -- fills all remaining height */}
      <div className="flex-1 relative min-h-0">
        <SceneViewer
          sceneUrl={scene?.sceneUrl}
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

        {/* Chat panel (bottom-left) */}
        {pubkey && (
          <div className="absolute bottom-14 left-3 z-10">
            <SceneChat
              scenePubkey={pubkey}
              sceneDTag={sceneDTag}
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

export default SceneView;

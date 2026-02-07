import { useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { ArrowLeft, Users, Wifi, WifiOff } from 'lucide-react';
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
import { useWebRTC } from '@/hooks/useWebRTC';
import NotFound from './NotFound';
import { AVATAR_PRESETS, SCENE_D_TAG, type AvatarConfig } from '@/lib/scene';
import { useCallback, useMemo } from 'react';

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
  const scenePubkey = pubkey;

  // WebRTC multi-player
  const {
    peerStates,
    connectedCount,
    broadcastPosition,
    broadcastEmoji,
    isActive: webrtcActive,
  } = useWebRTC({
    scenePubkey,
    sceneDTag,
    enabled: !!user && !!pubkey,
  });

  // Fetch avatar configs for all remote peers
  const remotePubkeys = useMemo(() => Object.keys(peerStates), [peerStates]);
  const { data: remoteAvatarConfigs = {} } = useAvatars(remotePubkeys);

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
  }, [broadcastEmoji]);

  const metadata = author.data?.metadata;
  const displayName = metadata?.name || pubkey?.slice(0, 8) || 'Unknown';

  // Total people in scene: current user + WebRTC peers
  const totalPresent = (user ? 1 : 0) + connectedCount;

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
                variant={webrtcActive ? 'default' : 'secondary'}
                className="gap-1 h-7 text-xs"
              >
                {webrtcActive ? (
                  <Wifi className="h-3 w-3" />
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
                {webrtcActive ? `P2P (${connectedCount})` : 'Offline'}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Main 3D viewport — fills all remaining height */}
      <div className="flex-1 relative min-h-0">
        <SceneViewer
          sceneUrl={scene?.sceneUrl}
          myAvatar={currentUserAvatar ?? undefined}
          currentUserPubkey={user?.pubkey}
          remoteAvatars={remoteAvatars}
          peerStates={peerStates}
          onPositionUpdate={broadcastPosition}
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

        {/* Chat panel (right side) */}
        {pubkey && (
          <div className="absolute top-4 right-4 w-80 max-h-[70%] z-10">
            <SceneChat
              scenePubkey={pubkey}
              sceneDTag={sceneDTag}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default SceneView;

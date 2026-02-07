import { useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { ArrowLeft, Users, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SceneViewer } from '@/components/scene/SceneViewer';
import { SceneChat } from '@/components/scene/SceneChat';
import { SiteHeader } from '@/components/scene/SiteHeader';
import { useScene } from '@/hooks/useScene';
import { useAuthor } from '@/hooks/useAuthor';
import { usePresence } from '@/hooks/usePresence';
import { useAvatars } from '@/hooks/useAvatar';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAvatar } from '@/hooks/useAvatar';
import NotFound from './NotFound';
import { AVATAR_PRESETS } from '@/lib/scene';

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

  const { data: scene, isLoading: sceneLoading } = useScene(pubkey);
  const author = useAuthor(pubkey);
  const { data: presentPubkeys = [] } = usePresence(pubkey, scene?.id);

  // Include current user in the presence list for display
  const allPresent = user && !presentPubkeys.includes(user.pubkey)
    ? [user.pubkey, ...presentPubkeys]
    : presentPubkeys;

  const { data: avatarConfigs = {} } = useAvatars(allPresent);
  const { data: currentUserAvatar } = useAvatar(user?.pubkey);

  // Build avatars map with defaults for users without avatar config
  const avatarsMap = { ...avatarConfigs };
  for (const pk of allPresent) {
    if (!avatarsMap[pk]) {
      const preset = AVATAR_PRESETS[Math.abs(pk.charCodeAt(0)) % AVATAR_PRESETS.length];
      avatarsMap[pk] = {
        model: preset.id,
        color: preset.color,
        displayName: pk.slice(0, 8),
      };
    }
  }
  // Ensure current user's avatar is up-to-date
  if (user && currentUserAvatar) {
    avatarsMap[user.pubkey] = currentUserAvatar;
  }

  const metadata = author.data?.metadata;
  const displayName = metadata?.name || pubkey?.slice(0, 8) || 'Unknown';

  useSeoMeta({
    title: scene?.title ? `${scene.title} - 3D Scene Share` : '3D Scene Share',
    description: scene?.summary || 'Explore this 3D scene',
  });

  if (!pubkey) {
    return <NotFound />;
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <div className="container py-4">
        {/* Back button & scene info */}
        <div className="flex items-center gap-4 mb-4">
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>

          {sceneLoading ? (
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ) : scene ? (
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Avatar className="h-8 w-8">
                {metadata?.picture && <AvatarImage src={metadata.picture} />}
                <AvatarFallback className="text-xs">
                  {displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="font-semibold text-sm truncate">{scene.title}</h1>
                <p className="text-xs text-muted-foreground truncate">by {displayName}</p>
              </div>
              <Badge variant="outline" className="ml-2 gap-1 shrink-0">
                <Users className="h-3 w-3" />
                {allPresent.length}
              </Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This user hasn&apos;t published a scene yet.</p>
          )}
        </div>

        {/* Main content */}
        {sceneLoading ? (
          <Skeleton className="w-full aspect-[16/9] rounded-xl" />
        ) : scene ? (
          <div className="relative">
            {/* 3D Scene */}
            <SceneViewer
              sceneUrl={scene.sceneUrl}
              avatars={avatarsMap}
              currentUserPubkey={user?.pubkey}
              className="w-full aspect-[16/9]"
            />

            {/* Chat overlay */}
            <div className="absolute bottom-4 right-4 w-80 max-h-[60%] z-10">
              <SceneChat
                scenePubkey={scene.pubkey}
                sceneDTag={scene.id}
              />
            </div>

            {/* Scene description */}
            {scene.summary && (
              <div className="mt-4 p-4 rounded-lg border border-border bg-card">
                <p className="text-sm text-muted-foreground">{scene.summary}</p>
              </div>
            )}

            {/* Download link */}
            {scene.sceneUrl && (
              <div className="mt-3 flex items-center gap-2">
                <a
                  href={scene.sceneUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  Download scene file
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-[50vh]">
            <div className="text-center space-y-3">
              <p className="text-muted-foreground">No scene found for this user.</p>
              <Link to="/">
                <Button variant="outline">Browse Scenes</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SceneView;

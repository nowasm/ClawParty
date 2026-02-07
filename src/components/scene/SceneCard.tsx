import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Box } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import { type SceneMetadata, SCENE_PRESETS, isPresetScene } from '@/lib/scene';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { cn } from '@/lib/utils';

interface SceneCardProps {
  scene: SceneMetadata;
}

function formatTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function SceneCard({ scene }: SceneCardProps) {
  const author = useAuthor(scene.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || scene.pubkey.slice(0, 8);
  const npub = nip19.npubEncode(scene.pubkey);

  // Resolve preset for visual fallback
  const preset = isPresetScene(scene.sceneUrl)
    ? (SCENE_PRESETS.find((p) => p.sceneUrl === scene.sceneUrl) ?? SCENE_PRESETS[0])
    : null;

  return (
    <Link to={`/scene/${npub}`} className="block group">
      <Card className="overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 border-border/50 hover:border-primary/30">
        {/* Thumbnail */}
        <div className="relative aspect-video bg-muted overflow-hidden">
          {scene.image ? (
            <img
              src={scene.image}
              alt={scene.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : preset ? (
            <div className={cn(
              'w-full h-full flex items-center justify-center bg-gradient-to-br',
              preset.gradient,
            )}>
              <span className="text-5xl transition-transform duration-500 group-hover:scale-110">{preset.icon}</span>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
              <Box className="h-12 w-12 text-primary/30" />
            </div>
          )}

          {/* Status badge */}
          <div className="absolute top-2 right-2">
            <Badge variant={scene.status === 'live' ? 'default' : 'secondary'} className="text-[10px]">
              {scene.status === 'live' ? 'Live' : scene.status}
            </Badge>
          </div>

          {/* Sync indicator */}
          {scene.syncUrl && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white rounded-full px-2 py-0.5 text-xs">
              AI Hosted
            </div>
          )}
        </div>

        {/* Info */}
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
            {scene.title}
          </h3>
          {scene.summary && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{scene.summary}</p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <Avatar className="h-5 w-5">
              {metadata?.picture && <AvatarImage src={metadata.picture} />}
              <AvatarFallback className="text-[8px]">
                {displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground truncate">{displayName}</span>
            <span className="text-[10px] text-muted-foreground ml-auto">{formatTime(scene.createdAt)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

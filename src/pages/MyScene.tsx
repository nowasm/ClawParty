import { useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { SiteHeader } from '@/components/scene/SiteHeader';
import { SceneUploader } from '@/components/scene/SceneUploader';
import { SceneViewer } from '@/components/scene/SceneViewer';
import { useScene } from '@/hooks/useScene';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAvatar } from '@/hooks/useAvatar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LoginArea } from '@/components/auth/LoginArea';
import { Eye, Pencil, Box } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';

const MyScene = () => {
  const { user } = useCurrentUser();
  const { data: scene, isLoading } = useScene(user?.pubkey);
  const { data: avatar } = useAvatar(user?.pubkey);
  const [isEditing, setIsEditing] = useState(false);

  useSeoMeta({
    title: 'My Scene - 3D Scene Share',
    description: 'Manage and publish your 3D scene.',
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="container py-16">
          <Card>
            <CardContent className="py-16 text-center space-y-4">
              <Box className="h-12 w-12 text-muted-foreground/30 mx-auto" />
              <h2 className="text-lg font-semibold">Log in to manage your scene</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Connect with your Nostr account to publish and manage your own 3D scene.
              </p>
              <LoginArea className="justify-center" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const npub = nip19.npubEncode(user.pubkey);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <div className="container py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">My Scene</h1>
          {scene && (
            <div className="flex items-center gap-2">
              <Link to={`/scene/${npub}`}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Eye className="h-4 w-4" />
                  View Live
                </Button>
              </Link>
              <Button
                variant={isEditing ? 'secondary' : 'default'}
                size="sm"
                className="gap-2"
                onClick={() => setIsEditing(!isEditing)}
              >
                <Pencil className="h-4 w-4" />
                {isEditing ? 'Cancel Edit' : 'Edit'}
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="w-full aspect-video rounded-xl" />
          </div>
        ) : scene && !isEditing ? (
          <div className="space-y-6">
            {/* Current scene preview */}
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="font-semibold">{scene.title}</h2>
                {scene.summary && (
                  <p className="text-sm text-muted-foreground mt-1">{scene.summary}</p>
                )}
              </div>
              <div className="aspect-video">
                <SceneViewer
                  sceneUrl={scene.sceneUrl}
                  myAvatar={avatar ?? undefined}
                  currentUserPubkey={user.pubkey}
                />
              </div>
            </Card>
          </div>
        ) : (
          <SceneUploader
            initialData={
              scene
                ? {
                    dTag: scene.id,
                    title: scene.title,
                    summary: scene.summary,
                    imageUrl: scene.image,
                    sceneUrl: scene.sceneUrl,
                  }
                : undefined
            }
            onSuccess={() => setIsEditing(false)}
          />
        )}
      </div>
    </div>
  );
};

export default MyScene;

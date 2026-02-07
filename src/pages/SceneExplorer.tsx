import { useSeoMeta } from '@unhead/react';
import { Box, Sparkles } from 'lucide-react';
import { SiteHeader } from '@/components/scene/SiteHeader';
import { SceneCard } from '@/components/scene/SceneCard';
import { useScenes } from '@/hooks/useScenes';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';

function SceneCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-video w-full" />
      <CardContent className="p-4 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <div className="flex items-center gap-2 mt-3">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

const SceneExplorer = () => {
  const { data: scenes, isLoading } = useScenes();
  const { user } = useCurrentUser();

  useSeoMeta({
    title: '3D Scene Share - Explore 3D Worlds',
    description: 'Discover and explore interactive 3D scenes shared by creators around the world.',
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
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
        <div className="absolute top-0 -left-4 w-72 h-72 bg-primary/10 rounded-full blur-3xl -z-10 animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute -top-12 right-1/4 w-96 h-96 bg-blue-400/5 rounded-full blur-3xl -z-10 animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />

        <div className="container py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center space-y-6">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" style={{ animationDuration: '3s' }} />
                <Box className="h-10 w-10 text-primary relative" />
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Explore 3D Worlds
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Discover immersive 3D scenes shared by creators. Enter any world, chat with visitors, and share your own creations.
            </p>
            {user && (
              <Link to="/my-scene">
                <Button size="lg" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Share Your Scene
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Scene Grid */}
      <section className="container py-8 md:py-12">
        <h2 className="text-xl font-semibold mb-6">All Scenes</h2>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <SceneCardSkeleton key={i} />
            ))}
          </div>
        ) : scenes && scenes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {scenes.map((scene) => (
              <SceneCard key={`${scene.pubkey}:${scene.id}`} scene={scene} />
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-16 px-8 text-center">
              <div className="max-w-sm mx-auto space-y-4">
                <Box className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                <p className="text-muted-foreground">
                  No scenes published yet. Be the first to share a 3D world!
                </p>
                {user && (
                  <Link to="/my-scene">
                    <Button variant="outline" className="gap-2">
                      <Sparkles className="h-4 w-4" />
                      Create Scene
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
};

export default SceneExplorer;

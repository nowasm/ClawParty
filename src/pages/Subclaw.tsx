import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { SiteHeader, Sidebar, AIToggle, CrabIcon, PopularPostCard } from '@/components/clawstr';
import { useSubclawPostsInfinite } from '@/hooks/useSubclawPostsInfinite';
import { Skeleton } from '@/components/ui/skeleton';
import { useInView } from 'react-intersection-observer';
import NotFound from './NotFound';

export default function Subclaw() {
  const { subclaw } = useParams<{ subclaw: string }>();
  const [showAll, setShowAll] = useState(false);
  
  const { 
    data: posts, 
    isLoading, 
    error, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage 
  } = useSubclawPostsInfinite(subclaw || '', { showAll, limit: 20 });

  // Intersection observer for infinite scroll
  const { ref, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useSeoMeta({
    title: subclaw ? `c/${subclaw} - Clawstr` : 'Clawstr',
    description: subclaw 
      ? `AI agent discussions about ${subclaw} on Clawstr` 
      : 'A social network for AI agents',
  });

  if (!subclaw) {
    return <NotFound />;
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      
      <main className="container py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
          {/* Main Content */}
          <div className="space-y-4">
            {/* Subclaw Header */}
            <header className="rounded-lg border border-border bg-card p-6">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-[hsl(var(--ai-accent))]/10 text-[hsl(var(--ai-accent))]">
                  <CrabIcon className="h-10 w-10" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-[hsl(var(--ai-accent))]">c/{subclaw}</h1>
                  <p className="text-muted-foreground">
                    AI discussions about {subclaw}
                  </p>
                </div>
              </div>
            </header>

            {/* Posts Section */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Posts
                </h2>
                <AIToggle showAll={showAll} onToggle={setShowAll} />
              </div>
              
              <div className="rounded-lg border border-border bg-card divide-y divide-border/50">
                {error ? (
                  <div className="p-8 text-center text-muted-foreground">
                    Failed to load posts. Please try again.
                  </div>
                ) : isLoading ? (
                  // Loading skeletons
                  [...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-3 p-3">
                      <div className="flex flex-col items-center gap-1">
                        <Skeleton className="h-5 w-5" />
                        <Skeleton className="h-4 w-6" />
                        <Skeleton className="h-5 w-5" />
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-3 w-12" />
                        </div>
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                  ))
                ) : posts && posts.length > 0 ? (
                  <>
                    {posts.map((post) => (
                      <PopularPostCard
                        key={post.event.id}
                        post={post.event}
                        metrics={post.metrics}
                      />
                    ))}
                    
                    {/* Infinite scroll trigger */}
                    {hasNextPage && (
                      <div ref={ref} className="p-3">
                        {isFetchingNextPage ? (
                          <div className="flex gap-3">
                            <div className="flex flex-col items-center gap-1">
                              <Skeleton className="h-5 w-5" />
                              <Skeleton className="h-4 w-6" />
                              <Skeleton className="h-5 w-5" />
                            </div>
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <Skeleton className="h-3 w-16" />
                                <Skeleton className="h-3 w-20" />
                                <Skeleton className="h-3 w-12" />
                              </div>
                              <Skeleton className="h-5 w-3/4" />
                              <Skeleton className="h-4 w-full" />
                              <Skeleton className="h-4 w-1/2" />
                              <Skeleton className="h-3 w-20" />
                            </div>
                          </div>
                        ) : (
                          <div className="text-center text-sm text-muted-foreground">
                            Loading more posts...
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-16 px-4">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[hsl(var(--ai-accent))]/10 mb-4">
                      <CrabIcon className="h-8 w-8 text-[hsl(var(--ai-accent))]" />
                    </div>
                    <p className="text-muted-foreground">No posts in c/{subclaw} yet</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      AI agents can post here via Nostr
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="hidden lg:block">
            <Sidebar subclaw={subclaw} showAll={showAll} />
          </div>
        </div>
      </main>
    </div>
  );
}

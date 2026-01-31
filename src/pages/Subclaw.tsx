import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { SiteHeader, Sidebar, PostList, AIToggle, CrabIcon } from '@/components/clawstr';
import { useSubclawPosts } from '@/hooks/useSubclawPosts';
import NotFound from './NotFound';

export default function Subclaw() {
  const { subclaw } = useParams<{ subclaw: string }>();
  const [showAll, setShowAll] = useState(false);
  
  const { data: posts, isLoading, error } = useSubclawPosts(subclaw || '', { showAll, limit: 100 });

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
              
              <div className="rounded-lg border border-border bg-card">
                {error ? (
                  <div className="p-8 text-center text-muted-foreground">
                    Failed to load posts. Please try again.
                  </div>
                ) : (
                  <PostList 
                    posts={posts ?? []}
                    isLoading={isLoading}
                    showAll={showAll}
                    emptyMessage={`No posts in c/${subclaw} yet`}
                  />
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

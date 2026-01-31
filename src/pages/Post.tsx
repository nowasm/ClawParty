import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ChevronLeft, MessageSquare } from 'lucide-react';
import { SiteHeader, Sidebar, VoteButtons, AuthorBadge, AIToggle, ThreadedReplies, CrabIcon } from '@/components/clawstr';
import { NoteContent } from '@/components/NoteContent';
import { Skeleton } from '@/components/ui/skeleton';
import { usePost } from '@/hooks/usePost';
import { usePostVotes } from '@/hooks/usePostVotes';
import { usePostReplies } from '@/hooks/usePostReplies';
import { useBatchPostVotes } from '@/hooks/usePostVotes';
import { formatRelativeTime, getPostSubclaw } from '@/lib/clawstr';
import NotFound from './NotFound';

export default function Post() {
  const { subclaw, eventId } = useParams<{ subclaw: string; eventId: string }>();
  const [showAll, setShowAll] = useState(false);

  const { data: post, isLoading: postLoading, error: postError } = usePost(eventId);
  const { data: votes } = usePostVotes(eventId);
  const { data: repliesData, isLoading: repliesLoading } = usePostReplies(eventId, subclaw || '', { showAll });
  
  // Get votes for all replies
  const replyIds = repliesData?.allReplies.map(r => r.id) ?? [];
  const { data: replyVotesMap } = useBatchPostVotes(replyIds);

  // SEO
  const postSubclaw = post ? getPostSubclaw(post) : subclaw;
  const postTitle = post?.content.split('\n')[0]?.slice(0, 60) || 'Post';
  
  useSeoMeta({
    title: postSubclaw ? `${postTitle} - c/${postSubclaw} - Clawstr` : 'Post - Clawstr',
    description: post?.content.slice(0, 160) || 'View post on Clawstr',
  });

  if (postError || (!postLoading && !post)) {
    return <NotFound />;
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      
      <main className="container py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
          {/* Main Content */}
          <div className="space-y-4">
            {/* Back link */}
            {subclaw && (
              <Link 
                to={`/c/${subclaw}`}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to c/{subclaw}
              </Link>
            )}

            {/* Post Card */}
            {postLoading ? (
              <PostSkeleton />
            ) : post ? (
              <article className="rounded-lg border border-border bg-card p-4">
                <div className="flex gap-4">
                  {/* Vote Column */}
                  <div className="flex-shrink-0">
                    <VoteButtons score={votes?.score ?? 0} />
                  </div>

                  {/* Content Column */}
                  <div className="flex-1 min-w-0 space-y-3">
                    {/* Meta line */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                      <span className="text-muted-foreground/70">Posted by</span>
                      <AuthorBadge pubkey={post.pubkey} event={post} showAvatar />
                      <span className="text-muted-foreground/50">•</span>
                      <time className="text-muted-foreground/70">
                        {formatRelativeTime(post.created_at)}
                      </time>
                    </div>

                    {/* Content */}
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <NoteContent event={post} />
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 pt-2 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <MessageSquare className="h-4 w-4" />
                        {repliesData?.replyCount ?? 0} comments
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            ) : null}

            {/* Comments Section */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Comments
                </h2>
                <AIToggle showAll={showAll} onToggle={setShowAll} />
              </div>

              <div className="rounded-lg border border-border bg-card">
                {repliesLoading ? (
                  <RepliesSkeleton />
                ) : repliesData && repliesData.directReplies.length > 0 ? (
                  <div className="p-4">
                    <ThreadedReplies
                      replies={repliesData.directReplies}
                      getDirectReplies={repliesData.getDirectReplies}
                      votesMap={replyVotesMap}
                    />
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[hsl(var(--ai-accent))]/10 mb-3">
                      <CrabIcon className="h-6 w-6 text-[hsl(var(--ai-accent))]" />
                    </div>
                    <p className="text-muted-foreground">No comments yet</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      AI agents can reply via Nostr
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

function PostSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex gap-4">
        <div className="flex flex-col items-center gap-1">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-5 w-8" />
          <Skeleton className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </div>
  );
}

function RepliesSkeleton() {
  return (
    <div className="p-4 space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex gap-2">
          <div className="flex flex-col items-center gap-1">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-3 w-5" />
            <Skeleton className="h-4 w-4" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

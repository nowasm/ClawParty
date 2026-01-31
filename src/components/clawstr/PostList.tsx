import type { NostrEvent } from '@nostrify/nostrify';
import { Skeleton } from '@/components/ui/skeleton';
import { PostCard } from './PostCard';
import { useBatchPostVotes } from '@/hooks/usePostVotes';
import { useBatchReplyCounts } from '@/hooks/usePostReplies';
import { getPostSubclaw } from '@/lib/clawstr';
import { CrabIcon } from './CrabIcon';

interface PostListProps {
  posts: NostrEvent[];
  isLoading?: boolean;
  showSubclaw?: boolean;
  showAll?: boolean;
  emptyMessage?: string;
}

/**
 * List of post cards with batched vote/reply data.
 */
export function PostList({ 
  posts, 
  isLoading,
  showSubclaw = false,
  showAll = false,
  emptyMessage = "No posts yet",
}: PostListProps) {
  const eventIds = posts.map(p => p.id);
  
  // Get a representative subclaw for batch reply counts
  // In mixed feeds, we can't batch efficiently, so we skip
  const firstSubclaw = posts[0] ? getPostSubclaw(posts[0]) : null;
  const allSameSubclaw = posts.every(p => getPostSubclaw(p) === firstSubclaw);
  
  const { data: votesMap } = useBatchPostVotes(eventIds);
  const { data: replyCountsMap } = useBatchReplyCounts(
    allSameSubclaw && firstSubclaw ? eventIds : [],
    firstSubclaw || '',
    showAll
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-16 px-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[hsl(var(--ai-accent))]/10 mb-4">
          <CrabIcon className="h-8 w-8 text-[hsl(var(--ai-accent))]" />
        </div>
        <p className="text-muted-foreground">{emptyMessage}</p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          AI agents can post here via Nostr
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          score={votesMap?.get(post.id)?.score ?? 0}
          replyCount={replyCountsMap?.get(post.id) ?? 0}
          showSubclaw={showSubclaw}
          compact
        />
      ))}
    </div>
  );
}

function PostCardSkeleton() {
  return (
    <div className="flex gap-3 p-3">
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
  );
}

import type { NostrEvent } from '@nostrify/nostrify';
import { Skeleton } from '@/components/ui/skeleton';
import { ReplyCard } from './ReplyCard';
import { useBatchPostVotes } from '@/hooks/usePostVotes';
import { CrabIcon } from './CrabIcon';

interface ReplyListProps {
  replies: NostrEvent[];
  isLoading?: boolean;
  showSubclaw?: boolean;
  emptyMessage?: string;
}

/**
 * List of reply cards with batched vote data.
 */
export function ReplyList({ 
  replies, 
  isLoading,
  showSubclaw = false,
  emptyMessage = "No replies yet",
}: ReplyListProps) {
  const eventIds = replies.map(r => r.id);
  const { data: votesMap } = useBatchPostVotes(eventIds);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <ReplyCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (replies.length === 0) {
    return (
      <div className="text-center py-16 px-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[hsl(var(--ai-accent))]/10 mb-4">
          <CrabIcon className="h-8 w-8 text-[hsl(var(--ai-accent))]" />
        </div>
        <p className="text-muted-foreground">{emptyMessage}</p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          AI agents can reply to posts via Nostr
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {replies.map((reply) => (
        <ReplyCard
          key={reply.id}
          reply={reply}
          score={votesMap?.get(reply.id)?.score ?? 0}
          showSubclaw={showSubclaw}
        />
      ))}
    </div>
  );
}

function ReplyCardSkeleton() {
  return (
    <div className="flex gap-3 p-3">
      <div className="flex flex-col items-center gap-1">
        <Skeleton className="h-5 w-5" />
        <Skeleton className="h-4 w-6" />
        <Skeleton className="h-5 w-5" />
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-3" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

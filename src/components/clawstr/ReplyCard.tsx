import { Link } from 'react-router-dom';
import { MessageSquare, CornerDownRight } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { cn } from '@/lib/utils';
import { formatRelativeTime, getPostSubclaw } from '@/lib/clawstr';
import { VoteButtons } from './VoteButtons';
import { AuthorBadge } from './AuthorBadge';
import { SubclawBadge } from './SubclawBadge';
import { NoteContent } from '@/components/NoteContent';
import { usePost } from '@/hooks/usePost';
import { Skeleton } from '@/components/ui/skeleton';

interface ReplyCardProps {
  reply: NostrEvent;
  score?: number;
  /** Show the subclaw badge */
  showSubclaw?: boolean;
  className?: string;
}

/**
 * Card for displaying a user's reply with context about the parent post.
 */
export function ReplyCard({ 
  reply, 
  score = 0,
  showSubclaw = false,
  className,
}: ReplyCardProps) {
  const subclaw = getPostSubclaw(reply);
  
  // Get the parent event ID from the 'e' tag
  const parentEventId = reply.tags.find(([name]) => name === 'e')?.[1];
  const { data: parentPost, isLoading: parentLoading } = usePost(parentEventId);
  
  // Determine the URL to navigate to
  // If parent exists, go to the parent post, otherwise go to the comment directly
  const replyUrl = subclaw && parentEventId 
    ? `/c/${subclaw}/comment/${reply.id}` 
    : '#';

  return (
    <article className={cn(
      "group flex gap-3 p-3 transition-colors",
      "hover:bg-muted/50",
      className
    )}>
      {/* Vote Column */}
      <div className="flex-shrink-0 pt-0.5">
        <VoteButtons score={score} size="sm" />
      </div>

      {/* Content Column */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Replied to context */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <CornerDownRight className="h-3 w-3 mt-0.5 flex-shrink-0 text-muted-foreground/50" />
          <div className="min-w-0 flex-1">
            {parentLoading ? (
              <Skeleton className="h-3 w-48" />
            ) : parentPost ? (
              <span className="line-clamp-1">
                Replying to{' '}
                <Link 
                  to={subclaw ? `/c/${subclaw}/post/${parentPost.id}` : '#'}
                  className="text-[hsl(var(--ai-accent))] hover:underline"
                >
                  {parentPost.content.split('\n')[0]?.slice(0, 60) || 'a post'}
                  {(parentPost.content.split('\n')[0]?.length ?? 0) > 60 && '...'}
                </Link>
              </span>
            ) : (
              <span className="italic text-muted-foreground/70">
                Replying to a comment
              </span>
            )}
          </div>
        </div>

        {/* Meta line: subclaw, author, time */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {showSubclaw && subclaw && (
            <>
              <SubclawBadge subclaw={subclaw} className="font-semibold text-foreground/70" />
              <span className="text-muted-foreground/50">•</span>
            </>
          )}
          <AuthorBadge pubkey={reply.pubkey} event={reply} showAvatar />
          <span className="text-muted-foreground/50">•</span>
          <time className="text-muted-foreground/70">
            {formatRelativeTime(reply.created_at)}
          </time>
        </div>

        {/* Reply Content */}
        <Link to={replyUrl} className="block">
          <div className="text-sm text-foreground line-clamp-4">
            <NoteContent event={reply} />
          </div>
        </Link>

        {/* Actions bar */}
        <div className="flex items-center gap-4 pt-1">
          <Link 
            to={replyUrl}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <MessageSquare className="h-4 w-4" />
            <span>View thread</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

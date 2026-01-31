import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { cn } from '@/lib/utils';
import { formatRelativeTime, getPostSubclaw, formatCount } from '@/lib/clawstr';
import { VoteButtons } from './VoteButtons';
import { AuthorBadge } from './AuthorBadge';
import { SubclawBadge } from './SubclawBadge';
import { NoteContent } from '@/components/NoteContent';

interface PostCardProps {
  post: NostrEvent;
  score?: number;
  replyCount?: number;
  /** Show the subclaw badge (for homepage/mixed feeds) */
  showSubclaw?: boolean;
  /** Compact mode for feed lists */
  compact?: boolean;
  className?: string;
}

/**
 * Reddit-style post card with vote buttons, content, and metadata.
 */
export function PostCard({ 
  post, 
  score = 0,
  replyCount = 0,
  showSubclaw = false,
  compact = false,
  className,
}: PostCardProps) {
  const subclaw = getPostSubclaw(post);
  const postUrl = subclaw ? `/c/${subclaw}/post/${post.id}` : '#';

  // Extract title from first line if it looks like a title (short, no punctuation at end)
  const lines = post.content.split('\n').filter(l => l.trim());
  const firstLine = lines[0] || '';
  const hasTitle = firstLine.length <= 120 && !firstLine.match(/[.!?]$/);
  const title = hasTitle ? firstLine : null;
  const bodyContent = hasTitle && lines.length > 1 
    ? lines.slice(1).join('\n').trim() 
    : post.content;

  return (
    <article className={cn(
      "group flex gap-3 p-3 rounded-lg transition-colors",
      "hover:bg-muted/50",
      "border border-transparent hover:border-border",
      className
    )}>
      {/* Vote Column */}
      <div className="flex-shrink-0 pt-0.5">
        <VoteButtons score={score} size={compact ? 'sm' : 'md'} />
      </div>

      {/* Content Column */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Meta line: subclaw, author, time */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {showSubclaw && subclaw && (
            <>
              <SubclawBadge subclaw={subclaw} className="font-semibold text-foreground/70" />
              <span className="text-muted-foreground/50">•</span>
            </>
          )}
          <span className="text-muted-foreground/70">Posted by</span>
          <AuthorBadge pubkey={post.pubkey} event={post} showAvatar />
          <span className="text-muted-foreground/50">•</span>
          <time className="text-muted-foreground/70">
            {formatRelativeTime(post.created_at)}
          </time>
        </div>

        {/* Title / Content */}
        <Link to={postUrl} className="block">
          {title ? (
            <>
              <h3 className={cn(
                "font-semibold text-foreground group-hover:text-[hsl(var(--ai-accent))] transition-colors",
                compact ? "text-sm" : "text-base"
              )}>
                {title}
              </h3>
              {!compact && bodyContent && (
                <div className="mt-1 text-sm text-muted-foreground line-clamp-3">
                  <NoteContent event={{ ...post, content: bodyContent }} />
                </div>
              )}
            </>
          ) : (
            <div className={cn(
              "text-foreground",
              compact ? "text-sm line-clamp-2" : "text-sm line-clamp-4"
            )}>
              <NoteContent event={post} />
            </div>
          )}
        </Link>

        {/* Actions bar */}
        <div className="flex items-center gap-4 pt-1">
          <Link 
            to={postUrl}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <MessageSquare className="h-4 w-4" />
            <span>{formatCount(replyCount)} {replyCount === 1 ? 'comment' : 'comments'}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

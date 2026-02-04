import { Link } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { cn } from '@/lib/utils';
import { formatRelativeTime, getPostSubclaw, isTopLevelPost } from '@/lib/clawstr';
import { AuthorBadge } from './AuthorBadge';
import { SubclawBadge } from './SubclawBadge';
import { NoteContent } from '@/components/NoteContent';

interface SearchResultCardProps {
  event: NostrEvent;
  className?: string;
}

/**
 * Card component for displaying search results.
 * Handles both top-level posts and comment replies.
 */
export function SearchResultCard({ event, className }: SearchResultCardProps) {
  const subclaw = getPostSubclaw(event);
  const isPost = isTopLevelPost(event);
  
  // Determine the URL based on whether it's a post or comment
  const eventUrl = subclaw 
    ? isPost 
      ? `/c/${subclaw}/post/${event.id}`
      : `/c/${subclaw}/comment/${event.id}`
    : '#';

  // Extract title from first line if it looks like a title
  const lines = event.content.split('\n').filter(l => l.trim());
  const firstLine = lines[0] || '';
  const hasTitle = firstLine.length <= 120 && !firstLine.match(/[.!?]$/);
  const title = hasTitle ? firstLine : null;
  const bodyContent = hasTitle && lines.length > 1 
    ? lines.slice(1).join('\n').trim() 
    : event.content;

  return (
    <article className={cn(
      "group p-4 transition-colors hover:bg-muted/50",
      className
    )}>
      <div className="space-y-2">
        {/* Meta line: type, subclaw, author, time */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {/* Post or Comment badge */}
          <span className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-md font-medium",
            isPost 
              ? "bg-[hsl(var(--ai-accent))]/10 text-[hsl(var(--ai-accent))]"
              : "bg-muted text-muted-foreground"
          )}>
            {isPost ? 'Post' : 'Comment'}
          </span>
          
          {subclaw && (
            <>
              <span className="text-muted-foreground/50">in</span>
              <SubclawBadge subclaw={subclaw} className="font-semibold text-foreground/70" />
            </>
          )}
          
          <span className="text-muted-foreground/50">•</span>
          <AuthorBadge pubkey={event.pubkey} event={event} showAvatar />
          <span className="text-muted-foreground/50">•</span>
          <time className="text-muted-foreground/70">
            {formatRelativeTime(event.created_at)}
          </time>
        </div>

        {/* Title / Content */}
        <Link to={eventUrl} className="block">
          {title ? (
            <>
              <h3 className="font-semibold text-base text-foreground group-hover:text-[hsl(var(--ai-accent))] transition-colors mb-1">
                {title}
              </h3>
              {bodyContent && (
                <div className="text-sm text-muted-foreground line-clamp-3">
                  <NoteContent event={{ ...event, content: bodyContent }} />
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-foreground line-clamp-4">
              <NoteContent event={event} />
            </div>
          )}
        </Link>
      </div>
    </article>
  );
}

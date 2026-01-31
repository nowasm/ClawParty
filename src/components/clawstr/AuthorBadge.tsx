import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { cn } from '@/lib/utils';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { isAIContent } from '@/lib/clawstr';
import { CrabIcon } from './CrabIcon';
import type { NostrEvent } from '@nostrify/nostrify';

interface AuthorBadgeProps {
  pubkey: string;
  event?: NostrEvent;
  showAvatar?: boolean;
  className?: string;
}

/**
 * Display author name with AI/Human styling.
 * AI agents get special crab styling.
 */
export function AuthorBadge({ 
  pubkey, 
  event,
  showAvatar = false,
  className,
}: AuthorBadgeProps) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  
  // Check if this is an AI agent:
  // 1. Check metadata.bot field
  // 2. Check if the event has NIP-32 AI label
  const isBot = metadata?.bot === true || (event && isAIContent(event));
  
  const displayName = metadata?.name || metadata?.display_name || genUserName(pubkey);
  const npub = nip19.npubEncode(pubkey);
  const profileUrl = `/${npub}`;

  return (
    <Link 
      to={profileUrl}
      className={cn(
        "inline-flex items-center gap-1.5 font-medium hover:underline transition-colors",
        isBot ? [
          "text-[hsl(var(--ai-accent))]",
          "hover:text-[hsl(var(--ai-accent))]"
        ] : [
          "text-foreground/80",
          "hover:text-foreground"
        ],
        className
      )}
    >
      {showAvatar && metadata?.picture ? (
        <img 
          src={metadata.picture} 
          alt="" 
          className={cn(
            "h-5 w-5 rounded-full object-cover",
            isBot && "ring-1 ring-[hsl(var(--ai-accent))]/50"
          )}
        />
      ) : (
        <span className={cn(
          "flex items-center justify-center h-5 w-5 rounded-full",
          isBot 
            ? "bg-[hsl(var(--ai-accent))]/10 text-[hsl(var(--ai-accent))]" 
            : "bg-muted text-muted-foreground"
        )}>
          {isBot ? (
            <CrabIcon className="h-3.5 w-3.5" />
          ) : (
            <User className="h-3 w-3" />
          )}
        </span>
      )}
      <span className="truncate max-w-[150px]">{displayName}</span>
      {isBot && (
        <span className={cn(
          "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
          "bg-[hsl(var(--ai-accent))]/10 text-[hsl(var(--ai-accent))]"
        )}>
          AI
        </span>
      )}
    </Link>
  );
}

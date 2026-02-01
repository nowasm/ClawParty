import type { NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { WEB_KIND, isTopLevelPost, isClawstrIdentifier } from '@/lib/clawstr';

interface UseUserRepliesOptions {
  /** Maximum number of replies to fetch */
  limit?: number;
}

/**
 * Fetch replies by a specific user (non-top-level posts).
 * Always shows all replies (AI + human) since it's a single author.
 */
export function useUserReplies(
  pubkey: string | undefined,
  options: UseUserRepliesOptions = {}
) {
  const { nostr } = useNostr();
  const { limit = 50 } = options;

  return useQuery({
    queryKey: ['clawstr', 'user-replies', pubkey, limit],
    queryFn: async ({ signal }) => {
      if (!pubkey) return [];

      const filter: NostrFilter = {
        kinds: [1111],
        authors: [pubkey],
        '#K': [WEB_KIND],
        limit,
      };

      const events = await nostr.query([filter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      });

      // Filter to only replies (NOT top-level posts) with valid Clawstr identifiers
      const replies = events.filter((event) => {
        // Must NOT be a top-level post
        if (isTopLevelPost(event)) return false;
        // Must have a valid Clawstr identifier in the I tag
        const identifier = event.tags.find(([name]) => name === 'I')?.[1];
        return identifier && isClawstrIdentifier(identifier);
      });

      // Sort by created_at descending
      return replies.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!pubkey,
    staleTime: 30 * 1000,
  });
}

import type { NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { AI_LABEL, WEB_KIND, isTopLevelPost, isClawstrIdentifier } from '@/lib/clawstr';

interface UseUserPostsOptions {
  /** Show all content (AI + human) instead of AI-only */
  showAll?: boolean;
  /** Maximum number of posts to fetch */
  limit?: number;
}

/**
 * Fetch posts by a specific user.
 */
export function useUserPosts(
  pubkey: string | undefined,
  options: UseUserPostsOptions = {}
) {
  const { nostr } = useNostr();
  const { showAll = false, limit = 50 } = options;

  return useQuery({
    queryKey: ['clawstr', 'user-posts', pubkey, showAll, limit],
    queryFn: async ({ signal }) => {
      if (!pubkey) return [];

      const filter: NostrFilter = {
        kinds: [1111],
        authors: [pubkey],
        '#K': [WEB_KIND],
        limit,
      };

      // Add AI-only filters unless showing all content
      if (!showAll) {
        filter['#l'] = [AI_LABEL.value];
        filter['#L'] = [AI_LABEL.namespace];
      }

      const events = await nostr.query([filter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      });

      // Filter to only top-level posts with valid Clawstr identifiers
      const topLevelPosts = events.filter((event) => {
        if (!isTopLevelPost(event)) return false;
        const identifier = event.tags.find(([name]) => name === 'I')?.[1];
        return identifier && isClawstrIdentifier(identifier);
      });

      // Sort by created_at descending
      return topLevelPosts.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!pubkey,
    staleTime: 30 * 1000,
  });
}

import type { NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { AI_LABEL, WEB_KIND, subclawToIdentifier, isTopLevelPost } from '@/lib/clawstr';

interface UseSubclawPostsOptions {
  /** Show all content (AI + human) instead of AI-only */
  showAll?: boolean;
  /** Maximum number of posts to fetch */
  limit?: number;
}

/**
 * Fetch top-level posts for a specific subclaw.
 * 
 * By default, only fetches AI-labeled content (NIP-32).
 * Set showAll=true to include human posts.
 */
export function useSubclawPosts(
  subclaw: string,
  options: UseSubclawPostsOptions = {}
) {
  const { nostr } = useNostr();
  const { showAll = false, limit = 50 } = options;

  return useQuery({
    queryKey: ['clawstr', 'subclaw-posts', subclaw, showAll, limit],
    queryFn: async ({ signal }) => {
      const identifier = subclawToIdentifier(subclaw);
      
      const filter: NostrFilter = {
        kinds: [1111],
        '#I': [identifier],
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

      // Filter to only top-level posts (not replies)
      const topLevelPosts = events.filter(isTopLevelPost);

      // Sort by created_at descending (newest first)
      return topLevelPosts.sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

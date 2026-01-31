import type { NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { AI_LABEL, WEB_KIND, identifierToSubclaw, isTopLevelPost, isClawstrIdentifier } from '@/lib/clawstr';

interface SubclawStats {
  name: string;
  postCount: number;
  latestPost: number; // timestamp
}

interface UsePopularSubclawsOptions {
  /** Show all content (AI + human) instead of AI-only */
  showAll?: boolean;
  /** Maximum number of posts to scan */
  limit?: number;
}

/**
 * Discover popular subclaws by scanning recent posts.
 * 
 * Returns subclaws sorted by post count.
 */
export function usePopularSubclaws(options: UsePopularSubclawsOptions = {}) {
  const { nostr } = useNostr();
  const { showAll = false, limit = 200 } = options;

  return useQuery({
    queryKey: ['clawstr', 'popular-subclaws', showAll, limit],
    queryFn: async ({ signal }) => {
      const filter: NostrFilter = {
        kinds: [1111],
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
      const topLevelPosts = events.filter(isTopLevelPost);

      // Count posts per subclaw
      const subclawMap = new Map<string, SubclawStats>();

      for (const event of topLevelPosts) {
        const iTag = event.tags.find(([name]) => name === 'I');
        const identifier = iTag?.[1];
        
        if (!identifier || !isClawstrIdentifier(identifier)) continue;
        
        const subclaw = identifierToSubclaw(identifier);
        if (!subclaw) continue;

        const existing = subclawMap.get(subclaw);
        if (existing) {
          existing.postCount++;
          existing.latestPost = Math.max(existing.latestPost, event.created_at);
        } else {
          subclawMap.set(subclaw, {
            name: subclaw,
            postCount: 1,
            latestPost: event.created_at,
          });
        }
      }

      // Convert to array and sort by post count
      const subclaws = Array.from(subclawMap.values())
        .sort((a, b) => b.postCount - a.postCount);

      return subclaws;
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

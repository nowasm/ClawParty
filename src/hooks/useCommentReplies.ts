import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { AI_LABEL, subclawToIdentifier } from '@/lib/clawstr';

interface RepliesData {
  allReplies: NostrEvent[];
  directReplies: NostrEvent[];
  replyCount: number;
  getDirectReplies: (parentId: string) => NostrEvent[];
}

interface UseCommentRepliesOptions {
  /** Show all content (AI + human) instead of AI-only */
  showAll?: boolean;
  /** Maximum number of replies to fetch */
  limit?: number;
}

/**
 * Fetch all replies to a specific comment recursively.
 * 
 * This fetches the complete thread tree starting from a comment.
 */
export function useCommentReplies(
  commentId: string | undefined,
  subclaw: string,
  options: UseCommentRepliesOptions = {}
) {
  const { nostr } = useNostr();
  const { showAll = false, limit = 500 } = options;

  return useQuery<RepliesData>({
    queryKey: ['clawstr', 'comment-replies', commentId, subclaw, showAll, limit],
    queryFn: async () => {
      if (!commentId) {
        return {
          allReplies: [],
          directReplies: [],
          replyCount: 0,
          getDirectReplies: () => [],
        };
      }

      const identifier = subclawToIdentifier(subclaw);
      
      // Build base filter for this subclaw
      const baseFilter: Partial<NostrFilter> = {
        kinds: [1111],
        '#I': [identifier],
        '#k': ['1111'], // Only replies to other comments
      };

      // Add AI-only filters unless showing all content
      if (!showAll) {
        baseFilter['#l'] = [AI_LABEL.value];
        baseFilter['#L'] = [AI_LABEL.namespace];
      }

      // Fetch all replies in the thread recursively
      const allReplies: NostrEvent[] = [];
      const fetchedIds = new Set<string>();
      let currentLevelIds = [commentId];

      // Fetch up to 10 levels deep
      for (let i = 0; i < 10 && currentLevelIds.length > 0; i++) {
        const events = await nostr.query([{
          ...baseFilter,
          '#e': currentLevelIds,
          limit,
        }], {
          signal: AbortSignal.timeout(10000),
        });

        if (events.length === 0) break;

        // Add new events
        const newEvents = events.filter(e => !fetchedIds.has(e.id));
        newEvents.forEach(e => fetchedIds.add(e.id));
        allReplies.push(...newEvents);

        // Prepare next level
        currentLevelIds = newEvents.map(e => e.id);
      }

      // Helper to get direct replies to any comment
      const getDirectReplies = (parentId: string): NostrEvent[] => {
        return allReplies
          .filter((event) => {
            const eTag = event.tags.find(([name]) => name === 'e');
            return eTag?.[1] === parentId;
          })
          .sort((a, b) => a.created_at - b.created_at); // Oldest first for threads
      };

      const directReplies = getDirectReplies(commentId);

      return {
        allReplies,
        directReplies,
        replyCount: allReplies.length,
        getDirectReplies,
      };
    },
    enabled: !!commentId,
    staleTime: 30 * 1000,
  });
}

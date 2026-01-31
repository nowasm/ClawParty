import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { AI_LABEL, WEB_KIND, subclawToIdentifier } from '@/lib/clawstr';

interface RepliesData {
  allReplies: NostrEvent[];
  directReplies: NostrEvent[];
  replyCount: number;
  getDirectReplies: (parentId: string) => NostrEvent[];
}

interface UsePostRepliesOptions {
  /** Show all content (AI + human) instead of AI-only */
  showAll?: boolean;
  /** Maximum number of replies to fetch */
  limit?: number;
}

/**
 * Fetch all replies to a post (and its nested replies).
 * 
 * Returns both the full list and helper functions for threading.
 */
export function usePostReplies(
  postId: string | undefined,
  subclaw: string,
  options: UsePostRepliesOptions = {}
) {
  const { nostr } = useNostr();
  const { showAll = false, limit = 500 } = options;

  return useQuery<RepliesData>({
    queryKey: ['clawstr', 'post-replies', postId, subclaw, showAll, limit],
    queryFn: async ({ signal }) => {
      if (!postId) {
        return {
          allReplies: [],
          directReplies: [],
          replyCount: 0,
          getDirectReplies: () => [],
        };
      }

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

      // Filter to only replies (events with 'e' tag pointing to another comment)
      // and that are descendants of this post
      const allReplies = events.filter((event) => {
        const kTag = event.tags.find(([name]) => name === 'k')?.[1];
        return kTag === '1111'; // Is a reply to another kind 1111
      });

      // Build a set of all event IDs that are descendants of the post
      const descendantIds = new Set<string>();
      const eventMap = new Map<string, NostrEvent>();
      
      for (const event of allReplies) {
        eventMap.set(event.id, event);
      }

      // Find direct replies to the post
      const directRepliesToPost = allReplies.filter((event) => {
        const eTag = event.tags.find(([name]) => name === 'e');
        return eTag?.[1] === postId;
      });

      // Add direct replies and recursively find all descendants
      const findDescendants = (parentId: string) => {
        for (const event of allReplies) {
          const eTag = event.tags.find(([name]) => name === 'e');
          if (eTag?.[1] === parentId && !descendantIds.has(event.id)) {
            descendantIds.add(event.id);
            findDescendants(event.id);
          }
        }
      };

      // Start from the post
      findDescendants(postId);

      // Filter to only descendants of this post
      const postReplies = allReplies.filter((event) => descendantIds.has(event.id));

      // Helper to get direct replies to any comment
      const getDirectReplies = (parentId: string): NostrEvent[] => {
        return postReplies
          .filter((event) => {
            const eTag = event.tags.find(([name]) => name === 'e');
            return eTag?.[1] === parentId;
          })
          .sort((a, b) => a.created_at - b.created_at); // Oldest first for threads
      };

      return {
        allReplies: postReplies,
        directReplies: directRepliesToPost.sort((a, b) => a.created_at - b.created_at),
        replyCount: postReplies.length,
        getDirectReplies,
      };
    },
    enabled: !!postId,
    staleTime: 30 * 1000,
  });
}

/**
 * Get reply counts for multiple posts efficiently.
 */
export function useBatchReplyCounts(
  eventIds: string[],
  subclaw: string,
  showAll: boolean = false
) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['clawstr', 'batch-reply-counts', eventIds.sort().join(','), subclaw, showAll],
    queryFn: async ({ signal }) => {
      if (eventIds.length === 0) {
        return new Map<string, number>();
      }

      const identifier = subclawToIdentifier(subclaw);
      
      const filter: NostrFilter = {
        kinds: [1111],
        '#I': [identifier],
        '#k': ['1111'], // Only replies to comments
        '#e': eventIds,
        limit: 1000,
      };

      if (!showAll) {
        filter['#l'] = [AI_LABEL.value];
        filter['#L'] = [AI_LABEL.namespace];
      }

      const events = await nostr.query([filter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });

      // Count replies per event
      const countMap = new Map<string, number>();
      
      for (const id of eventIds) {
        countMap.set(id, 0);
      }

      for (const event of events) {
        const eTag = event.tags.find(([name]) => name === 'e');
        const parentId = eTag?.[1];
        
        if (parentId && countMap.has(parentId)) {
          countMap.set(parentId, countMap.get(parentId)! + 1);
        }
      }

      return countMap;
    },
    enabled: eventIds.length > 0,
    staleTime: 60 * 1000,
  });
}

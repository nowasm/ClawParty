import { useMemo } from 'react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { AI_LABEL, WEB_KIND, subclawToIdentifier, isTopLevelPost } from '@/lib/clawstr';
import { useBatchZaps } from './useBatchZaps';
import { useBatchPostVotes } from './usePostVotes';
import { useBatchReplyCounts } from './usePostReplies';

export interface SubclawPostMetrics {
  totalSats: number;
  zapCount: number;
  upvotes: number;
  downvotes: number;
  score: number;
  replyCount: number;
  createdAt: number;
}

export interface SubclawPost {
  event: NostrEvent;
  metrics: SubclawPostMetrics;
}

interface UseSubclawPostsInfiniteOptions {
  /** Show all content (AI + human) instead of AI-only */
  showAll?: boolean;
  /** Number of posts per page */
  limit?: number;
}

/**
 * Infinite scroll version of useSubclawPosts with engagement metrics.
 * 
 * Fetches top-level posts for a specific subclaw with timestamp-based pagination.
 * By default, only fetches AI-labeled content (NIP-32).
 */
export function useSubclawPostsInfinite(
  subclaw: string,
  options: UseSubclawPostsInfiniteOptions = {}
) {
  const { nostr } = useNostr();
  const { showAll = false, limit = 20 } = options;

  // Step 1: Fetch posts with infinite query
  const postsQuery = useInfiniteQuery({
    queryKey: ['clawstr', 'subclaw-posts-infinite', subclaw, showAll, limit],
    queryFn: async ({ pageParam, signal }) => {
      const identifier = subclawToIdentifier(subclaw);
      
      const filter: NostrFilter = {
        kinds: [1111],
        '#i': [identifier],
        '#k': [WEB_KIND],
        limit,
      };

      // Add timestamp pagination
      if (pageParam) {
        filter.until = pageParam;
      }

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
    getNextPageParam: (lastPage) => {
      if (lastPage.length === 0) return undefined;
      // Use the oldest post's timestamp minus 1 for next page
      return lastPage[lastPage.length - 1].created_at - 1;
    },
    initialPageParam: undefined as number | undefined,
    staleTime: 30 * 1000,
  });

  // Step 2: Flatten and deduplicate posts from all pages
  const posts = useMemo(() => {
    if (!postsQuery.data?.pages) return [];
    
    const seen = new Set<string>();
    return postsQuery.data.pages.flat().filter(event => {
      if (!event.id || seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    });
  }, [postsQuery.data?.pages]);

  const postIds = posts.map((p) => p.id);

  // Step 3: Batch fetch engagement metrics
  const zapsQuery = useBatchZaps(postIds);
  const votesQuery = useBatchPostVotes(postIds);
  const repliesQuery = useBatchReplyCounts(postIds, subclaw, showAll);

  // Step 4: Combine data
  const subclawPosts = useMemo<SubclawPost[]>(() => {
    if (posts.length === 0) return [];

    const zapsMap = zapsQuery.data ?? new Map();
    const votesMap = votesQuery.data ?? new Map();
    const repliesMap = repliesQuery.data ?? new Map();

    return posts.map((event) => {
      const zapData = zapsMap.get(event.id) ?? { zapCount: 0, totalSats: 0, zaps: [] };
      const voteData = votesMap.get(event.id) ?? { upvotes: 0, downvotes: 0, score: 0, reactions: [] };
      const replyCount = repliesMap.get(event.id) ?? 0;

      const metrics: SubclawPostMetrics = {
        totalSats: zapData.totalSats,
        zapCount: zapData.zapCount,
        upvotes: voteData.upvotes,
        downvotes: voteData.downvotes,
        score: voteData.score,
        replyCount,
        createdAt: event.created_at,
      };

      return { event, metrics };
    });
  }, [posts, zapsQuery.data, votesQuery.data, repliesQuery.data]);

  // Check if metrics are still loading
  const metricsLoading = postIds.length > 0 && 
    (zapsQuery.isLoading || votesQuery.isLoading || repliesQuery.isLoading);

  return {
    data: subclawPosts,
    isLoading: postsQuery.isLoading,
    isMetricsLoading: metricsLoading,
    isError: postsQuery.isError,
    error: postsQuery.error,
    fetchNextPage: postsQuery.fetchNextPage,
    hasNextPage: postsQuery.hasNextPage,
    isFetchingNextPage: postsQuery.isFetchingNextPage,
  };
}

import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { sceneAddress } from '@/lib/scene';

/**
 * Track who is currently "present" in a scene by looking at recent chat activity.
 * A user is considered present if they sent a chat message in the last 5 minutes.
 */
export function usePresence(scenePubkey: string | undefined, sceneDTag: string | undefined) {
  const { nostr } = useNostr();
  const address = scenePubkey && sceneDTag ? sceneAddress(scenePubkey, sceneDTag) : '';

  return useQuery<string[]>({
    queryKey: ['presence', address],
    queryFn: async ({ signal }) => {
      if (!address) return [];

      const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;

      const events = await nostr.query(
        [{ kinds: [1311], '#a': [address], since: fiveMinutesAgo, limit: 200 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      // Extract unique pubkeys from recent chat messages
      const uniquePubkeys = [...new Set(events.map((e) => e.pubkey))];
      return uniquePubkeys;
    },
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 30_000, // Refresh presence every 30 seconds
  });
}

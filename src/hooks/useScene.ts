import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { SCENE_TAG, SCENE_D_TAG, parseSceneEvent, type SceneMetadata } from '@/lib/scene';

/**
 * Fetch a specific user's scene by their pubkey.
 * Uses the NPool from NostrProvider which queries all configured relays.
 */
export function useScene(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<SceneMetadata | null>({
    queryKey: ['scenes', 'by-author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) return null;

      console.log(`[useScene] Querying scene for pubkey ${pubkey.slice(0, 12)}...`);

      const events = await nostr.query(
        [{ kinds: [30311], authors: [pubkey], '#d': [SCENE_D_TAG], '#t': [SCENE_TAG], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) },
      );

      console.log(`[useScene] Received ${events.length} events`);

      if (events.length === 0) return null;

      // NPool already deduplicates, pick the newest
      const newest = events.sort((a, b) => b.created_at - a.created_at)[0];
      return parseSceneEvent(newest);
    },
    enabled: !!pubkey,
    staleTime: 30_000,
    retry: 2,
  });
}

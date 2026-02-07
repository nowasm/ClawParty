import { useQuery } from '@tanstack/react-query';

import { SCENE_TAG, SCENE_D_TAG, parseSceneEvent, type SceneMetadata } from '@/lib/scene';
import { queryAllDefaultRelays } from '@/lib/relayPool';

/**
 * Fetch a specific user's scene by their pubkey.
 * Uses a persistent relay pool for reliable discovery across origins.
 */
export function useScene(pubkey: string | undefined) {
  return useQuery<SceneMetadata | null>({
    queryKey: ['scenes', 'by-author', pubkey ?? ''],
    queryFn: async () => {
      if (!pubkey) return null;

      const events = await queryAllDefaultRelays(
        [{ kinds: [30311], authors: [pubkey], '#d': [SCENE_D_TAG], '#t': [SCENE_TAG], limit: 1 }],
        { signal: AbortSignal.timeout(12000) },
      );

      if (events.length === 0) return null;

      // queryAllDefaultRelays already deduplicates, pick the newest
      const newest = events.sort((a, b) => b.created_at - a.created_at)[0];
      return parseSceneEvent(newest);
    },
    enabled: !!pubkey,
    staleTime: 30_000,
    retry: 2,
  });
}

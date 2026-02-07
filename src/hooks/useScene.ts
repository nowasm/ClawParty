import { NRelay1, type NostrEvent } from '@nostrify/nostrify';
import { useQuery } from '@tanstack/react-query';

import { SCENE_TAG, SCENE_D_TAG, DEFAULT_RELAY_URLS, parseSceneEvent, type SceneMetadata } from '@/lib/scene';

/**
 * Fetch a specific user's scene by their pubkey.
 * Queries each default relay independently for reliable discovery.
 */
export function useScene(pubkey: string | undefined) {
  return useQuery<SceneMetadata | null>({
    queryKey: ['scenes', 'by-author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) return null;

      const filter = [{ kinds: [30311], authors: [pubkey], '#d': [SCENE_D_TAG], '#t': [SCENE_TAG], limit: 1 }];
      const timeout = AbortSignal.timeout(12000);
      const combined = AbortSignal.any([signal, timeout]);

      let newest: NostrEvent | null = null;

      const results = await Promise.allSettled(
        DEFAULT_RELAY_URLS.map(async (url) => {
          const relay = new NRelay1(url);
          try {
            return await relay.query(filter, { signal: combined });
          } finally {
            relay.close();
          }
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          for (const event of result.value) {
            if (!newest || event.created_at > newest.created_at) {
              newest = event;
            }
          }
        }
      }

      if (!newest) return null;
      return parseSceneEvent(newest);
    },
    enabled: !!pubkey,
    staleTime: 30_000,
    retry: 2,
  });
}

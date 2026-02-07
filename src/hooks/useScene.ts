import { useQuery } from '@tanstack/react-query';
import { NRelay1, type NostrEvent } from '@nostrify/nostrify';

import { SCENE_TAG, SCENE_D_TAG, DEFAULT_RELAY_URLS, parseSceneEvent, type SceneMetadata } from '@/lib/scene';

/**
 * Fetch a specific user's scene by their pubkey.
 * Queries each default relay individually with full error logging.
 */
export function useScene(pubkey: string | undefined) {
  return useQuery<SceneMetadata | null>({
    queryKey: ['scenes', 'by-author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) return null;

      console.log(`[useScene] Querying scene for pubkey ${pubkey.slice(0, 12)}...`);

      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(20000)]);
      const filters = [{ kinds: [30311 as number], authors: [pubkey], '#d': [SCENE_D_TAG], '#t': [SCENE_TAG], limit: 1 }];

      // Query each relay individually in parallel
      const seen = new Map<string, NostrEvent>();

      const results = await Promise.allSettled(
        DEFAULT_RELAY_URLS.map(async (url) => {
          console.log(`[useScene] Connecting to ${url}...`);
          const relay = new NRelay1(url);
          try {
            const events = await relay.query(filters, { signal: querySignal });
            console.log(`[useScene] ${url} => ${events.length} events`);
            return events;
          } catch (err) {
            console.error(`[useScene] ${url} FAILED:`, err);
            return [];
          }
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          for (const event of result.value) {
            const dTag = event.tags.find(([t]) => t === 'd')?.[1] ?? '';
            const key = `${event.pubkey}:${event.kind}:${dTag}`;
            const existing = seen.get(key);
            if (!existing || event.created_at > existing.created_at) {
              seen.set(key, event);
            }
          }
        }
      }

      const events = [...seen.values()];
      console.log(`[useScene] Total unique events: ${events.length}`);

      if (events.length === 0) return null;

      const newest = events.sort((a, b) => b.created_at - a.created_at)[0];
      return parseSceneEvent(newest);
    },
    enabled: !!pubkey,
    staleTime: 30_000,
    retry: 2,
  });
}

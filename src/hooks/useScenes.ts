import { useQuery } from '@tanstack/react-query';
import { NRelay1, type NostrEvent } from '@nostrify/nostrify';

import { SCENE_TAG, DEFAULT_RELAY_URLS, parseSceneEvent, type SceneMetadata } from '@/lib/scene';

/**
 * Query a single relay and return events. Fully self-contained with logging.
 */
async function queryRelay(
  url: string,
  filters: import('@nostrify/nostrify').NostrFilter[],
  signal: AbortSignal,
): Promise<NostrEvent[]> {
  console.log(`[queryRelay] Connecting to ${url}...`);
  const relay = new NRelay1(url);
  try {
    const events = await relay.query(filters, { signal });
    console.log(`[queryRelay] ${url} => ${events.length} events`);
    return events;
  } catch (err) {
    console.error(`[queryRelay] ${url} FAILED:`, err);
    return [];
  }
}

/**
 * Query all published 3D scenes (kind 30311 with t=3d-scene).
 * Queries each default relay individually with full error logging.
 */
export function useScenes(limit = 50) {
  return useQuery<SceneMetadata[]>({
    queryKey: ['scenes', 'all', limit],
    queryFn: async ({ signal }) => {
      console.log('[useScenes] Starting query across', DEFAULT_RELAY_URLS.length, 'relays');

      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(20000)]);
      const filters = [{ kinds: [30311 as number], '#t': [SCENE_TAG], limit }];

      // Query each relay individually in parallel
      const results = await Promise.allSettled(
        DEFAULT_RELAY_URLS.map((url) => queryRelay(url, filters, querySignal)),
      );

      // Merge and deduplicate (addressable events: pubkey+kind+d-tag)
      const seen = new Map<string, NostrEvent>();
      let totalReceived = 0;

      for (const result of results) {
        if (result.status === 'fulfilled') {
          totalReceived += result.value.length;
          for (const event of result.value) {
            const dTag = event.tags.find(([t]) => t === 'd')?.[1] ?? '';
            const key = `${event.pubkey}:${event.kind}:${dTag}`;
            const existing = seen.get(key);
            if (!existing || event.created_at > existing.created_at) {
              seen.set(key, event);
            }
          }
        } else {
          console.error('[useScenes] Promise rejected:', result.reason);
        }
      }

      const events = [...seen.values()];
      console.log(`[useScenes] Total received: ${totalReceived}, unique after dedup: ${events.length}`);

      const scenes = events
        .map(parseSceneEvent)
        .filter((s): s is SceneMetadata => s !== null)
        .sort((a, b) => b.createdAt - a.createdAt);

      console.log(`[useScenes] Parsed ${scenes.length} valid scenes`);
      return scenes;
    },
    staleTime: 30_000,
    retry: 2,
  });
}

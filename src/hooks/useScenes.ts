import { NRelay1, type NostrEvent } from '@nostrify/nostrify';
import { useQuery } from '@tanstack/react-query';

import { SCENE_TAG, DEFAULT_RELAY_URLS, parseSceneEvent, type SceneMetadata } from '@/lib/scene';

/**
 * Query scenes from each default relay independently and merge results.
 * This bypasses the NPool routing entirely to guarantee we reach the default relays.
 */
async function queryDefaultRelays(limit: number, signal: AbortSignal): Promise<NostrEvent[]> {
  const filter = [{ kinds: [30311], '#t': [SCENE_TAG], limit }];
  const seen = new Map<string, NostrEvent>();

  const results = await Promise.allSettled(
    DEFAULT_RELAY_URLS.map(async (url) => {
      const relay = new NRelay1(url);
      try {
        const events = await relay.query(filter, { signal });
        return events;
      } finally {
        relay.close();
      }
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const event of result.value) {
        // For addressable events (kind 30000-39999), deduplicate by pubkey+kind+d-tag
        // keeping the newest version
        const dTag = event.tags.find(([t]) => t === 'd')?.[1] ?? '';
        const key = `${event.pubkey}:${event.kind}:${dTag}`;
        const existing = seen.get(key);
        if (!existing || event.created_at > existing.created_at) {
          seen.set(key, event);
        }
      }
    }
  }

  return [...seen.values()];
}

/**
 * Query all published 3D scenes (kind 30311 with t=3d-scene).
 * Queries each default relay independently and merges results.
 */
export function useScenes(limit = 50) {
  return useQuery<SceneMetadata[]>({
    queryKey: ['scenes', 'all', limit],
    queryFn: async ({ signal }) => {
      const timeout = AbortSignal.timeout(12000);
      const combined = AbortSignal.any([signal, timeout]);
      const events = await queryDefaultRelays(limit, combined);

      return events
        .map(parseSceneEvent)
        .filter((s): s is SceneMetadata => s !== null)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    staleTime: 30_000,
    retry: 2,
  });
}

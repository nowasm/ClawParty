import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { SCENE_TAG, DEFAULT_RELAY_URLS, parseSceneEvent, type SceneMetadata } from '@/lib/scene';

export type SceneSortMode = 'latest' | 'popular';

/**
 * Query all published 3D scenes (kind 30311 with t=3d-scene).
 * Always queries the known default relays for scene discovery,
 * independent of the user's configured relay list.
 *
 * @param sortMode - 'latest' sorts by creation time, 'popular' sorts by reaction/zap count
 */
export function useScenes(sortMode: SceneSortMode = 'latest', limit = 50) {
  const { nostr } = useNostr();

  return useQuery<SceneMetadata[]>({
    queryKey: ['scenes', 'all', sortMode, limit],
    queryFn: async ({ signal }) => {
      // Use nostr.group() to explicitly query the default relays
      // This ensures scene discovery works regardless of user's relay config
      const sceneRelays = nostr.group(DEFAULT_RELAY_URLS);
      const abortSignal = AbortSignal.any([signal, AbortSignal.timeout(15000)]);

      const events = await sceneRelays.query(
        [{ kinds: [30311], '#t': [SCENE_TAG], limit }],
        { signal: abortSignal },
      );

      const scenes = events
        .map(parseSceneEvent)
        .filter((s): s is SceneMetadata => s !== null);

      // Sort by newest first
      if (sortMode === 'latest') {
        return scenes.sort((a, b) => b.createdAt - a.createdAt);
      }

      // For popular sorting, query reactions (kind 7) and zaps (kind 9735)
      const sceneAddresses = scenes.map((s) => `30311:${s.pubkey}:${s.id}`);

      if (sceneAddresses.length === 0) return scenes;

      const reactions = await sceneRelays.query(
        [{ kinds: [7, 9735], '#a': sceneAddresses, limit: 2000 }],
        { signal: abortSignal },
      );

      // Count interactions per scene address
      const popularityCounts = new Map<string, number>();
      for (const event of reactions) {
        const aTag = event.tags.find(([t]) => t === 'a')?.[1];
        if (aTag) {
          popularityCounts.set(aTag, (popularityCounts.get(aTag) ?? 0) + 1);
        }
      }

      // Sort by popularity descending, with creation time as tiebreaker
      return scenes.sort((a, b) => {
        const aCount = popularityCounts.get(`30311:${a.pubkey}:${a.id}`) ?? 0;
        const bCount = popularityCounts.get(`30311:${b.pubkey}:${b.id}`) ?? 0;
        if (aCount !== bCount) return bCount - aCount;
        return b.createdAt - a.createdAt;
      });
    },
    staleTime: 30_000,
    retry: 2,
  });
}

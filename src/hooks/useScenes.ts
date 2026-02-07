import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { SCENE_TAG, DEFAULT_RELAY_URLS, parseSceneEvent, type SceneMetadata } from '@/lib/scene';

/**
 * Query all published 3D scenes (kind 30311 with t=3d-scene).
 * Always queries the known default relays for scene discovery,
 * independent of the user's configured relay list.
 */
export function useScenes(limit = 50) {
  const { nostr } = useNostr();

  return useQuery<SceneMetadata[]>({
    queryKey: ['scenes', 'all', limit],
    queryFn: async ({ signal }) => {
      console.log('[useScenes] Querying scenes from default relays:', DEFAULT_RELAY_URLS);

      // Use nostr.group() to explicitly query the default relays
      // This ensures scene discovery works regardless of user's relay config
      const sceneRelays = nostr.group(DEFAULT_RELAY_URLS);

      const events = await sceneRelays.query(
        [{ kinds: [30311], '#t': [SCENE_TAG], limit }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) },
      );

      console.log(`[useScenes] Received ${events.length} events from relays`);

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

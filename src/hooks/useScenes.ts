import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { SCENE_TAG, DEFAULT_RELAY_URLS, parseSceneEvent, type SceneMetadata } from '@/lib/scene';

/**
 * Query all published 3D scenes (kind 30311 with t=3d-scene).
 * Always queries the default relays to ensure full discovery
 * regardless of the logged-in user's relay config.
 */
export function useScenes(limit = 50) {
  const { nostr } = useNostr();

  return useQuery<SceneMetadata[]>({
    queryKey: ['scenes', 'all', limit],
    queryFn: async ({ signal }) => {
      // Query from the default relay group so scenes are always visible
      // even when the user's NIP-65 relay list is different.
      const defaultGroup = nostr.group(DEFAULT_RELAY_URLS);
      const events = await defaultGroup.query(
        [{ kinds: [30311], '#t': [SCENE_TAG], limit }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );

      return events
        .map(parseSceneEvent)
        .filter((s): s is SceneMetadata => s !== null)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    staleTime: 30_000,
    retry: 2,
  });
}

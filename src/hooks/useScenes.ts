import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { SCENE_TAG, parseSceneEvent, type SceneMetadata } from '@/lib/scene';

/**
 * Query all published 3D scenes (kind 30311 with t=3d-scene).
 */
export function useScenes(limit = 50) {
  const { nostr } = useNostr();

  return useQuery<SceneMetadata[]>({
    queryKey: ['scenes', 'all', limit],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [30311], '#t': [SCENE_TAG], limit }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      return events
        .map(parseSceneEvent)
        .filter((s): s is SceneMetadata => s !== null)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    staleTime: 60_000,
  });
}

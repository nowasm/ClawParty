import { useQuery } from '@tanstack/react-query';

import { SCENE_TAG, parseSceneEvent, type SceneMetadata } from '@/lib/scene';
import { queryAllDefaultRelays } from '@/lib/relayPool';

/**
 * Query all published 3D scenes (kind 30311 with t=3d-scene).
 * Uses a persistent relay pool for reliable discovery across origins.
 */
export function useScenes(limit = 50) {
  return useQuery<SceneMetadata[]>({
    queryKey: ['scenes', 'all', limit],
    queryFn: async () => {
      const events = await queryAllDefaultRelays(
        [{ kinds: [30311], '#t': [SCENE_TAG], limit }],
        { signal: AbortSignal.timeout(12000) },
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

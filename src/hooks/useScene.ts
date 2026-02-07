import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { SCENE_TAG, SCENE_D_TAG, DEFAULT_RELAY_URLS, parseSceneEvent, type SceneMetadata } from '@/lib/scene';

/**
 * Fetch a specific user's scene by their pubkey.
 * Always queries the known default relays for scene discovery.
 */
export function useScene(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<SceneMetadata | null>({
    queryKey: ['scenes', 'by-author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) return null;

      // Use nostr.group() to explicitly query the default relays
      const sceneRelays = nostr.group(DEFAULT_RELAY_URLS);

      const events = await sceneRelays.query(
        [{ kinds: [30311], authors: [pubkey], '#d': [SCENE_D_TAG], '#t': [SCENE_TAG], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) },
      );

      if (events.length === 0) return null;

      // Pick the newest event
      const newest = events.sort((a, b) => b.created_at - a.created_at)[0];
      return parseSceneEvent(newest);
    },
    enabled: !!pubkey,
    staleTime: 30_000,
    retry: 2,
  });
}

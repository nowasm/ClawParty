import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { SCENE_TAG, SCENE_D_TAG, DEFAULT_RELAY_URLS, parseSceneEvent, type SceneMetadata } from '@/lib/scene';

/**
 * Fetch a specific user's scene by their pubkey.
 * Always queries the default relays for consistent discovery.
 */
export function useScene(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<SceneMetadata | null>({
    queryKey: ['scenes', 'by-author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) return null;

      const defaultGroup = nostr.group(DEFAULT_RELAY_URLS);
      const events = await defaultGroup.query(
        [{ kinds: [30311], authors: [pubkey], '#d': [SCENE_D_TAG], '#t': [SCENE_TAG], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );

      if (events.length === 0) return null;
      return parseSceneEvent(events[0]);
    },
    enabled: !!pubkey,
    staleTime: 30_000,
    retry: 2,
  });
}

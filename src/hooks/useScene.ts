import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { SCENE_TAG, parseSceneEvent, type SceneMetadata } from '@/lib/scene';

/**
 * Fetch a specific user's scene by their pubkey.
 */
export function useScene(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<SceneMetadata | null>({
    queryKey: ['scenes', 'by-author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) return null;

      const events = await nostr.query(
        [{ kinds: [30311], authors: [pubkey], '#t': [SCENE_TAG], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      if (events.length === 0) return null;
      return parseSceneEvent(events[0]);
    },
    enabled: !!pubkey,
    staleTime: 60_000,
    retry: 2,
  });
}

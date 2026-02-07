import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { SCENE_TAG } from '@/lib/scene';
import { publishToDefaultRelays } from '@/lib/relayPool';

interface PublishSceneParams {
  dTag: string;
  title: string;
  summary: string;
  imageUrl: string;
  sceneUrl: string;
}

/**
 * Publish or update the current user's 3D scene (kind 30311).
 * Uses a persistent relay pool so connections are reused.
 */
export function usePublishScene() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  const publishScene = async (params: PublishSceneParams) => {
    if (!user) throw new Error('Must be logged in to publish a scene');

    setIsPending(true);
    try {
      const tags: string[][] = [
        ['d', params.dTag],
        ['title', params.title],
        ['summary', params.summary],
        ['image', params.imageUrl],
        ['streaming', params.sceneUrl],
        ['t', SCENE_TAG],
        ['status', 'live'],
        ['p', user.pubkey, '', 'Host'],
      ];

      // Sign the event
      const event = await user.signer.signEvent({
        kind: 30311,
        content: '',
        tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      console.log('Scene event signed:', event.id);

      // Publish to all default relays via persistent connections
      await publishToDefaultRelays(event);

      // Also try user's configured relays via pool (fire-and-forget)
      nostr.event(event, { signal: AbortSignal.timeout(5000) }).catch(() => {});

      // Invalidate scene queries to refresh lists
      queryClient.invalidateQueries({ queryKey: ['scenes'] });

      return event;
    } finally {
      setIsPending(false);
    }
  };

  return { publishScene, isPending };
}

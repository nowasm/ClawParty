import { useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { SCENE_TAG, DEFAULT_RELAY_URLS } from '@/lib/scene';

interface PublishSceneParams {
  dTag: string;
  title: string;
  summary: string;
  imageUrl: string;
  sceneUrl: string;
}

/**
 * Publish or update the current user's 3D scene (kind 30311).
 * Always broadcasts to the default relays so all clients can discover the scene.
 */
export function usePublishScene() {
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  const publishScene = async (params: PublishSceneParams) => {
    if (!user) throw new Error('Must be logged in to publish a scene');

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

    // Publish to user's configured relays
    const event = await publishEvent({
      kind: 30311,
      content: '',
      tags,
    });

    // Also broadcast to all default relays so that anonymous visitors
    // (using the default relay list) can always discover the scene.
    const defaultGroup = nostr.group(DEFAULT_RELAY_URLS);
    try {
      await defaultGroup.event(event, { signal: AbortSignal.timeout(8000) });
    } catch (err) {
      // Non-fatal: the event was already published to user's relays
      console.warn('Failed to broadcast scene to some default relays:', err);
    }

    // Invalidate scene queries to refresh lists
    queryClient.invalidateQueries({ queryKey: ['scenes'] });

    return event;
  };

  return { publishScene, isPending };
}

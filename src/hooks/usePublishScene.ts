import { useState } from 'react';
import { NRelay1 } from '@nostrify/nostrify';
import { useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
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
 * Signs the event and broadcasts to each default relay individually using
 * direct NRelay1 connections (bypasses pool routing for reliability).
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

      // Publish to each default relay individually with direct connections
      const relayResults = await Promise.allSettled(
        DEFAULT_RELAY_URLS.map(async (url) => {
          const relay = new NRelay1(url);
          try {
            await relay.event(event, { signal: AbortSignal.timeout(8000) });
            console.log(`Published to ${url}`);
            return url;
          } catch (err) {
            console.warn(`Failed to publish to ${url}:`, err);
            throw err;
          } finally {
            relay.close();
          }
        }),
      );

      const succeeded = relayResults.filter((r) => r.status === 'fulfilled').length;
      console.log(`Scene published to ${succeeded}/${DEFAULT_RELAY_URLS.length} relays`);

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

import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { sceneAddress } from '@/lib/scene';
import type { NostrEvent } from '@nostrify/nostrify';

export interface ChatMessage {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
}

function eventToMessage(event: NostrEvent): ChatMessage {
  return {
    id: event.id,
    pubkey: event.pubkey,
    content: event.content,
    createdAt: event.created_at,
  };
}

/**
 * Fetch and subscribe to chat messages for a scene (kind 1311).
 */
export function useSceneChat(scenePubkey: string | undefined, sceneDTag: string | undefined) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const addressRef = useRef('');

  const address = scenePubkey && sceneDTag ? sceneAddress(scenePubkey, sceneDTag) : '';
  addressRef.current = address;

  // Initial fetch of recent messages
  const query = useQuery<ChatMessage[]>({
    queryKey: ['scene-chat', address],
    queryFn: async ({ signal }) => {
      if (!address) return [];

      const events = await nostr.query(
        [{ kinds: [1311], '#a': [address], limit: 100 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      return events
        .map(eventToMessage)
        .sort((a, b) => a.createdAt - b.createdAt);
    },
    enabled: !!address,
    staleTime: 30_000,
  });

  // Subscribe to new messages in real-time
  useEffect(() => {
    if (!address) return;

    const controller = new AbortController();

    (async () => {
      try {
        for await (const msg of nostr.req(
          [{ kinds: [1311], '#a': [address], since: Math.floor(Date.now() / 1000) }],
          { signal: controller.signal },
        )) {
          if (msg[0] === 'EVENT') {
            const newMessage = eventToMessage(msg[2] as NostrEvent);
            queryClient.setQueryData<ChatMessage[]>(['scene-chat', addressRef.current], (old) => {
              if (!old) return [newMessage];
              // Avoid duplicates
              if (old.some((m) => m.id === newMessage.id)) return old;
              return [...old, newMessage];
            });
          }
        }
      } catch {
        // Subscription ended (abort or error)
      }
    })();

    return () => controller.abort();
  }, [address, nostr, queryClient]);

  return query;
}

/**
 * Send a chat message to a scene.
 */
export function useSendSceneChat() {
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const { user } = useCurrentUser();

  const sendMessage = async (scenePubkey: string, sceneDTag: string, content: string, relayHint = '') => {
    if (!user) throw new Error('Must be logged in to chat');
    if (!content.trim()) return;

    const address = sceneAddress(scenePubkey, sceneDTag);

    await publishEvent({
      kind: 1311,
      content: content.trim(),
      tags: [
        ['a', address, relayHint],
      ],
    });
  };

  return { sendMessage, isPending };
}

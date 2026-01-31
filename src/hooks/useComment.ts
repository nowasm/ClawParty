import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

/**
 * Fetch a single comment (kind 1111) by its event ID.
 */
export function useComment(eventId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['clawstr', 'comment', eventId],
    queryFn: async () => {
      if (!eventId) return null;

      const filter: NostrFilter = {
        kinds: [1111],
        ids: [eventId],
        limit: 1,
      };

      const events = await nostr.query([filter], {
        signal: AbortSignal.timeout(10000),
      });

      return events[0] || null;
    },
    enabled: !!eventId,
    staleTime: 60 * 1000,
  });
}

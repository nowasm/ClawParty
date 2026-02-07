import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { AVATAR_D_TAG, parseAvatarConfig, type AvatarConfig } from '@/lib/scene';

/**
 * Fetch a user's avatar configuration (kind 30078, d=3d-scene-avatar).
 */
export function useAvatar(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<AvatarConfig | null>({
    queryKey: ['avatar', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) return null;

      const events = await nostr.query(
        [{ kinds: [30078], authors: [pubkey], '#d': [AVATAR_D_TAG], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) },
      );

      if (events.length === 0) return null;
      return parseAvatarConfig(events[0].content);
    },
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: 2,
  });
}

/**
 * Fetch multiple users' avatar configurations at once.
 */
export function useAvatars(pubkeys: string[]) {
  const { nostr } = useNostr();

  return useQuery<Record<string, AvatarConfig>>({
    queryKey: ['avatars', ...pubkeys.sort()],
    queryFn: async ({ signal }) => {
      if (pubkeys.length === 0) return {};

      const events = await nostr.query(
        [{ kinds: [30078], authors: pubkeys, '#d': [AVATAR_D_TAG], limit: pubkeys.length }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      const result: Record<string, AvatarConfig> = {};
      for (const event of events) {
        // Only keep the latest per pubkey (events should already be sorted)
        if (!result[event.pubkey]) {
          result[event.pubkey] = parseAvatarConfig(event.content);
        }
      }
      return result;
    },
    enabled: pubkeys.length > 0,
    staleTime: 5 * 60_000,
  });
}

/**
 * Publish/update the current user's avatar configuration.
 */
export function usePublishAvatar() {
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  const publishAvatar = async (config: AvatarConfig) => {
    if (!user) throw new Error('Must be logged in to set avatar');

    const event = await publishEvent({
      kind: 30078,
      content: JSON.stringify(config),
      tags: [['d', AVATAR_D_TAG]],
    });

    // Update cache immediately
    queryClient.setQueryData(['avatar', user.pubkey], config);
    queryClient.invalidateQueries({ queryKey: ['avatars'] });

    return event;
  };

  return { publishAvatar, isPending };
}

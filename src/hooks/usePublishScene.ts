import { useQueryClient } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { SCENE_TAG } from '@/lib/scene';

interface PublishSceneParams {
  dTag: string;
  title: string;
  summary: string;
  imageUrl: string;
  sceneUrl: string;
}

/**
 * Publish or update the current user's 3D scene (kind 30311).
 */
export function usePublishScene() {
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

    const event = await publishEvent({
      kind: 30311,
      content: '',
      tags,
    });

    // Invalidate scene queries to refresh lists
    queryClient.invalidateQueries({ queryKey: ['scenes'] });

    return event;
  };

  return { publishScene, isPending };
}

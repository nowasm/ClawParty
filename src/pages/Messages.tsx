import { useSeoMeta } from '@unhead/react';
import { DMMessagingInterface } from '@/components/dm/DMMessagingInterface';
import { DMProvider } from '@/components/DMProvider';
import { SiteHeader } from '@/components/scene/SiteHeader';

const Messages = () => {
  useSeoMeta({
    title: 'Messages - ClawParty',
    description: 'Private encrypted messaging on Nostr',
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="container mx-auto p-4 h-[calc(100vh-3.5rem)] flex flex-col">
        <DMProvider>
          <DMMessagingInterface className="flex-1" />
        </DMProvider>
      </div>
    </div>
  );
};

export default Messages;

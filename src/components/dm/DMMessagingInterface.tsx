import { useState, useCallback } from 'react';
import { DMConversationList } from '@/components/dm/DMConversationList';
import { DMChatArea } from '@/components/dm/DMChatArea';
import { DMStatusInfo } from '@/components/dm/DMStatusInfo';
import { useDMContext } from '@/hooks/useDMContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DMMessagingInterfaceProps {
  className?: string;
  /** When true, forces single-panel layout (like mobile) for narrow containers such as Sheet overlays. */
  compact?: boolean;
}

export const DMMessagingInterface = ({ className, compact }: DMMessagingInterfaceProps) => {
  const [selectedPubkey, setSelectedPubkey] = useState<string | null>(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const isMobile = useIsMobile();
  const { clearCacheAndRefetch } = useDMContext();

  // In compact mode (Sheet) or mobile, show only one panel at a time
  const singlePanel = isMobile || compact;
  const showConversationList = !singlePanel || !selectedPubkey;
  const showChatArea = !singlePanel || selectedPubkey;

  const handleSelectConversation = useCallback((pubkey: string) => {
    setSelectedPubkey(pubkey);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedPubkey(null);
  }, []);

  return (
    <>
      {/* Status Modal */}
      <Dialog open={statusModalOpen} onOpenChange={setStatusModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Messaging Status</DialogTitle>
            <DialogDescription>
              View loading status, cache info, and connection details
            </DialogDescription>
          </DialogHeader>
          <DMStatusInfo clearCacheAndRefetch={clearCacheAndRefetch} />
        </DialogContent>
      </Dialog>

      <div className={cn("flex gap-4 overflow-hidden", className)}>
        {/* Conversation List - Left Sidebar */}
        <div className={cn(
          !singlePanel && "md:w-80 md:flex-shrink-0",
          singlePanel && !showConversationList && "hidden",
          singlePanel && showConversationList && "w-full"
        )}>
          <DMConversationList
            selectedPubkey={selectedPubkey}
            onSelectConversation={handleSelectConversation}
            className="h-full"
            onStatusClick={() => setStatusModalOpen(true)}
          />
        </div>

        {/* Chat Area - Right Panel */}
        <div className={cn(
          !singlePanel && "flex-1 md:min-w-0",
          singlePanel && !showChatArea && "hidden",
          singlePanel && showChatArea && "w-full"
        )}>
          <DMChatArea
            pubkey={selectedPubkey}
            onBack={singlePanel ? handleBack : undefined}
            className="h-full"
          />
        </div>
      </div>
    </>
  );
};


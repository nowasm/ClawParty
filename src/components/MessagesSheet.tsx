import { DMMessagingInterface } from '@/components/dm/DMMessagingInterface';
import { DMProvider } from '@/components/DMProvider';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { MessageCircle } from 'lucide-react';

interface MessagesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MessagesSheet({ open, onOpenChange }: MessagesSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-md w-[90vw] p-0 flex flex-col gap-0"
      >
        <SheetHeader className="px-4 py-3 border-b border-border/50 shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4" />
            Messages
          </SheetTitle>
          <SheetDescription className="sr-only">
            Private encrypted messaging
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          <DMProvider>
            <DMMessagingInterface className="h-full" compact />
          </DMProvider>
        </div>
      </SheetContent>
    </Sheet>
  );
}

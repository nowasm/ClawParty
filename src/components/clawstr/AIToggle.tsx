import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CrabIcon } from './CrabIcon';

interface AIToggleProps {
  showAll: boolean;
  onToggle: (showAll: boolean) => void;
  className?: string;
}

/**
 * Toggle between AI-only content and everyone (AI + Human).
 */
export function AIToggle({ showAll, onToggle, className }: AIToggleProps) {
  return (
    <div className={cn(
      "inline-flex items-center gap-1 p-1 rounded-lg bg-muted",
      className
    )}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onToggle(false)}
        className={cn(
          "h-7 px-3 gap-1.5 rounded-md transition-all",
          !showAll ? [
            "bg-[hsl(var(--ai-accent))]/10",
            "text-[hsl(var(--ai-accent))]",
            "hover:bg-[hsl(var(--ai-accent))]/15",
            "hover:text-[hsl(var(--ai-accent))]",
          ] : [
            "text-muted-foreground",
            "hover:text-foreground",
            "hover:bg-transparent"
          ]
        )}
      >
        <CrabIcon className="h-4 w-4" />
        <span className="text-xs font-medium">AI Only</span>
      </Button>
      
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onToggle(true)}
        className={cn(
          "h-7 px-3 gap-1.5 rounded-md transition-all",
          showAll ? [
            "bg-background",
            "text-foreground",
            "shadow-sm",
          ] : [
            "text-muted-foreground",
            "hover:text-foreground",
            "hover:bg-transparent"
          ]
        )}
      >
        <Users className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Everyone</span>
      </Button>
    </div>
  );
}

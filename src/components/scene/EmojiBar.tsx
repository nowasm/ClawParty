import { Button } from '@/components/ui/button';

const QUICK_EMOJIS = ['👋', '❤️', '🔥', '😂', '🤩', '👏', '💯', '🎉', '✨', '🚀', '👍', '😍'];

interface EmojiBarProps {
  onEmoji: (emoji: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * A horizontal bar of quick-reaction emoji buttons.
 * Sits below or next to the 3D viewport for one-click interactions.
 */
export function EmojiBar({ onEmoji, disabled, className }: EmojiBarProps) {
  return (
    <div className={`flex items-center gap-1 flex-wrap ${className ?? ''}`}>
      {QUICK_EMOJIS.map((emoji) => (
        <Button
          key={emoji}
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 text-lg hover:scale-125 hover:bg-primary/10 transition-all duration-150"
          onClick={() => onEmoji(emoji)}
          disabled={disabled}
          title={`Send ${emoji}`}
        >
          {emoji}
        </Button>
      ))}
    </div>
  );
}

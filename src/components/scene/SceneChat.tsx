import { useState, useRef, useEffect } from 'react';
import { Send, Smile, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useMemo } from 'react';
import { useSceneChat, useSendSceneChat, type ChatMessage } from '@/hooks/useSceneChat';
import type { LiveChatMessage } from '@/hooks/useWebRTC';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const EMOJI_LIST = ['👋', '❤️', '🔥', '😂', '🤩', '👏', '💯', '🎉', '✨', '🚀', '😍', '🙌'];

interface SceneChatProps {
  scenePubkey: string;
  sceneDTag: string;
  /** Instant messages from WebRTC (merged with Nostr messages in UI) */
  liveChatMessages?: LiveChatMessage[];
  /** Send instant message to peers in scene (WebRTC) */
  onSendLiveChat?: (text: string) => void;
  className?: string;
}

function ChatMessageItem({ message }: { message: ChatMessage }) {
  const author = useAuthor(message.pubkey);
  const displayName = author.data?.metadata?.name || message.pubkey.slice(0, 8);
  const timeStr = new Date(message.createdAt * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex items-start gap-2 py-1.5 px-1 group hover:bg-muted/50 rounded">
      <Avatar className="h-6 w-6 mt-0.5 shrink-0">
        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
          {displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-foreground truncate">{displayName}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{timeStr}</span>
        </div>
        <p className="text-sm text-foreground/90 break-words">{message.content}</p>
      </div>
    </div>
  );
}

/** Normalize to ChatMessage shape for unified list */
function toChatMessage(m: LiveChatMessage): ChatMessage {
  return { id: m.id, pubkey: m.pubkey, content: m.content, createdAt: m.createdAt };
}

export function SceneChat({ scenePubkey, sceneDTag, liveChatMessages = [], onSendLiveChat, className }: SceneChatProps) {
  const [input, setInput] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useCurrentUser();
  const { data: messages = [], isLoading } = useSceneChat(scenePubkey, sceneDTag);
  const { sendMessage, isPending } = useSendSceneChat();

  const mergedMessages = useMemo(() => {
    const nostrIds = new Set(messages.map((m) => m.id));
    const liveOnly = liveChatMessages.filter((m) => !nostrIds.has(m.id)).map(toChatMessage);
    return [...messages, ...liveOnly].sort((a, b) => a.createdAt - b.createdAt);
  }, [messages, liveChatMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [mergedMessages.length]);

  const handleSend = async () => {
    if (!input.trim() || !user) return;
    const text = input.trim();
    setInput('');
    onSendLiveChat?.(text);
    await sendMessage(scenePubkey, sceneDTag, text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setInput((prev) => prev + emoji);
  };

  if (isCollapsed) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="fixed bottom-4 right-4 z-50 shadow-lg gap-2"
        onClick={() => setIsCollapsed(false)}
      >
        <MessageCircle className="h-4 w-4" />
        Chat
        {mergedMessages.length > 0 && (
          <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[10px] font-bold">
            {mergedMessages.length}
          </span>
        )}
      </Button>
    );
  }

  return (
    <div className={`flex flex-col bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-xl ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Chat</span>
          <span className="text-xs text-muted-foreground">({mergedMessages.length})</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => setIsCollapsed(true)}
        >
          &minus;
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 h-[300px] px-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">Loading messages...</p>
          </div>
        ) : mergedMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">No messages yet. Say hello!</p>
          </div>
        ) : (
          <div className="py-2 space-y-0.5">
            {mergedMessages.map((msg) => (
              <ChatMessageItem key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      {user ? (
        <div className="px-3 py-2 border-t border-border">
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                  <Smile className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" side="top" align="start">
                <div className="grid grid-cols-6 gap-1">
                  {EMOJI_LIST.map((emoji) => (
                    <button
                      key={emoji}
                      className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted transition-colors text-lg"
                      onClick={() => handleEmojiSelect(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="h-8 text-sm"
              disabled={isPending}
            />
            <Button
              size="sm"
              className="h-8 w-8 p-0 shrink-0"
              onClick={handleSend}
              disabled={!input.trim() || isPending}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">Log in to chat</p>
        </div>
      )}
    </div>
  );
}

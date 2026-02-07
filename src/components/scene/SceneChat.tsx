import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Smile, MessageCircle, Users, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useSceneChat, useSendSceneChat, type ChatMessage } from '@/hooks/useSceneChat';
import type { LiveChatMessage } from '@/hooks/useWebRTC';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const EMOJI_LIST = ['👋', '❤️', '🔥', '😂', '🤩', '👏', '💯', '🎉', '✨', '🚀', '😍', '🙌'];

export type ChatMode = 'public' | 'private';

interface SceneChatProps {
  scenePubkey: string;
  sceneDTag: string;
  /** Instant messages from WebRTC (merged with Nostr messages in UI) */
  liveChatMessages?: LiveChatMessage[];
  /** Send instant message to peers in scene (WebRTC) - public only */
  onSendLiveChat?: (text: string) => void;
  /** Connected peers for private chat: list of { pubkey, displayName } */
  connectedPeers?: { pubkey: string; displayName: string }[];
  /** Private chat messages per peer pubkey */
  privateChatMessages?: Record<string, LiveChatMessage[]>;
  /** Send private message to one peer */
  onSendPrivateChat?: (peerPubkey: string, text: string) => void;
  className?: string;
}

function ChatMessageItem({ message, isFromMe }: { message: ChatMessage; isFromMe?: boolean }) {
  const author = useAuthor(message.pubkey);
  const displayName = author.data?.metadata?.name || message.pubkey.slice(0, 8);
  const timeStr = new Date(message.createdAt * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`flex items-start gap-2 py-1.5 px-1 group hover:bg-muted/50 rounded ${
        isFromMe ? 'flex-row-reverse' : ''
      }`}
    >
      <Avatar className="h-6 w-6 mt-0.5 shrink-0">
        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
          {displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className={`min-w-0 flex-1 ${isFromMe ? 'text-right' : ''}`}>
        <div className={`flex items-baseline gap-2 ${isFromMe ? 'justify-end' : ''}`}>
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

export function SceneChat({
  scenePubkey,
  sceneDTag,
  liveChatMessages = [],
  onSendLiveChat,
  connectedPeers = [],
  privateChatMessages = {},
  onSendPrivateChat,
  className,
}: SceneChatProps) {
  const [input, setInput] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('public');
  const [selectedPeerPubkey, setSelectedPeerPubkey] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useCurrentUser();
  const { data: messages = [], isLoading } = useSceneChat(scenePubkey, sceneDTag);
  const { sendMessage, isPending } = useSendSceneChat();

  const mergedPublicMessages = useMemo(() => {
    const nostrIds = new Set(messages.map((m) => m.id));
    const liveOnly = liveChatMessages.filter((m) => !nostrIds.has(m.id)).map(toChatMessage);
    return [...messages, ...liveOnly].sort((a, b) => a.createdAt - b.createdAt);
  }, [messages, liveChatMessages]);

  const privateMessages = useMemo(() => {
    if (!selectedPeerPubkey) return [];
    return (privateChatMessages[selectedPeerPubkey] ?? []).sort((a, b) => a.createdAt - b.createdAt);
  }, [selectedPeerPubkey, privateChatMessages]);

  const displayMessages = chatMode === 'public' ? mergedPublicMessages : privateMessages;
  const displayCount = chatMode === 'public' ? mergedPublicMessages.length : privateMessages.length;

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [displayMessages.length]);

  const handleSend = async () => {
    if (!input.trim() || !user) return;
    const text = input.trim();
    setInput('');
    if (chatMode === 'private' && selectedPeerPubkey) {
      onSendPrivateChat?.(selectedPeerPubkey, text);
    } else {
      onSendLiveChat?.(text);
      await sendMessage(scenePubkey, sceneDTag, text);
    }
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

  const canSend = user && (chatMode === 'public' ? true : !!selectedPeerPubkey) && input.trim();
  const sendDisabled = !canSend || (chatMode === 'public' && isPending);

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
        {displayCount > 0 && (
          <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[10px] font-bold">
            {displayCount}
          </span>
        )}
      </Button>
    );
  }

  return (
    <div className={`flex flex-col bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-xl ${className ?? ''}`}>
      {/* Header with tabs */}
      <div className="flex items-center justify-between px-2 py-2 border-b border-border">
        <Tabs value={chatMode} onValueChange={(v) => setChatMode(v as ChatMode)} className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-8">
            <TabsTrigger value="public" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              公共
              <span className="text-muted-foreground">({mergedPublicMessages.length})</span>
            </TabsTrigger>
            <TabsTrigger value="private" className="gap-1.5 text-xs">
              <MessageSquare className="h-3.5 w-3.5" />
              私聊
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-foreground ml-1"
          onClick={() => setIsCollapsed(true)}
        >
          &minus;
        </Button>
      </div>

      {chatMode === 'private' && (
        <div className="px-3 py-2 border-b border-border">
          <Select value={selectedPeerPubkey} onValueChange={setSelectedPeerPubkey}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="选择私聊对象..." />
            </SelectTrigger>
            <SelectContent>
              {connectedPeers.map((peer) => (
                <SelectItem key={peer.pubkey} value={peer.pubkey} className="text-xs">
                  {peer.displayName || peer.pubkey.slice(0, 12) + '…'}
                </SelectItem>
              ))}
              {connectedPeers.length === 0 && (
                <div className="py-2 px-2 text-xs text-muted-foreground">暂无在线用户</div>
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 h-[260px] px-2">
        {chatMode === 'public' && isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">Loading messages...</p>
          </div>
        ) : chatMode === 'private' && !selectedPeerPubkey ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">选择上方用户开始私聊</p>
          </div>
        ) : displayMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">
              {chatMode === 'private' ? '暂无消息，发一句打个招呼吧' : 'No messages yet. Say hello!'}
            </p>
          </div>
        ) : (
          <div className="py-2 space-y-0.5">
            {displayMessages.map((msg) => (
              <ChatMessageItem key={msg.id} message={msg} isFromMe={user?.pubkey === msg.pubkey} />
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
              placeholder={chatMode === 'private' && !selectedPeerPubkey ? '请先选择私聊对象' : 'Type a message...'}
              className="h-8 text-sm"
              disabled={chatMode === 'public' ? isPending : false}
            />
            <Button
              size="sm"
              className="h-8 w-8 p-0 shrink-0"
              onClick={handleSend}
              disabled={sendDisabled}
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

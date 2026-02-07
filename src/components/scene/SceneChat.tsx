import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Smile, MessageCircle, Users, MessageSquare, ChevronUp, ChevronDown, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useSceneChat, useSendSceneChat, type ChatMessage } from '@/hooks/useSceneChat';
import type { LiveChatMessage } from '@/hooks/useWebRTC';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

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
    <div className="flex items-start gap-1.5 py-1 px-1 group hover:bg-white/5 rounded transition-colors">
      <Avatar className="h-5 w-5 mt-0.5 shrink-0">
        <AvatarFallback className="text-[9px] bg-primary/20 text-primary font-bold">
          {displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <span className={cn(
          "text-[11px] font-semibold mr-1.5",
          isFromMe ? "text-primary" : "text-blue-400"
        )}>
          {displayName}
        </span>
        <span className="text-[10px] text-muted-foreground/60 mr-1.5">{timeStr}</span>
        <span className="text-xs text-foreground/90 break-words">{message.content}</span>
      </div>
    </div>
  );
}

/** Normalize to ChatMessage shape for unified list */
function toChatMessage(m: LiveChatMessage): ChatMessage {
  return { id: m.id, pubkey: m.pubkey, content: m.content, createdAt: m.createdAt };
}

/** Sidebar item for a peer with unread indicator */
function PeerSidebarItem({
  pubkey,
  displayName,
  isSelected,
  hasUnread,
  onClick,
}: {
  pubkey: string;
  displayName: string;
  isSelected: boolean;
  hasUnread: boolean;
  onClick: () => void;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              "relative w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200",
              "hover:bg-white/10",
              isSelected
                ? "bg-primary/20 ring-1 ring-primary/50"
                : "bg-white/5"
            )}
          >
            <Avatar className="h-5 w-5">
              <AvatarFallback className={cn(
                "text-[9px] font-bold",
                isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {hasUnread && (
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 border border-background animate-pulse" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {displayName}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
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

  // Track which peers have unread messages
  const [readCounts, setReadCounts] = useState<Record<string, number>>({});

  const mergedPublicMessages = useMemo(() => {
    const nostrIds = new Set(messages.map((m) => m.id));
    const liveOnly = liveChatMessages.filter((m) => !nostrIds.has(m.id)).map(toChatMessage);
    return [...messages, ...liveOnly].sort((a, b) => a.createdAt - b.createdAt);
  }, [messages, liveChatMessages]);

  const privateMessages = useMemo(() => {
    if (!selectedPeerPubkey) return [];
    return (privateChatMessages[selectedPeerPubkey] ?? []).sort((a, b) => a.createdAt - b.createdAt);
  }, [selectedPeerPubkey, privateChatMessages]);

  // Peers with private messages (to show in sidebar)
  const peersWithMessages = useMemo(() => {
    const peerPubkeys = new Set<string>();
    for (const pk of Object.keys(privateChatMessages)) {
      if ((privateChatMessages[pk]?.length ?? 0) > 0) {
        peerPubkeys.add(pk);
      }
    }
    // Also include connected peers
    for (const peer of connectedPeers) {
      peerPubkeys.add(peer.pubkey);
    }
    return Array.from(peerPubkeys);
  }, [privateChatMessages, connectedPeers]);

  // Mark messages as read when viewing a private chat
  useEffect(() => {
    if (chatMode === 'private' && selectedPeerPubkey) {
      const count = privateChatMessages[selectedPeerPubkey]?.length ?? 0;
      setReadCounts((prev) => ({ ...prev, [selectedPeerPubkey]: count }));
    }
  }, [chatMode, selectedPeerPubkey, privateChatMessages]);

  const displayMessages = chatMode === 'public' ? mergedPublicMessages : privateMessages;

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

  const handleSelectPeer = (pubkey: string) => {
    setChatMode('private');
    setSelectedPeerPubkey(pubkey);
  };

  const handleSelectPublic = () => {
    setChatMode('public');
    setSelectedPeerPubkey('');
  };

  const canSend = user && (chatMode === 'public' ? true : !!selectedPeerPubkey) && input.trim();
  const sendDisabled = !canSend || (chatMode === 'public' && isPending);

  const getPeerDisplayName = (pubkey: string) => {
    const peer = connectedPeers.find((p) => p.pubkey === pubkey);
    return peer?.displayName || pubkey.slice(0, 8) + '…';
  };

  const hasUnreadForPeer = (pubkey: string) => {
    const total = privateChatMessages[pubkey]?.length ?? 0;
    const read = readCounts[pubkey] ?? 0;
    return total > read;
  };

  const totalUnread = peersWithMessages.filter(hasUnreadForPeer).length;

  // Collapsed state: small floating button
  if (isCollapsed) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="shadow-lg gap-2 bg-card/90 backdrop-blur-sm border-border/50 hover:bg-card"
        onClick={() => setIsCollapsed(false)}
      >
        <MessageCircle className="h-4 w-4" />
        聊天
        {(mergedPublicMessages.length > 0 || totalUnread > 0) && (
          <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px] font-bold">
            {totalUnread > 0 ? totalUnread : mergedPublicMessages.length}
          </Badge>
        )}
        <ChevronUp className="h-3 w-3 ml-0.5" />
      </Button>
    );
  }

  const selectedPeerName = selectedPeerPubkey ? getPeerDisplayName(selectedPeerPubkey) : '';

  return (
    <div className={cn(
      "flex bg-card/90 backdrop-blur-md border border-border/50 rounded-xl shadow-2xl overflow-hidden",
      "w-[380px] h-[320px]",
      className,
    )}>
      {/* Left sidebar: channels + peers */}
      <div className="w-11 shrink-0 bg-black/10 border-r border-border/30 flex flex-col py-2 px-1 gap-1 items-center">
        {/* Public channel */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleSelectPublic}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200",
                  "hover:bg-white/10",
                  chatMode === 'public'
                    ? "bg-primary/20 ring-1 ring-primary/50"
                    : "bg-white/5"
                )}
              >
                <Hash className={cn(
                  "h-4 w-4",
                  chatMode === 'public' ? "text-primary" : "text-muted-foreground"
                )} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              公共频道
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Divider */}
        {peersWithMessages.length > 0 && (
          <div className="w-5 h-px bg-border/40 my-0.5" />
        )}

        {/* Players with messages / connected peers */}
        <ScrollArea className="flex-1 w-full">
          <div className="flex flex-col gap-1 items-center px-0.5">
            {peersWithMessages.map((pk) => (
              <PeerSidebarItem
                key={pk}
                pubkey={pk}
                displayName={getPeerDisplayName(pk)}
                isSelected={chatMode === 'private' && selectedPeerPubkey === pk}
                hasUnread={hasUnreadForPeer(pk)}
                onClick={() => handleSelectPeer(pk)}
              />
            ))}
          </div>
        </ScrollArea>

        {/* Online count */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-8 h-6 rounded flex items-center justify-center text-[10px] text-muted-foreground/70">
                <Users className="h-3 w-3 mr-0.5" />
                {connectedPeers.length}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              在线: {connectedPeers.length} 人
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {chatMode === 'public' ? (
              <>
                <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-semibold truncate">公共频道</span>
                <span className="text-[10px] text-muted-foreground">({mergedPublicMessages.length})</span>
              </>
            ) : (
              <>
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-semibold truncate">
                  {selectedPeerName || '私聊'}
                </span>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setIsCollapsed(true)}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea ref={scrollRef} className="flex-1 px-1">
          {chatMode === 'public' && isLoading ? (
            <div className="flex items-center justify-center h-full py-8">
              <p className="text-xs text-muted-foreground">加载消息中...</p>
            </div>
          ) : chatMode === 'private' && !selectedPeerPubkey ? (
            <div className="flex items-center justify-center h-full py-8">
              <p className="text-xs text-muted-foreground">← 选择左侧玩家开始私聊</p>
            </div>
          ) : displayMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full py-8">
              <p className="text-xs text-muted-foreground">
                {chatMode === 'private' ? '暂无消息，打个招呼吧' : '暂无消息，说点什么吧'}
              </p>
            </div>
          ) : (
            <div className="py-1 space-y-0">
              {displayMessages.map((msg) => (
                <ChatMessageItem
                  key={msg.id}
                  message={msg}
                  isFromMe={user?.pubkey === msg.pubkey}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        {user ? (
          <div className="px-2 py-1.5 border-t border-border/30 shrink-0">
            <div className="flex items-center gap-1.5">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0">
                    <Smile className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" side="top" align="start">
                  <div className="grid grid-cols-6 gap-1">
                    {EMOJI_LIST.map((emoji) => (
                      <button
                        key={emoji}
                        className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors text-base"
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
                placeholder={
                  chatMode === 'private' && !selectedPeerPubkey
                    ? '请先选择私聊对象'
                    : chatMode === 'private'
                      ? `发消息给 ${selectedPeerName}...`
                      : '发送消息...'
                }
                className="h-7 text-xs bg-black/10 border-border/30"
                disabled={chatMode === 'public' ? isPending : false}
              />
              <Button
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                onClick={handleSend}
                disabled={sendDisabled}
              >
                <Send className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="px-3 py-1.5 border-t border-border/30 shrink-0">
            <p className="text-[10px] text-muted-foreground text-center">登录后可参与聊天</p>
          </div>
        )}
      </div>
    </div>
  );
}

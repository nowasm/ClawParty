/**
 * AI Agent Perception Layer
 *
 * Maintains a "world state" model by processing incoming sync messages.
 * Provides spatial awareness, chat history, and event triggers that
 * the decision engine can reason about.
 */

// ============================================================================
// Types
// ============================================================================

export interface PerceivedPeer {
  pubkey: string;
  x: number;
  y: number;
  z: number;
  ry: number;
  animation?: string;
  expression?: string;
  displayName?: string;
  /** Distance from the AI agent (updated each perception tick) */
  distance: number;
  /** Timestamp of last position update */
  lastSeen: number;
}

export interface ChatEntry {
  pubkey: string;
  text: string;
  timestamp: number;
  /** Whether this message mentions the AI agent */
  mentionsAgent: boolean;
}

export interface PerceptionEvent {
  type: 'peer_join' | 'peer_leave' | 'peer_chat' | 'peer_emoji' | 'peer_nearby' | 'peer_far';
  pubkey: string;
  data?: string;
  timestamp: number;
}

export interface WorldSnapshot {
  /** All peers currently visible */
  peers: PerceivedPeer[];
  /** Peers within interaction range (< NEARBY_RANGE meters) */
  nearbyPeers: PerceivedPeer[];
  /** Recent chat messages */
  recentChat: ChatEntry[];
  /** Unprocessed events since last snapshot */
  pendingEvents: PerceptionEvent[];
  /** Agent's own position */
  agentPosition: { x: number; y: number; z: number; ry: number };
  /** Total number of peers in the scene */
  totalPeers: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Distance threshold for "nearby" peers (meters) */
const NEARBY_RANGE = 15;

/** Maximum chat history entries to keep */
const MAX_CHAT_HISTORY = 50;

/** Maximum pending events before forced flush */
const MAX_PENDING_EVENTS = 100;

/** Peer data considered stale after this many ms */
const PEER_STALE_MS = 30_000;

// ============================================================================
// Perception
// ============================================================================

export class Perception {
  private peers: Map<string, PerceivedPeer> = new Map();
  private chatHistory: ChatEntry[] = [];
  private pendingEvents: PerceptionEvent[] = [];
  private agentPubkey: string;
  private agentDisplayName: string;

  /** Agent's current position (updated by the action executor) */
  public agentPosition = { x: 0, y: 0, z: 0, ry: 0 };

  constructor(agentPubkey: string, agentDisplayName: string = 'AI') {
    this.agentPubkey = agentPubkey;
    this.agentDisplayName = agentDisplayName;
  }

  // --------------------------------------------------------------------------
  // Incoming message processors
  // --------------------------------------------------------------------------

  /** Process a peer_join event */
  onPeerJoin(pubkey: string, displayName?: string): void {
    if (pubkey === this.agentPubkey) return;
    this.peers.set(pubkey, {
      pubkey,
      x: 0, y: 0, z: 0, ry: 0,
      displayName,
      distance: Infinity,
      lastSeen: Date.now(),
    });
    this.addEvent({ type: 'peer_join', pubkey, timestamp: Date.now() });
  }

  /** Process a peer_leave event */
  onPeerLeave(pubkey: string): void {
    this.peers.delete(pubkey);
    this.addEvent({ type: 'peer_leave', pubkey, timestamp: Date.now() });
  }

  /** Process a peer_position update */
  onPeerPosition(pubkey: string, x: number, y: number, z: number, ry: number, animation?: string, expression?: string): void {
    if (pubkey === this.agentPubkey) return;
    const existing = this.peers.get(pubkey);
    const wasFar = existing ? existing.distance > NEARBY_RANGE : true;

    const distance = this.distanceTo(x, z);
    const peer: PerceivedPeer = {
      pubkey,
      x, y, z, ry,
      animation,
      expression,
      displayName: existing?.displayName,
      distance,
      lastSeen: Date.now(),
    };
    this.peers.set(pubkey, peer);

    // Trigger proximity events
    const isNear = distance <= NEARBY_RANGE;
    if (wasFar && isNear) {
      this.addEvent({ type: 'peer_nearby', pubkey, timestamp: Date.now() });
    } else if (!wasFar && !isNear) {
      this.addEvent({ type: 'peer_far', pubkey, timestamp: Date.now() });
    }
  }

  /** Process a peer_chat message */
  onPeerChat(pubkey: string, text: string): void {
    if (pubkey === this.agentPubkey) return;

    const mentionsAgent = this.checkMention(text);
    const entry: ChatEntry = {
      pubkey,
      text,
      timestamp: Date.now(),
      mentionsAgent,
    };
    this.chatHistory.push(entry);
    if (this.chatHistory.length > MAX_CHAT_HISTORY) {
      this.chatHistory.shift();
    }
    this.addEvent({ type: 'peer_chat', pubkey, data: text, timestamp: Date.now() });
  }

  /** Process a peer_emoji event */
  onPeerEmoji(pubkey: string, emoji: string): void {
    if (pubkey === this.agentPubkey) return;
    this.addEvent({ type: 'peer_emoji', pubkey, data: emoji, timestamp: Date.now() });
  }

  // --------------------------------------------------------------------------
  // Snapshot for the decision engine
  // --------------------------------------------------------------------------

  /** Get a snapshot of the current world state and flush pending events */
  getSnapshot(): WorldSnapshot {
    this.cleanupStalePeers();

    const allPeers = Array.from(this.peers.values());
    // Update distances
    for (const peer of allPeers) {
      peer.distance = this.distanceTo(peer.x, peer.z);
    }
    // Sort by distance
    allPeers.sort((a, b) => a.distance - b.distance);

    const nearbyPeers = allPeers.filter((p) => p.distance <= NEARBY_RANGE);

    const snapshot: WorldSnapshot = {
      peers: allPeers,
      nearbyPeers,
      recentChat: [...this.chatHistory.slice(-20)],
      pendingEvents: [...this.pendingEvents],
      agentPosition: { ...this.agentPosition },
      totalPeers: allPeers.length,
    };

    // Flush events
    this.pendingEvents = [];

    return snapshot;
  }

  /** Get chat messages directed at the agent (mentions) */
  getUnaddressedMentions(): ChatEntry[] {
    return this.chatHistory.filter((c) => c.mentionsAgent);
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  private distanceTo(x: number, z: number): number {
    const dx = x - this.agentPosition.x;
    const dz = z - this.agentPosition.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  private checkMention(text: string): boolean {
    const lower = text.toLowerCase();
    const agentLower = this.agentDisplayName.toLowerCase();
    // Check for @mention or name mention
    return lower.includes(`@${agentLower}`) ||
           lower.includes(agentLower) ||
           lower.includes('ai') ||
           lower.includes('bot');
  }

  private cleanupStalePeers(): void {
    const now = Date.now();
    for (const [pubkey, peer] of this.peers) {
      if (now - peer.lastSeen > PEER_STALE_MS) {
        this.peers.delete(pubkey);
      }
    }
  }

  private addEvent(event: PerceptionEvent): void {
    this.pendingEvents.push(event);
    if (this.pendingEvents.length > MAX_PENDING_EVENTS) {
      this.pendingEvents = this.pendingEvents.slice(-MAX_PENDING_EVENTS / 2);
    }
  }
}

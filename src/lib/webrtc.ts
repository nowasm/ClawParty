/**
 * WebRTC Peer Connection Manager for 3D Scene Share
 *
 * Uses a mesh topology: every peer connects directly to every other peer.
 * Signaling is done via Nostr relay using NIP-04 encrypted ephemeral events.
 *
 * DataChannel messages are JSON with a `type` field:
 *   - "position": { x, y, z, ry }          (avatar position + Y rotation)
 *   - "chat": { text }                      (real-time chat, supplement to kind 1311)
 *   - "emoji": { emoji }                    (floating emoji bubble)
 *   - "join": { avatar: AvatarConfig }      (announce yourself when joining)
 *   - "leave": {}                           (clean disconnect)
 */

// ============================================================================
// Types
// ============================================================================

export interface PeerPosition {
  x: number;
  y: number;
  z: number;
  ry: number; // Y-axis rotation (facing direction)
}

export interface PeerState {
  pubkey: string;
  position: PeerPosition;
  emoji?: string;
  emojiExpiry?: number;
  lastUpdate: number;
}

export type DataChannelMessage =
  | { type: 'position'; x: number; y: number; z: number; ry: number }
  | { type: 'chat'; text: string }
  | { type: 'emoji'; emoji: string }
  | { type: 'join'; pubkey: string }
  | { type: 'leave'; pubkey: string };

export type SignalMessage =
  | { type: 'offer'; sdp: string; from: string; to: string; sceneId: string }
  | { type: 'answer'; sdp: string; from: string; to: string; sceneId: string }
  | { type: 'ice'; candidate: string; from: string; to: string; sceneId: string };

// ============================================================================
// ICE Servers (free public STUN/TURN)
// ============================================================================

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

// ============================================================================
// WebRTCManager - manages all peer connections for one scene
// ============================================================================

export class WebRTCManager {
  private peers: Map<string, RTCPeerConnection> = new Map();
  private channels: Map<string, RTCDataChannel> = new Map();
  private myPubkey: string;
  private sceneId: string;

  /** Called when a signaling message needs to be sent via Nostr */
  public onSignal?: (msg: SignalMessage) => void;
  /** Called when a data message arrives from any peer */
  public onMessage?: (from: string, msg: DataChannelMessage) => void;
  /** Called when a peer connects or disconnects */
  public onPeerChange?: (connectedPeers: string[]) => void;

  constructor(myPubkey: string, sceneId: string) {
    this.myPubkey = myPubkey;
    this.sceneId = sceneId;
  }

  /** Get list of currently connected peer pubkeys */
  getConnectedPeers(): string[] {
    const connected: string[] = [];
    for (const [pubkey, pc] of this.peers) {
      if (pc.connectionState === 'connected') {
        connected.push(pubkey);
      }
    }
    return connected;
  }

  /** Initiate a connection to a remote peer (we are the offerer) */
  async connectToPeer(remotePubkey: string): Promise<void> {
    if (this.peers.has(remotePubkey)) return;
    if (remotePubkey === this.myPubkey) return;

    const pc = this.createPeerConnection(remotePubkey);

    // Create data channel (offerer creates it)
    const channel = pc.createDataChannel('scene', { ordered: false, maxRetransmits: 0 });
    this.setupDataChannel(channel, remotePubkey);

    // Create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.onSignal?.({
      type: 'offer',
      sdp: offer.sdp!,
      from: this.myPubkey,
      to: remotePubkey,
      sceneId: this.sceneId,
    });
  }

  /** Handle an incoming signaling message */
  async handleSignal(msg: SignalMessage): Promise<void> {
    if (msg.to !== this.myPubkey) return;
    if (msg.sceneId !== this.sceneId) return;

    if (msg.type === 'offer') {
      // We received an offer - create answer
      let pc = this.peers.get(msg.from);
      if (!pc) {
        pc = this.createPeerConnection(msg.from);
      }

      await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.onSignal?.({
        type: 'answer',
        sdp: answer.sdp!,
        from: this.myPubkey,
        to: msg.from,
        sceneId: this.sceneId,
      });
    } else if (msg.type === 'answer') {
      const pc = this.peers.get(msg.from);
      if (pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
      }
    } else if (msg.type === 'ice') {
      const pc = this.peers.get(msg.from);
      if (pc) {
        try {
          await pc.addIceCandidate(JSON.parse(msg.candidate));
        } catch {
          // Ignore ICE candidate errors
        }
      }
    }
  }

  /** Broadcast a message to all connected peers */
  broadcast(msg: DataChannelMessage): void {
    const data = JSON.stringify(msg);
    for (const [, channel] of this.channels) {
      if (channel.readyState === 'open') {
        try {
          channel.send(data);
        } catch {
          // Channel may have closed
        }
      }
    }
  }

  /** Send a message to a specific peer */
  sendTo(pubkey: string, msg: DataChannelMessage): void {
    const channel = this.channels.get(pubkey);
    if (channel?.readyState === 'open') {
      channel.send(JSON.stringify(msg));
    }
  }

  /** Disconnect from all peers and clean up */
  destroy(): void {
    // Notify peers we're leaving
    this.broadcast({ type: 'leave', pubkey: this.myPubkey });

    for (const [, channel] of this.channels) {
      channel.close();
    }
    for (const [, pc] of this.peers) {
      pc.close();
    }
    this.peers.clear();
    this.channels.clear();
    this.onPeerChange?.([]); 
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private createPeerConnection(remotePubkey: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peers.set(remotePubkey, pc);

    // ICE candidate handling
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.onSignal?.({
          type: 'ice',
          candidate: JSON.stringify(e.candidate),
          from: this.myPubkey,
          to: remotePubkey,
          sceneId: this.sceneId,
        });
      }
    };

    // Connection state
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.onPeerChange?.(this.getConnectedPeers());
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.channels.delete(remotePubkey);
        this.peers.delete(remotePubkey);
        pc.close();
        this.onPeerChange?.(this.getConnectedPeers());
      }
    };

    // Incoming data channel (answerer receives it)
    pc.ondatachannel = (e) => {
      this.setupDataChannel(e.channel, remotePubkey);
    };

    return pc;
  }

  private setupDataChannel(channel: RTCDataChannel, remotePubkey: string): void {
    this.channels.set(remotePubkey, channel);

    channel.onopen = () => {
      // Announce ourselves
      this.sendTo(remotePubkey, { type: 'join', pubkey: this.myPubkey });
      this.onPeerChange?.(this.getConnectedPeers());
    };

    channel.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as DataChannelMessage;
        this.onMessage?.(remotePubkey, msg);
      } catch {
        // Ignore malformed messages
      }
    };

    channel.onclose = () => {
      this.channels.delete(remotePubkey);
      this.onPeerChange?.(this.getConnectedPeers());
    };
  }
}

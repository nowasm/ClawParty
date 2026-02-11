/**
 * Voice Chat System (Foundation)
 *
 * Provides WebRTC-based peer-to-peer voice communication with
 * optional spatial audio (distance-based volume attenuation).
 *
 * Architecture:
 *   - Uses the existing sync server as signaling relay via game_event messages
 *   - Each player creates a peer connection to nearby players
 *   - Spatial audio: volume attenuates based on 3D distance
 *
 * This module provides the core primitives. UI integration is separate.
 */

// ============================================================================
// Types
// ============================================================================

export interface VoicePeer {
  pubkey: string;
  connection: RTCPeerConnection;
  remoteStream: MediaStream | null;
  audioElement: HTMLAudioElement | null;
  /** Distance in meters (updated by spatial system) */
  distance: number;
}

export interface VoiceChatConfig {
  /** Maximum distance for voice to be audible (meters) */
  maxDistance?: number;
  /** Distance at which volume starts to attenuate (meters) */
  falloffStart?: number;
  /** Whether spatial audio is enabled */
  spatialAudio?: boolean;
}

export type SignalingSend = (toPubkey: string, signal: RTCSignalData) => void;

export interface RTCSignalData {
  type: 'offer' | 'answer' | 'ice-candidate';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_DISTANCE = 30;
const DEFAULT_FALLOFF_START = 5;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// ============================================================================
// Voice Chat Manager
// ============================================================================

export class VoiceChatManager {
  private localStream: MediaStream | null = null;
  private peers: Map<string, VoicePeer> = new Map();
  private config: Required<VoiceChatConfig>;
  private sendSignal: SignalingSend;
  private destroyed = false;

  constructor(sendSignal: SignalingSend, config?: VoiceChatConfig) {
    this.sendSignal = sendSignal;
    this.config = {
      maxDistance: config?.maxDistance ?? DEFAULT_MAX_DISTANCE,
      falloffStart: config?.falloffStart ?? DEFAULT_FALLOFF_START,
      spatialAudio: config?.spatialAudio ?? true,
    };
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /** Request microphone access and start the voice system */
  async start(): Promise<void> {
    if (this.localStream) return;

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (err) {
      console.error('[VoiceChat] Microphone access denied:', err);
      throw new Error('Microphone access is required for voice chat');
    }
  }

  /** Stop voice chat and clean up all connections */
  stop(): void {
    this.destroyed = true;

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    // Close all peer connections
    for (const peer of this.peers.values()) {
      peer.connection.close();
      if (peer.audioElement) {
        peer.audioElement.pause();
        peer.audioElement.srcObject = null;
      }
    }
    this.peers.clear();
  }

  /** Mute/unmute the local microphone */
  setMuted(muted: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = !muted;
      });
    }
  }

  get isMuted(): boolean {
    if (!this.localStream) return true;
    return !this.localStream.getAudioTracks().some((t) => t.enabled);
  }

  // --------------------------------------------------------------------------
  // Peer management
  // --------------------------------------------------------------------------

  /** Initiate a voice connection to a peer (caller side) */
  async connectToPeer(pubkey: string): Promise<void> {
    if (this.destroyed || !this.localStream) return;
    if (this.peers.has(pubkey)) return;

    const pc = this.createPeerConnection(pubkey);
    const peer: VoicePeer = {
      pubkey,
      connection: pc,
      remoteStream: null,
      audioElement: null,
      distance: 0,
    };
    this.peers.set(pubkey, peer);

    // Add local stream tracks
    this.localStream.getTracks().forEach((track) => {
      pc.addTrack(track, this.localStream!);
    });

    // Create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.sendSignal(pubkey, {
      type: 'offer',
      sdp: offer.sdp,
    });
  }

  /** Remove a peer connection */
  disconnectPeer(pubkey: string): void {
    const peer = this.peers.get(pubkey);
    if (peer) {
      peer.connection.close();
      if (peer.audioElement) {
        peer.audioElement.pause();
        peer.audioElement.srcObject = null;
      }
      this.peers.delete(pubkey);
    }
  }

  // --------------------------------------------------------------------------
  // Signaling message handling
  // --------------------------------------------------------------------------

  /** Handle an incoming signaling message from a peer */
  async handleSignal(fromPubkey: string, signal: RTCSignalData): Promise<void> {
    if (this.destroyed || !this.localStream) return;

    switch (signal.type) {
      case 'offer': {
        let peer = this.peers.get(fromPubkey);
        if (!peer) {
          const pc = this.createPeerConnection(fromPubkey);
          peer = { pubkey: fromPubkey, connection: pc, remoteStream: null, audioElement: null, distance: 0 };
          this.peers.set(fromPubkey, peer);
          this.localStream.getTracks().forEach((track) => {
            pc.addTrack(track, this.localStream!);
          });
        }

        await peer.connection.setRemoteDescription(new RTCSessionDescription({
          type: 'offer',
          sdp: signal.sdp,
        }));

        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);

        this.sendSignal(fromPubkey, {
          type: 'answer',
          sdp: answer.sdp,
        });
        break;
      }

      case 'answer': {
        const peer = this.peers.get(fromPubkey);
        if (peer) {
          await peer.connection.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: signal.sdp,
          }));
        }
        break;
      }

      case 'ice-candidate': {
        const peer = this.peers.get(fromPubkey);
        if (peer && signal.candidate) {
          await peer.connection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
        break;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Spatial audio
  // --------------------------------------------------------------------------

  /** Update a peer's distance for spatial audio volume attenuation */
  updatePeerDistance(pubkey: string, distance: number): void {
    const peer = this.peers.get(pubkey);
    if (!peer) return;
    peer.distance = distance;

    if (this.config.spatialAudio && peer.audioElement) {
      const volume = this.calculateVolume(distance);
      peer.audioElement.volume = volume;
    }
  }

  private calculateVolume(distance: number): number {
    if (distance <= this.config.falloffStart) return 1;
    if (distance >= this.config.maxDistance) return 0;

    // Linear falloff between falloffStart and maxDistance
    const range = this.config.maxDistance - this.config.falloffStart;
    const attenuation = 1 - (distance - this.config.falloffStart) / range;
    return Math.max(0, Math.min(1, attenuation));
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  private createPeerConnection(pubkey: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(pubkey, {
          type: 'ice-candidate',
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      const peer = this.peers.get(pubkey);
      if (!peer) return;

      peer.remoteStream = event.streams[0];
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.autoplay = true;
      peer.audioElement = audio;
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.disconnectPeer(pubkey);
      }
    };

    return pc;
  }

  /** Get connected peer count */
  get connectedPeerCount(): number {
    return this.peers.size;
  }
}

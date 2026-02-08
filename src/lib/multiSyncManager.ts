/**
 * Multi-Server Sync Manager
 *
 * Manages connections to multiple sync servers for a single scene.
 * Provides redundancy and automatic failover with zero downtime.
 *
 * Architecture:
 *   - Connects to ALL active sync servers (up to MAX_ACTIVE_SERVERS).
 *   - Upload (send): broadcasts to ALL connected servers so each has
 *     complete state.
 *   - Download (receive): position updates come from PRIMARY only
 *     (lowest RTT). Chat/emoji/join/leave are received from all
 *     servers with msgId-based deduplication.
 *   - Failover: if PRIMARY disconnects, the next-best server is
 *     promoted instantly (it already has full state).
 *
 * Usage:
 *   const manager = new MultiSyncManager();
 *   manager.onStateChange = (state) => { ... };
 *   manager.onMessage = (msg) => { ... };
 *   manager.connect(urls, pubkey, sign);
 *   manager.send({ type: 'position', x, y, z, ry });
 *   manager.destroy();
 */

import {
  SceneSyncManager,
  type ClientMessage,
  type ServerMessage,
  type ConnectionState,
  type SceneSyncManagerOptions,
} from './wsSync';

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of sync servers a client will connect to */
export const MAX_ACTIVE_SERVERS = 5;

/** How often to re-measure latency (ms) */
const LATENCY_MEASURE_INTERVAL = 30_000;

/** Capacity of the LRU dedup set */
const DEDUP_CAPACITY = 10_000;

const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;
function debugLog(...args: unknown[]) {
  if (isDev) console.log('[MultiSync]', ...args);
}

// ============================================================================
// LRU Set for message deduplication
// ============================================================================

/**
 * Fixed-capacity set that evicts oldest entries when full.
 * O(1) has/add via Map iteration order.
 */
class LRUSet {
  private map = new Map<string, true>();
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  add(key: string): void {
    if (this.map.has(key)) return;
    if (this.map.size >= this.capacity) {
      // Evict oldest (first inserted)
      const first = this.map.keys().next().value;
      if (first !== undefined) {
        this.map.delete(first);
      }
    }
    this.map.set(key, true);
  }

  clear(): void {
    this.map.clear();
  }
}

// ============================================================================
// Connection wrapper — tracks per-server state
// ============================================================================

interface ServerConnection {
  url: string;
  manager: SceneSyncManager;
  state: ConnectionState;
  /** Round-trip time in ms (from ping/pong). Infinity if unknown. */
  rtt: number;
  /** Timestamp of last pong received (for RTT measurement) */
  lastPingSent: number;
}

// ============================================================================
// MultiSyncManager
// ============================================================================

export type MultiSyncState = 'disconnected' | 'connecting' | 'connected';

/** Snapshot of a single server connection for debug/status UI */
export interface ServerConnectionSnapshot {
  url: string;
  state: ConnectionState;
  rtt: number;
  isPrimary: boolean;
}

export interface MultiSyncManagerOptions {
  /** Our Nostr pubkey (hex) */
  pubkey: string;
  /** Sign a challenge string — returns the signature (hex) */
  sign: (challenge: string) => Promise<string>;
  /** Map ID to join (0–9999) */
  mapId?: number;
}

export class MultiSyncManager {
  private connections: Map<string, ServerConnection> = new Map();
  private seenMessages = new LRUSet(DEDUP_CAPACITY);
  private primaryUrl: string | null = null;
  private opts: MultiSyncManagerOptions | null = null;
  private latencyTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  private _state: MultiSyncState = 'disconnected';

  // ---- Callbacks ----
  public onStateChange?: (state: MultiSyncState) => void;
  public onMessage?: (msg: ServerMessage) => void;

  get state(): MultiSyncState {
    return this._state;
  }

  /** Get the URL of the current primary server */
  get primary(): string | null {
    return this.primaryUrl;
  }

  /** Get number of connected servers */
  get connectedCount(): number {
    let n = 0;
    for (const conn of this.connections.values()) {
      if (conn.state === 'connected') n++;
    }
    return n;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Connect to multiple sync servers.
   * Takes up to MAX_ACTIVE_SERVERS URLs (extras are ignored).
   */
  connect(urls: string[], pubkey: string, sign: (challenge: string) => Promise<string>, mapId?: number): void {
    if (this.destroyed) return;

    this.opts = { pubkey, sign, mapId };

    // Take only the first MAX_ACTIVE_SERVERS URLs
    const activeUrls = urls.slice(0, MAX_ACTIVE_SERVERS);

    // Disconnect from servers no longer in the list
    for (const [url, conn] of this.connections) {
      if (!activeUrls.includes(url)) {
        conn.manager.destroy();
        this.connections.delete(url);
      }
    }

    // Connect to new servers
    for (const url of activeUrls) {
      if (this.connections.has(url)) continue; // already connected
      this.addServer(url, pubkey, sign, mapId);
    }

    // Start latency measurement
    if (!this.latencyTimer) {
      this.latencyTimer = setInterval(() => {
        this.electPrimary();
      }, LATENCY_MEASURE_INTERVAL);
    }
  }

  /**
   * Send a client message to ALL fully-connected (authenticated) servers.
   * This ensures every server has complete state for redundancy.
   * Messages are NOT sent to servers still in the connecting/authenticating
   * phase, which avoids "Not authenticated" errors from the server.
   */
  send(msg: ClientMessage): void {
    for (const conn of this.connections.values()) {
      if (conn.state === 'connected') {
        conn.manager.send(msg);
      }
    }
  }

  /**
   * Update the list of sync server URLs.
   * New servers are added, removed servers are disconnected.
   */
  updateUrls(urls: string[]): void {
    if (!this.opts) return;
    this.connect(urls, this.opts.pubkey, this.opts.sign);
  }

  /** Get a snapshot of all server connections for debug UI */
  getConnectionsSnapshot(): ServerConnectionSnapshot[] {
    const result: ServerConnectionSnapshot[] = [];
    for (const [url, conn] of this.connections) {
      result.push({
        url,
        state: conn.state,
        rtt: conn.rtt,
        isPrimary: url === this.primaryUrl,
      });
    }
    return result;
  }

  /** Disconnect from all servers and clean up */
  destroy(): void {
    this.destroyed = true;

    if (this.latencyTimer) {
      clearInterval(this.latencyTimer);
      this.latencyTimer = null;
    }

    for (const conn of this.connections.values()) {
      conn.manager.destroy();
    }
    this.connections.clear();
    this.seenMessages.clear();
    this.primaryUrl = null;
    this.setState('disconnected');
  }

  // --------------------------------------------------------------------------
  // Private: Server management
  // --------------------------------------------------------------------------

  private addServer(url: string, pubkey: string, sign: (challenge: string) => Promise<string>, mapId?: number): void {
    const opts: SceneSyncManagerOptions = { syncUrl: url, pubkey, sign, mapId };
    const manager = new SceneSyncManager(opts);

    const conn: ServerConnection = {
      url,
      manager,
      state: 'disconnected',
      rtt: Infinity,
      lastPingSent: 0,
    };

    this.connections.set(url, conn);

    manager.onStateChange = (state) => {
      conn.state = state;

      if (state === 'connected') {
        debugLog(`connected to ${url}`);
        // If no primary yet, elect this one
        if (!this.primaryUrl) {
          this.primaryUrl = url;
          debugLog(`elected primary: ${url} (first connected)`);
        }
      }

      if (state === 'disconnected' && this.primaryUrl === url) {
        debugLog(`primary ${url} disconnected, electing new primary`);
        this.electPrimary();
      }

      this.updateGlobalState();
    };

    manager.onMessage = (msg) => {
      this.handleServerMessage(url, msg);
    };

    manager.connect();
  }

  // --------------------------------------------------------------------------
  // Private: Message routing
  // --------------------------------------------------------------------------

  /**
   * Handle a message from a specific server.
   *
   * Routing strategy:
   *   - peer_position: only process from PRIMARY (high frequency, skip dedup)
   *   - welcome: always process (per-connection, no dedup needed)
   *   - error: always process
   *   - all other broadcasts: dedup by msgId, process from any server
   */
  private handleServerMessage(url: string, msg: ServerMessage): void {
    switch (msg.type) {
      // --- Per-connection messages (no dedup) ---
      case 'welcome':
      case 'error':
        this.onMessage?.(msg);
        return;

      // --- High-frequency: PRIMARY only (skip dedup for performance) ---
      case 'peer_position':
        if (url !== this.primaryUrl) return; // ignore non-primary positions
        this.onMessage?.(msg);
        return;

      // --- All other broadcasts: dedup by msgId ---
      case 'peer_join':
      case 'peer_leave':
      case 'peer_chat':
      case 'peer_dm':
      case 'peer_emoji':
      case 'game_event': {
        const msgId = msg.msgId;
        if (this.seenMessages.has(msgId)) return; // duplicate
        this.seenMessages.add(msgId);
        this.onMessage?.(msg);
        return;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Private: Primary election (lowest RTT)
  // --------------------------------------------------------------------------

  /**
   * Elect the server with the lowest RTT as primary.
   * Called periodically and on disconnect events.
   */
  private electPrimary(): void {
    let bestUrl: string | null = null;
    let bestRtt = Infinity;

    for (const [url, conn] of this.connections) {
      if (conn.state !== 'connected') continue;
      // Measure RTT from the underlying SceneSyncManager's ping/pong
      // For now, use the stored RTT value
      if (conn.rtt < bestRtt) {
        bestRtt = conn.rtt;
        bestUrl = url;
      }
    }

    // If no server has measured RTT yet, pick the first connected one
    if (!bestUrl) {
      for (const [url, conn] of this.connections) {
        if (conn.state === 'connected') {
          bestUrl = url;
          break;
        }
      }
    }

    if (bestUrl && bestUrl !== this.primaryUrl) {
      debugLog(`primary changed: ${this.primaryUrl} → ${bestUrl} (RTT: ${bestRtt}ms)`);
      this.primaryUrl = bestUrl;
    } else if (!bestUrl) {
      this.primaryUrl = null;
    }
  }

  /**
   * Update the RTT for a specific server.
   * Called by the enhanced ping/pong mechanism.
   */
  updateRtt(url: string, rttMs: number): void {
    const conn = this.connections.get(url);
    if (conn) {
      conn.rtt = rttMs;
    }
  }

  // --------------------------------------------------------------------------
  // Private: State management
  // --------------------------------------------------------------------------

  private updateGlobalState(): void {
    let hasConnected = false;
    let hasConnecting = false;

    for (const conn of this.connections.values()) {
      if (conn.state === 'connected') hasConnected = true;
      if (conn.state === 'connecting' || conn.state === 'authenticating') hasConnecting = true;
    }

    if (hasConnected) {
      this.setState('connected');
    } else if (hasConnecting) {
      this.setState('connecting');
    } else {
      this.setState('disconnected');
    }
  }

  private setState(state: MultiSyncState): void {
    if (this._state === state) return;
    this._state = state;
    this.onStateChange?.(state);
  }
}

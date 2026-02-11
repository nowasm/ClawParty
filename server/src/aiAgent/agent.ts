/**
 * AI Agent — First-Class Player in the 3D World
 *
 * The Agent is the top-level orchestrator that ties together:
 *   - Connector:  WebSocket connection to a sync server
 *   - Perception: World state model (peers, chat, events)
 *   - Decision:   Behavior state machine + LLM reasoning
 *   - Executor:   Movement, animation, and chat execution
 *   - Memory:     Short/long-term memory and relationships
 *
 * Usage:
 *   const agent = new Agent({ ... });
 *   await agent.start();
 *   // ... later
 *   agent.stop();
 */

import { getPublicKey } from 'nostr-tools';
import { AgentConnector } from './connector.js';
import { Perception } from './perception.js';
import { DecisionEngine, type LLMProvider } from './decisionEngine.js';
import { ActionExecutor } from './actionExecutor.js';
import { Memory } from './memory.js';
import type { AvatarConfig, ServerMessage } from '../protocol.js';

// ============================================================================
// Types
// ============================================================================

export interface AgentConfig {
  /** Nostr secret key (32 bytes) — the agent's identity */
  secretKey: Uint8Array;
  /** WebSocket sync server URL */
  syncUrl: string;
  /** Map ID to join (0–9999) */
  mapId: number;
  /** Agent's display name */
  name: string;
  /** Avatar configuration */
  avatar?: Partial<AvatarConfig>;
  /** LLM provider (optional — defaults to Shakespeare AI) */
  llm?: LLMProvider;
  /** Custom system prompt for the agent's personality */
  systemPrompt?: string;
  /** Path to store persistent memory (optional) */
  memoryPath?: string;
  /** Decision tick interval in ms (default: 2000) */
  decisionInterval?: number;
  /** Physics tick interval in ms (default: 50 = 20fps) */
  physicsInterval?: number;
}

// ============================================================================
// Agent
// ============================================================================

export class Agent {
  private config: AgentConfig;
  private connector: AgentConnector;
  private perception: Perception;
  private decisionEngine: DecisionEngine;
  private executor: ActionExecutor;
  private memory: Memory;

  private decisionTimer: ReturnType<typeof setInterval> | null = null;
  private physicsTimer: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  public readonly pubkey: string;

  constructor(config: AgentConfig) {
    this.config = config;
    this.pubkey = getPublicKey(config.secretKey);

    // Build avatar config
    const avatar: AvatarConfig = {
      model: config.avatar?.model ?? 'ac-cyan',
      color: config.avatar?.color ?? '#06B6D4',
      hairStyle: 'none',
      hairColor: '#3d2914',
      displayName: config.name,
      modelUrl: config.avatar?.modelUrl,
      ...config.avatar,
    };

    // Initialize subsystems
    this.connector = new AgentConnector({
      syncUrl: config.syncUrl,
      secretKey: config.secretKey,
      mapId: config.mapId,
      avatar,
    });

    this.perception = new Perception(this.pubkey, config.name);

    this.decisionEngine = new DecisionEngine({
      agentName: config.name,
      systemPrompt: config.systemPrompt,
      llm: config.llm,
    });

    this.executor = new ActionExecutor(this.connector, this.perception);

    this.memory = new Memory(this.pubkey, config.memoryPath);

    // Wire up connector events -> perception
    this.connector.events = {
      onStateChange: (state) => {
        console.log(`[Agent:${config.name}] Connection: ${state}`);
      },
      onWelcome: (peers) => {
        console.log(`[Agent:${config.name}] Joined map ${config.mapId} with ${peers.length} peers`);
        for (const peer of peers) {
          this.perception.onPeerJoin(peer.pubkey, peer.avatar?.displayName);
          if (peer.position) {
            this.perception.onPeerPosition(
              peer.pubkey,
              peer.position.x, peer.position.y, peer.position.z, peer.position.ry,
            );
          }
        }
        this.memory.rememberObservation(
          `Joined map ${config.mapId}. Found ${peers.length} player(s) already here.`,
          [],
          0.4,
        );
      },
      onMessage: (msg) => this.handleMessage(msg),
      onError: (error) => {
        console.error(`[Agent:${config.name}] Error: ${error}`);
      },
    };
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /** Start the agent — connect, load memory, begin decision loop */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log(`[Agent:${this.config.name}] Starting (pubkey: ${this.pubkey.slice(0, 8)}...)`);

    // Load persistent memory
    await this.memory.load();

    // Random spawn position
    const spawnX = (Math.random() - 0.5) * 60;
    const spawnZ = (Math.random() - 0.5) * 60;
    this.executor.setPosition(spawnX, 0, spawnZ, Math.random() * Math.PI * 2);

    // Connect to sync server
    this.connector.connect();

    // Start physics tick (20fps)
    const physicsMs = this.config.physicsInterval ?? 50;
    this.physicsTimer = setInterval(() => {
      this.executor.tick();
    }, physicsMs);

    // Start decision tick (every 2s)
    const decisionMs = this.config.decisionInterval ?? 2000;
    this.decisionTimer = setInterval(async () => {
      if (this.connector.state !== 'connected') return;
      try {
        const snapshot = this.perception.getSnapshot();
        const actions = await this.decisionEngine.decide(snapshot);
        this.executor.execute(actions);
      } catch (err) {
        console.error(`[Agent:${this.config.name}] Decision error:`, err);
      }
    }, decisionMs);

    // Periodic memory save (every 5 minutes)
    this.saveTimer = setInterval(() => {
      this.memory.save().catch(() => { /* ignore */ });
    }, 5 * 60_000);
  }

  /** Stop the agent — disconnect, save memory, clean up */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    console.log(`[Agent:${this.config.name}] Stopping...`);

    if (this.decisionTimer) { clearInterval(this.decisionTimer); this.decisionTimer = null; }
    if (this.physicsTimer) { clearInterval(this.physicsTimer); this.physicsTimer = null; }
    if (this.saveTimer) { clearInterval(this.saveTimer); this.saveTimer = null; }

    this.connector.destroy();

    // Save memory one last time
    await this.memory.save();
  }

  // --------------------------------------------------------------------------
  // Message handling
  // --------------------------------------------------------------------------

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'peer_join': {
        const name = msg.avatar?.displayName;
        this.perception.onPeerJoin(msg.pubkey, name);
        this.memory.updateRelationship(msg.pubkey, 'join', name);
        this.memory.rememberObservation(
          `Player "${name ?? msg.pubkey.slice(0, 8)}" joined the scene.`,
          [msg.pubkey],
          0.3,
        );
        break;
      }

      case 'peer_leave':
        this.perception.onPeerLeave(msg.pubkey);
        this.memory.rememberObservation(
          `Player ${msg.pubkey.slice(0, 8)} left the scene.`,
          [msg.pubkey],
          0.2,
        );
        break;

      case 'peer_position':
        this.perception.onPeerPosition(
          msg.pubkey, msg.x, msg.y, msg.z, msg.ry,
          (msg as Record<string, unknown>).animation as string | undefined,
          (msg as Record<string, unknown>).expression as string | undefined,
        );
        break;

      case 'peer_chat':
        this.perception.onPeerChat(msg.pubkey, msg.text);
        break;

      case 'peer_emoji':
        this.perception.onPeerEmoji(msg.pubkey, msg.emoji);
        break;

      case 'error':
        console.warn(`[Agent:${this.config.name}] Server error: ${msg.message} (${msg.code ?? 'unknown'})`);
        break;
    }
  }
}

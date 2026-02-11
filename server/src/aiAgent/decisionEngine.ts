/**
 * AI Agent Decision Engine
 *
 * Uses a behavior state machine combined with LLM reasoning to decide
 * what the agent should do. Takes world snapshots from the perception
 * layer and produces action commands for the executor.
 *
 * States:
 *   idle    → Wandering randomly, looking around
 *   wander  → Moving to a random nearby position
 *   approach→ Walking toward an interesting peer
 *   interact→ Standing near a peer, ready to chat
 *   respond → Generating an LLM response to a chat message
 */

import type { WorldSnapshot, PerceivedPeer } from './perception.js';

// ============================================================================
// Action Types (output of the decision engine)
// ============================================================================

export interface MoveAction {
  type: 'move';
  targetX: number;
  targetZ: number;
  /** Whether to run instead of walk */
  run?: boolean;
}

export interface ChatAction {
  type: 'chat';
  text: string;
}

export interface EmojiAction {
  type: 'emoji';
  emoji: string;
}

export interface AnimationAction {
  type: 'animation';
  animation: string;
}

export interface IdleAction {
  type: 'idle';
}

export type AgentAction = MoveAction | ChatAction | EmojiAction | AnimationAction | IdleAction;

// ============================================================================
// Behavior States
// ============================================================================

export type BehaviorState = 'idle' | 'wander' | 'approach' | 'interact' | 'respond';

// ============================================================================
// LLM Interface
// ============================================================================

export interface LLMProvider {
  /**
   * Generate a chat completion response.
   * @param systemPrompt - System prompt describing the agent's personality
   * @param messages - Conversation context
   * @returns The agent's response text
   */
  generate(systemPrompt: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string>;
}

/**
 * A simple LLM provider that uses the Shakespeare AI API.
 * Server-side version (no Nostr auth, uses direct API key or NIP-98).
 */
export class ShakespeareLLM implements LLMProvider {
  private apiUrl: string;
  private model: string;

  constructor(apiUrl = 'https://ai.shakespeare.diy/v1', model = 'shakespeare') {
    this.apiUrl = apiUrl;
    this.model = model;
  }

  async generate(
    systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<string> {
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 200,
      temperature: 0.8,
    };

    const res = await fetch(`${this.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`LLM API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? '';
  }
}

// ============================================================================
// Decision Engine Configuration
// ============================================================================

export interface DecisionEngineConfig {
  /** Agent's display name (for LLM personality) */
  agentName: string;
  /** System prompt for the LLM */
  systemPrompt?: string;
  /** LLM provider for generating chat responses */
  llm?: LLMProvider;
  /** Terrain half-size for wander boundaries (default 45) */
  wanderBounds?: number;
  /** How often the agent decides to wander (0-1, default 0.3) */
  wanderChance?: number;
  /** Range within which the agent will approach a peer (default 20) */
  approachRange?: number;
  /** Range within which the agent considers itself "interacting" (default 5) */
  interactRange?: number;
}

// ============================================================================
// Decision Engine
// ============================================================================

const DEFAULT_SYSTEM_PROMPT = `You are a friendly AI character in a 3D multiplayer world. You're curious, playful, and enjoy meeting new people. Keep responses short (1-2 sentences), natural, and fun. Use the player's name if you know it. Never break character. If someone greets you, greet them back warmly.`;

export class DecisionEngine {
  private state: BehaviorState = 'idle';
  private config: Required<DecisionEngineConfig>;
  private targetPeer: string | null = null;
  private wanderTarget: { x: number; z: number } | null = null;
  private lastStateChange = 0;
  private lastChatTime = 0;
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  /** Minimum time in a state before transitioning (ms) */
  private static MIN_STATE_DURATION = 3000;
  /** Cooldown between agent chat messages (ms) */
  private static CHAT_COOLDOWN = 5000;
  /** Max conversation history entries to keep */
  private static MAX_CONVERSATION = 10;

  constructor(config: DecisionEngineConfig) {
    this.config = {
      agentName: config.agentName,
      systemPrompt: config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      llm: config.llm ?? new ShakespeareLLM(),
      wanderBounds: config.wanderBounds ?? 45,
      wanderChance: config.wanderChance ?? 0.3,
      approachRange: config.approachRange ?? 20,
      interactRange: config.interactRange ?? 5,
    };
    this.lastStateChange = Date.now();
  }

  get currentState(): BehaviorState { return this.state; }

  /**
   * Main decision tick — called periodically by the agent.
   * Analyzes the world snapshot and returns a list of actions to execute.
   */
  async decide(snapshot: WorldSnapshot): Promise<AgentAction[]> {
    const actions: AgentAction[] = [];
    const now = Date.now();
    const timeInState = now - this.lastStateChange;

    // Process pending events first
    for (const event of snapshot.pendingEvents) {
      const eventActions = await this.processEvent(event, snapshot);
      actions.push(...eventActions);
    }

    // State machine transitions
    switch (this.state) {
      case 'idle': {
        if (timeInState < DecisionEngine.MIN_STATE_DURATION) break;

        // Check for nearby peers to approach
        const closest = snapshot.nearbyPeers[0];
        if (closest && closest.distance < this.config.approachRange) {
          this.transitionTo('approach');
          this.targetPeer = closest.pubkey;
          actions.push({
            type: 'move',
            targetX: closest.x,
            targetZ: closest.z,
          });
          break;
        }

        // Random chance to wander
        if (Math.random() < this.config.wanderChance) {
          this.transitionTo('wander');
          this.wanderTarget = this.randomPosition();
          actions.push({
            type: 'move',
            targetX: this.wanderTarget.x,
            targetZ: this.wanderTarget.z,
          });
        } else {
          actions.push({ type: 'idle' });
        }
        break;
      }

      case 'wander': {
        // Check if we've reached the wander target
        if (this.wanderTarget) {
          const dx = snapshot.agentPosition.x - this.wanderTarget.x;
          const dz = snapshot.agentPosition.z - this.wanderTarget.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < 2) {
            // Reached target, go back to idle
            this.transitionTo('idle');
            actions.push({ type: 'idle' });
            break;
          }
        }

        // Check for nearby peers while wandering
        const closest = snapshot.nearbyPeers[0];
        if (closest && closest.distance < this.config.approachRange) {
          this.transitionTo('approach');
          this.targetPeer = closest.pubkey;
          actions.push({
            type: 'move',
            targetX: closest.x,
            targetZ: closest.z,
          });
          break;
        }

        // Timeout: wander for max 15s then go idle
        if (timeInState > 15000) {
          this.transitionTo('idle');
          actions.push({ type: 'idle' });
        }
        break;
      }

      case 'approach': {
        const target = this.targetPeer ? this.findPeer(snapshot, this.targetPeer) : null;
        if (!target) {
          // Target left; go idle
          this.transitionTo('idle');
          actions.push({ type: 'idle' });
          break;
        }

        if (target.distance <= this.config.interactRange) {
          // We're close enough to interact
          this.transitionTo('interact');
          // Wave at the player
          actions.push({ type: 'emoji', emoji: '👋' });
          actions.push({ type: 'animation', animation: 'wave' });
          break;
        }

        // Keep moving toward target
        actions.push({
          type: 'move',
          targetX: target.x,
          targetZ: target.z,
        });

        // Timeout
        if (timeInState > 20000) {
          this.transitionTo('idle');
        }
        break;
      }

      case 'interact': {
        const target = this.targetPeer ? this.findPeer(snapshot, this.targetPeer) : null;
        if (!target || target.distance > this.config.approachRange) {
          // Target moved away
          this.transitionTo('idle');
          actions.push({ type: 'idle' });
          break;
        }

        // Face the target (stay in place)
        const _angle = Math.atan2(
          target.x - snapshot.agentPosition.x,
          target.z - snapshot.agentPosition.z,
        );
        actions.push({
          type: 'move',
          targetX: snapshot.agentPosition.x, // stay in place
          targetZ: snapshot.agentPosition.z,
        });

        // If inactive for too long, greet or wander away
        if (timeInState > 30000 && now - this.lastChatTime > 10000) {
          this.transitionTo('wander');
          this.wanderTarget = this.randomPosition();
          actions.push({
            type: 'move',
            targetX: this.wanderTarget.x,
            targetZ: this.wanderTarget.z,
          });
        }
        break;
      }

      case 'respond': {
        // The response is generated asynchronously in processEvent.
        // Once the response is sent, we go back to interact.
        if (timeInState > 10000) {
          // Timeout on response generation
          this.transitionTo('interact');
        }
        break;
      }
    }

    return actions;
  }

  // --------------------------------------------------------------------------
  // Event processing
  // --------------------------------------------------------------------------

  private async processEvent(
    event: { type: string; pubkey: string; data?: string; timestamp: number },
    snapshot: WorldSnapshot,
  ): Promise<AgentAction[]> {
    const actions: AgentAction[] = [];

    switch (event.type) {
      case 'peer_join': {
        // New player joined — if we're idle and they're close, approach
        if (this.state === 'idle') {
          const peer = this.findPeer(snapshot, event.pubkey);
          if (peer && peer.distance < this.config.approachRange) {
            this.transitionTo('approach');
            this.targetPeer = event.pubkey;
            actions.push({ type: 'move', targetX: peer.x, targetZ: peer.z });
          }
        }
        break;
      }

      case 'peer_chat': {
        const text = event.data ?? '';
        const now = Date.now();

        // Only respond if cooldown has passed and we're in an interactive state
        if (now - this.lastChatTime < DecisionEngine.CHAT_COOLDOWN) break;

        // Check if the message is directed at or near us
        const peer = this.findPeer(snapshot, event.pubkey);
        const isNearby = peer && peer.distance < this.config.interactRange * 2;
        const mentionsAgent = text.toLowerCase().includes(this.config.agentName.toLowerCase()) ||
                              text.toLowerCase().includes('ai') ||
                              text.toLowerCase().includes('bot');

        if (isNearby || mentionsAgent) {
          this.transitionTo('respond');
          this.targetPeer = event.pubkey;

          // Build conversation context
          this.conversationHistory.push({ role: 'user', content: text });
          if (this.conversationHistory.length > DecisionEngine.MAX_CONVERSATION) {
            this.conversationHistory = this.conversationHistory.slice(-DecisionEngine.MAX_CONVERSATION);
          }

          try {
            const response = await this.config.llm.generate(
              this.config.systemPrompt,
              this.conversationHistory,
            );

            if (response.trim()) {
              actions.push({ type: 'chat', text: response.trim() });
              this.conversationHistory.push({ role: 'assistant', content: response.trim() });
              this.lastChatTime = Date.now();

              // Choose a fitting animation/emoji for the response
              if (response.includes('!')) {
                actions.push({ type: 'animation', animation: 'laugh' });
              } else if (response.includes('?')) {
                actions.push({ type: 'animation', animation: 'think' });
              } else {
                actions.push({ type: 'animation', animation: 'talk' });
              }
            }
          } catch (err) {
            console.error('[DecisionEngine] LLM error:', err);
          }

          this.transitionTo('interact');
        }
        break;
      }

      case 'peer_emoji': {
        // React to emoji with a matching one
        const peer = this.findPeer(snapshot, event.pubkey);
        if (peer && peer.distance < this.config.interactRange * 2) {
          const emojiResponses: Record<string, string> = {
            '👋': '👋',
            '❤️': '😍',
            '🔥': '🔥',
            '😂': '😂',
            '👏': '🎉',
            '🎉': '🎉',
          };
          const response = emojiResponses[event.data ?? ''] ?? '👍';
          actions.push({ type: 'emoji', emoji: response });
        }
        break;
      }

      case 'peer_nearby': {
        // Someone came close — if idle, show interest
        if (this.state === 'idle' || this.state === 'wander') {
          this.transitionTo('approach');
          this.targetPeer = event.pubkey;
          const peer = this.findPeer(snapshot, event.pubkey);
          if (peer) {
            actions.push({ type: 'move', targetX: peer.x, targetZ: peer.z });
          }
        }
        break;
      }
    }

    return actions;
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  private transitionTo(newState: BehaviorState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.lastStateChange = Date.now();
    }
  }

  private findPeer(snapshot: WorldSnapshot, pubkey: string): PerceivedPeer | undefined {
    return snapshot.peers.find((p) => p.pubkey === pubkey);
  }

  private randomPosition(): { x: number; z: number } {
    const bounds = this.config.wanderBounds;
    return {
      x: (Math.random() - 0.5) * 2 * bounds,
      z: (Math.random() - 0.5) * 2 * bounds,
    };
  }
}

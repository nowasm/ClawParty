/**
 * AI Agent Action Executor
 *
 * Translates high-level actions from the decision engine into
 * low-level sync protocol messages. Handles smooth movement
 * interpolation and animation state management.
 */

import type { AgentConnector } from './connector.js';
import type { Perception } from './perception.js';
import type { AgentAction, MoveAction } from './decisionEngine.js';

// ============================================================================
// Constants
// ============================================================================

const WALK_SPEED = 4;     // meters per second
const RUN_SPEED = 8;      // meters per second
const POSITION_BROADCAST_INTERVAL = 66; // ~15fps
const ARRIVAL_THRESHOLD = 0.5; // meters — considered "arrived" when this close

// ============================================================================
// Action Executor
// ============================================================================

export class ActionExecutor {
  private connector: AgentConnector;
  private perception: Perception;

  /** Current position and facing */
  private x = 0;
  private y = 0;
  private z = 0;
  private ry = 0;

  /** Movement target (null = standing still) */
  private moveTarget: { x: number; z: number; run: boolean } | null = null;

  /** Current animation state */
  private currentAnimation = 'idle';
  private currentExpression = 'normal';

  /** Timing */
  private lastBroadcast = 0;
  private lastTick = Date.now();

  constructor(connector: AgentConnector, perception: Perception) {
    this.connector = connector;
    this.perception = perception;
  }

  /** Set initial position (e.g. random spawn) */
  setPosition(x: number, y: number, z: number, ry: number = 0): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.ry = ry;
    this.perception.agentPosition = { x, y, z, ry };
  }

  /** Execute a batch of actions from the decision engine */
  execute(actions: AgentAction[]): void {
    for (const action of actions) {
      switch (action.type) {
        case 'move':
          this.setMoveTarget(action);
          break;
        case 'chat':
          this.connector.sendChat(action.text);
          break;
        case 'emoji':
          this.connector.sendEmoji(action.emoji);
          break;
        case 'animation':
          this.currentAnimation = action.animation;
          break;
        case 'idle':
          this.moveTarget = null;
          this.currentAnimation = 'idle';
          break;
      }
    }
  }

  /**
   * Physics / movement tick — call at a regular interval (e.g. 60fps or 20fps).
   * Updates position toward the move target and broadcasts position.
   */
  tick(): void {
    const now = Date.now();
    const dt = Math.min((now - this.lastTick) / 1000, 0.1); // delta in seconds, capped
    this.lastTick = now;

    if (this.moveTarget) {
      const dx = this.moveTarget.x - this.x;
      const dz = this.moveTarget.z - this.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < ARRIVAL_THRESHOLD) {
        // Arrived
        this.moveTarget = null;
        this.currentAnimation = 'idle';
      } else {
        // Move toward target
        const speed = this.moveTarget.run ? RUN_SPEED : WALK_SPEED;
        const step = Math.min(speed * dt, dist);
        const nx = dx / dist;
        const nz = dz / dist;
        this.x += nx * step;
        this.z += nz * step;

        // Face the movement direction
        this.ry = Math.atan2(nx, nz);

        // Set animation based on speed
        this.currentAnimation = this.moveTarget.run ? 'run' : 'walk';
      }
    }

    // Clamp to terrain bounds (100m terrain, ±49)
    this.x = Math.max(-49, Math.min(49, this.x));
    this.z = Math.max(-49, Math.min(49, this.z));

    // Update perception's agent position
    this.perception.agentPosition = { x: this.x, y: this.y, z: this.z, ry: this.ry };

    // Broadcast position at ~15fps
    if (now - this.lastBroadcast >= POSITION_BROADCAST_INTERVAL) {
      this.lastBroadcast = now;
      this.connector.sendPosition(
        this.x, this.y, this.z, this.ry,
        this.currentAnimation,
        this.currentExpression,
      );
    }
  }

  /** Get current position */
  getPosition(): { x: number; y: number; z: number; ry: number } {
    return { x: this.x, y: this.y, z: this.z, ry: this.ry };
  }

  /** Check if the agent is currently moving */
  isMoving(): boolean {
    return this.moveTarget !== null;
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private setMoveTarget(action: MoveAction): void {
    this.moveTarget = {
      x: action.targetX,
      z: action.targetZ,
      run: action.run ?? false,
    };
  }
}

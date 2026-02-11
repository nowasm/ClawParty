/**
 * Client-Side Prediction & Interpolation
 *
 * Provides smooth rendering of remote player positions by interpolating
 * between received server updates, and optional dead-reckoning prediction
 * when updates are delayed.
 *
 * Architecture:
 *   - Each remote peer has a position buffer of recent server updates
 *   - Rendering interpolates between the two most recent updates
 *   - If no update arrives within a threshold, dead-reckoning extrapolates
 *     based on the last known velocity
 *   - The local player uses client-side prediction with server reconciliation
 */

// ============================================================================
// Types
// ============================================================================

export interface PositionSample {
  x: number;
  y: number;
  z: number;
  ry: number;
  /** Server timestamp or local receive time (ms) */
  timestamp: number;
}

export interface InterpolatedPosition {
  x: number;
  y: number;
  z: number;
  ry: number;
  /** Estimated speed (m/s) based on recent samples */
  speed: number;
  /** Whether this position is extrapolated (dead-reckoning) vs interpolated */
  isExtrapolated: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** How far behind real-time the interpolation renders (ms).
 *  Higher = smoother but more latency. Lower = snappier but more jitter. */
const INTERPOLATION_DELAY = 100;

/** Maximum time to extrapolate before snapping (ms) */
const MAX_EXTRAPOLATION_MS = 500;

/** Maximum buffer size per peer */
const MAX_BUFFER_SIZE = 20;

// ============================================================================
// Position Buffer (per remote peer)
// ============================================================================

export class PositionBuffer {
  private samples: PositionSample[] = [];

  /** Add a new position sample from the server */
  push(sample: PositionSample): void {
    this.samples.push(sample);
    if (this.samples.length > MAX_BUFFER_SIZE) {
      this.samples.shift();
    }
  }

  /**
   * Get the interpolated position at a given render time.
   * Uses interpolation delay to smooth out jitter.
   */
  getInterpolated(renderTime: number): InterpolatedPosition | null {
    if (this.samples.length === 0) return null;

    const targetTime = renderTime - INTERPOLATION_DELAY;

    // Find the two samples surrounding targetTime
    let before: PositionSample | null = null;
    let after: PositionSample | null = null;

    for (let i = 0; i < this.samples.length; i++) {
      if (this.samples[i].timestamp <= targetTime) {
        before = this.samples[i];
      } else {
        after = this.samples[i];
        break;
      }
    }

    // Case 1: We have both samples — interpolate
    if (before && after) {
      const range = after.timestamp - before.timestamp;
      const t = range > 0 ? (targetTime - before.timestamp) / range : 0;
      const clamped = Math.max(0, Math.min(1, t));

      return {
        x: lerp(before.x, after.x, clamped),
        y: lerp(before.y, after.y, clamped),
        z: lerp(before.z, after.z, clamped),
        ry: lerpAngle(before.ry, after.ry, clamped),
        speed: this.estimateSpeed(),
        isExtrapolated: false,
      };
    }

    // Case 2: Only before — extrapolate (dead-reckoning)
    if (before) {
      const elapsed = targetTime - before.timestamp;
      if (elapsed > MAX_EXTRAPOLATION_MS) {
        // Too old — just return last known position
        return {
          x: before.x,
          y: before.y,
          z: before.z,
          ry: before.ry,
          speed: 0,
          isExtrapolated: true,
        };
      }

      const velocity = this.estimateVelocity();
      const dt = elapsed / 1000; // seconds

      return {
        x: before.x + velocity.vx * dt,
        y: before.y,
        z: before.z + velocity.vz * dt,
        ry: before.ry,
        speed: this.estimateSpeed(),
        isExtrapolated: true,
      };
    }

    // Case 3: Only after — use it directly (we're behind)
    if (after) {
      return {
        x: after.x,
        y: after.y,
        z: after.z,
        ry: after.ry,
        speed: 0,
        isExtrapolated: false,
      };
    }

    return null;
  }

  /** Estimate current speed based on last two samples (m/s) */
  private estimateSpeed(): number {
    if (this.samples.length < 2) return 0;
    const a = this.samples[this.samples.length - 2];
    const b = this.samples[this.samples.length - 1];
    const dt = (b.timestamp - a.timestamp) / 1000;
    if (dt <= 0) return 0;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    return Math.sqrt(dx * dx + dz * dz) / dt;
  }

  /** Estimate velocity vector based on last two samples */
  private estimateVelocity(): { vx: number; vz: number } {
    if (this.samples.length < 2) return { vx: 0, vz: 0 };
    const a = this.samples[this.samples.length - 2];
    const b = this.samples[this.samples.length - 1];
    const dt = (b.timestamp - a.timestamp) / 1000;
    if (dt <= 0) return { vx: 0, vz: 0 };
    return {
      vx: (b.x - a.x) / dt,
      vz: (b.z - a.z) / dt,
    };
  }

  /** Clear all samples */
  clear(): void {
    this.samples = [];
  }

  get length(): number {
    return this.samples.length;
  }
}

// ============================================================================
// Interpolation Manager (manages all peers)
// ============================================================================

export class InterpolationManager {
  private buffers: Map<string, PositionBuffer> = new Map();

  /** Record a position update for a peer */
  addSample(pubkey: string, sample: PositionSample): void {
    let buffer = this.buffers.get(pubkey);
    if (!buffer) {
      buffer = new PositionBuffer();
      this.buffers.set(pubkey, buffer);
    }
    buffer.push(sample);
  }

  /** Get the interpolated position for a peer */
  getPosition(pubkey: string, renderTime?: number): InterpolatedPosition | null {
    const buffer = this.buffers.get(pubkey);
    if (!buffer) return null;
    return buffer.getInterpolated(renderTime ?? Date.now());
  }

  /** Remove a peer's buffer (on disconnect) */
  removePeer(pubkey: string): void {
    this.buffers.delete(pubkey);
  }

  /** Clear all buffers */
  clear(): void {
    this.buffers.clear();
  }

  /** Get all tracked peer pubkeys */
  get trackedPeers(): string[] {
    return Array.from(this.buffers.keys());
  }
}

// ============================================================================
// Server Reconciliation (for local player)
// ============================================================================

export interface PendingInput {
  /** Sequence number */
  seq: number;
  /** Input: movement delta */
  dx: number;
  dz: number;
  /** Applied timestamp */
  timestamp: number;
}

/**
 * Server reconciliation for the local player.
 *
 * The client predicts its own movement immediately, but also sends
 * inputs to the server. When the server acknowledges a position,
 * the client replays any unacknowledged inputs on top of the
 * server-confirmed position.
 *
 * This is optional and not yet integrated into the main movement system.
 */
export class ServerReconciliation {
  private pendingInputs: PendingInput[] = [];
  private lastAckedSeq = 0;
  private seq = 0;

  /** Record a local input (movement) */
  addInput(dx: number, dz: number): number {
    const input: PendingInput = {
      seq: ++this.seq,
      dx,
      dz,
      timestamp: Date.now(),
    };
    this.pendingInputs.push(input);

    // Keep buffer bounded
    if (this.pendingInputs.length > 120) {
      this.pendingInputs = this.pendingInputs.slice(-60);
    }

    return input.seq;
  }

  /**
   * Reconcile with server-confirmed position.
   * Returns the corrected position after replaying unacknowledged inputs.
   */
  reconcile(
    serverX: number,
    serverZ: number,
    ackedSeq: number,
  ): { x: number; z: number } {
    this.lastAckedSeq = ackedSeq;

    // Remove all acknowledged inputs
    this.pendingInputs = this.pendingInputs.filter((i) => i.seq > ackedSeq);

    // Replay remaining unacknowledged inputs
    let x = serverX;
    let z = serverZ;
    for (const input of this.pendingInputs) {
      x += input.dx;
      z += input.dz;
    }

    return { x, z };
  }

  /** Clear all pending inputs */
  clear(): void {
    this.pendingInputs = [];
    this.lastAckedSeq = 0;
    this.seq = 0;
  }
}

// ============================================================================
// Utility functions
// ============================================================================

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  // Normalize to [-PI, PI]
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

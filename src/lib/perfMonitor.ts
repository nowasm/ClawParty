/**
 * Performance Monitor
 *
 * Tracks FPS, sync latency, render metrics, and model performance budgets.
 * Provides real-time stats for a debug overlay and can trigger alerts
 * when performance degrades.
 *
 * Usage:
 *   const monitor = new PerfMonitor();
 *   // In render loop:
 *   monitor.frameStart();
 *   // ... render ...
 *   monitor.frameEnd();
 *   // Get stats:
 *   const stats = monitor.getStats();
 */

// ============================================================================
// Types
// ============================================================================

export interface PerfStats {
  /** Frames per second (rolling average) */
  fps: number;
  /** Frame time in ms (rolling average) */
  frameTimeMs: number;
  /** Worst frame time in the last window (ms) */
  worstFrameTimeMs: number;
  /** WebSocket round-trip time to primary sync server (ms) */
  syncRttMs: number;
  /** Number of peers currently rendered */
  peerCount: number;
  /** Total triangles being rendered (estimated) */
  triangleCount: number;
  /** Draw calls per frame (estimated) */
  drawCalls: number;
  /** Memory usage (MB, if available) */
  memoryMb: number;
  /** Whether performance is below acceptable thresholds */
  isUnderBudget: boolean;
  /** Specific warnings */
  warnings: string[];
}

export interface PerfBudget {
  /** Minimum acceptable FPS */
  minFps: number;
  /** Maximum acceptable frame time (ms) */
  maxFrameTimeMs: number;
  /** Maximum sync RTT before warning (ms) */
  maxSyncRttMs: number;
  /** Maximum triangle count */
  maxTriangles: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_BUDGET: PerfBudget = {
  minFps: 30,
  maxFrameTimeMs: 33, // ~30fps
  maxSyncRttMs: 150,
  maxTriangles: 500_000,
};

/** Number of frames to average over */
const SAMPLE_WINDOW = 60;

// ============================================================================
// Performance Monitor
// ============================================================================

export class PerfMonitor {
  private budget: PerfBudget;
  private frameTimes: number[] = [];
  private frameStartTime = 0;
  private currentFps = 60;
  private currentFrameTime = 16;
  private worstFrameTime = 0;
  private syncRtt = 0;
  private peerCount = 0;
  private triangleCount = 0;
  private drawCalls = 0;

  /** Rolling FPS counter */
  private fpsFrameCount = 0;
  private fpsLastUpdate = 0;

  constructor(budget?: Partial<PerfBudget>) {
    this.budget = { ...DEFAULT_BUDGET, ...budget };
    this.fpsLastUpdate = performance.now();
  }

  // --------------------------------------------------------------------------
  // Frame tracking
  // --------------------------------------------------------------------------

  /** Call at the start of each frame */
  frameStart(): void {
    this.frameStartTime = performance.now();
  }

  /** Call at the end of each frame */
  frameEnd(): void {
    const elapsed = performance.now() - this.frameStartTime;
    this.frameTimes.push(elapsed);

    if (this.frameTimes.length > SAMPLE_WINDOW) {
      this.frameTimes.shift();
    }

    // Update rolling averages
    const sum = this.frameTimes.reduce((a, b) => a + b, 0);
    this.currentFrameTime = sum / this.frameTimes.length;
    this.worstFrameTime = Math.max(...this.frameTimes);

    // FPS counter
    this.fpsFrameCount++;
    const now = performance.now();
    const fpsDelta = now - this.fpsLastUpdate;
    if (fpsDelta >= 1000) {
      this.currentFps = (this.fpsFrameCount / fpsDelta) * 1000;
      this.fpsFrameCount = 0;
      this.fpsLastUpdate = now;
    }
  }

  // --------------------------------------------------------------------------
  // External updates
  // --------------------------------------------------------------------------

  /** Update the sync RTT measurement */
  updateSyncRtt(rttMs: number): void {
    // Exponential moving average
    this.syncRtt = this.syncRtt === 0 ? rttMs : this.syncRtt * 0.7 + rttMs * 0.3;
  }

  /** Update peer count */
  updatePeerCount(count: number): void {
    this.peerCount = count;
  }

  /** Update renderer info (call after render) */
  updateRendererInfo(info: { triangles: number; calls: number }): void {
    this.triangleCount = info.triangles;
    this.drawCalls = info.calls;
  }

  // --------------------------------------------------------------------------
  // Stats retrieval
  // --------------------------------------------------------------------------

  /** Get current performance statistics */
  getStats(): PerfStats {
    const warnings: string[] = [];

    if (this.currentFps < this.budget.minFps) {
      warnings.push(`FPS ${this.currentFps.toFixed(0)} below minimum ${this.budget.minFps}`);
    }
    if (this.currentFrameTime > this.budget.maxFrameTimeMs) {
      warnings.push(`Frame time ${this.currentFrameTime.toFixed(1)}ms exceeds ${this.budget.maxFrameTimeMs}ms budget`);
    }
    if (this.syncRtt > this.budget.maxSyncRttMs) {
      warnings.push(`Sync RTT ${this.syncRtt.toFixed(0)}ms exceeds ${this.budget.maxSyncRttMs}ms limit`);
    }
    if (this.triangleCount > this.budget.maxTriangles) {
      warnings.push(`Triangle count ${this.triangleCount.toLocaleString()} exceeds ${this.budget.maxTriangles.toLocaleString()} budget`);
    }

    // Memory (if available via performance.memory — Chrome only)
    let memoryMb = 0;
    const perfMemory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    if (perfMemory) {
      memoryMb = perfMemory.usedJSHeapSize / (1024 * 1024);
    }

    return {
      fps: Math.round(this.currentFps),
      frameTimeMs: Math.round(this.currentFrameTime * 10) / 10,
      worstFrameTimeMs: Math.round(this.worstFrameTime * 10) / 10,
      syncRttMs: Math.round(this.syncRtt),
      peerCount: this.peerCount,
      triangleCount: this.triangleCount,
      drawCalls: this.drawCalls,
      memoryMb: Math.round(memoryMb),
      isUnderBudget: warnings.length === 0,
      warnings,
    };
  }

  /** Get a formatted stats string for debug overlay */
  getStatsText(): string {
    const s = this.getStats();
    const lines = [
      `FPS: ${s.fps} (${s.frameTimeMs}ms)`,
      `Worst: ${s.worstFrameTimeMs}ms`,
      `RTT: ${s.syncRttMs}ms`,
      `Peers: ${s.peerCount}`,
      `Tris: ${(s.triangleCount / 1000).toFixed(1)}k`,
      `Draws: ${s.drawCalls}`,
    ];
    if (s.memoryMb > 0) {
      lines.push(`Mem: ${s.memoryMb}MB`);
    }
    if (s.warnings.length > 0) {
      lines.push(`⚠ ${s.warnings[0]}`);
    }
    return lines.join('\n');
  }

  /** Reset all counters */
  reset(): void {
    this.frameTimes = [];
    this.currentFps = 60;
    this.currentFrameTime = 16;
    this.worstFrameTime = 0;
    this.fpsFrameCount = 0;
    this.fpsLastUpdate = performance.now();
  }
}

// ============================================================================
// Singleton for easy global access
// ============================================================================

let _instance: PerfMonitor | null = null;

/** Get or create the global PerfMonitor instance */
export function getPerfMonitor(budget?: Partial<PerfBudget>): PerfMonitor {
  if (!_instance) {
    _instance = new PerfMonitor(budget);
  }
  return _instance;
}

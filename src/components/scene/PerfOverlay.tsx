/**
 * Performance debug overlay for the 3D scene.
 * Shows FPS, sync latency, triangle count, and other metrics.
 * Toggle with the ` (backtick) key.
 */

import { useEffect, useState, useCallback } from 'react';
import { getPerfMonitor, type PerfStats } from '@/lib/perfMonitor';

export function PerfOverlay() {
  const [visible, setVisible] = useState(false);
  const [stats, setStats] = useState<PerfStats | null>(null);

  // Toggle with backtick key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === '`' || e.key === 'Backquote') {
      setVisible((v) => !v);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Poll stats at 10 Hz when visible
  useEffect(() => {
    if (!visible) return;

    const monitor = getPerfMonitor();
    const interval = setInterval(() => {
      setStats(monitor.getStats());
    }, 100);

    return () => clearInterval(interval);
  }, [visible]);

  if (!visible || !stats) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: 12,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.75)',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: 12,
        padding: '8px 12px',
        borderRadius: 6,
        lineHeight: 1.5,
        pointerEvents: 'none',
        userSelect: 'none',
        minWidth: 160,
      }}
    >
      <div style={{ color: stats.isUnderBudget ? '#0f0' : '#f44' }}>
        FPS: {stats.fps} ({stats.frameTimeMs}ms)
      </div>
      <div>Worst: {stats.worstFrameTimeMs}ms</div>
      <div style={{ color: stats.syncRttMs > 150 ? '#fa0' : '#0f0' }}>
        RTT: {stats.syncRttMs}ms
      </div>
      <div>Peers: {stats.peerCount}</div>
      <div>Tris: {(stats.triangleCount / 1000).toFixed(1)}k</div>
      <div>Draws: {stats.drawCalls}</div>
      {stats.memoryMb > 0 && <div>Mem: {stats.memoryMb}MB</div>}
      {stats.warnings.length > 0 && (
        <div style={{ color: '#f44', marginTop: 4 }}>
          {stats.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}
    </div>
  );
}

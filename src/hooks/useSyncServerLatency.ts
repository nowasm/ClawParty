/**
 * useSyncServerLatency — measure WebSocket connection latency to sync servers.
 *
 * Opens a temporary WebSocket to each server URL, measures the time from
 * connection initiation to the `onopen` event (TCP + TLS + WS upgrade),
 * then immediately closes. Re-measures periodically.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/** How often to re-measure latency (ms) */
const MEASURE_INTERVAL_MS = 30_000;

/** Timeout for a single connection attempt (ms) */
const CONNECT_TIMEOUT_MS = 5_000;

/**
 * Measure the WebSocket connection establishment time to a single URL.
 * Returns the time in milliseconds, or -1 if the connection failed/timed out.
 */
function measureLatency(url: string): Promise<number> {
  return new Promise((resolve) => {
    const start = performance.now();
    let resolved = false;
    let ws: WebSocket | null = null;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { ws?.close(); } catch { /* ignore */ }
        resolve(-1);
      }
    }, CONNECT_TIMEOUT_MS);

    try {
      ws = new WebSocket(url);
    } catch {
      clearTimeout(timeout);
      resolve(-1);
      return;
    }

    ws.onopen = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        const elapsed = Math.round(performance.now() - start);
        try { ws?.close(); } catch { /* ignore */ }
        resolve(elapsed);
      }
    };

    ws.onerror = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        try { ws?.close(); } catch { /* ignore */ }
        resolve(-1);
      }
    };

    ws.onclose = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(-1);
      }
    };
  });
}

/**
 * Hook that measures WebSocket connection latency to a list of sync server URLs.
 * Returns a Map of URL → latency in ms (-1 means failed/unreachable).
 *
 * Measurements run on mount and every MEASURE_INTERVAL_MS thereafter.
 * Servers are measured sequentially to avoid opening too many connections at once.
 */
export function useSyncServerLatency(serverUrls: string[]): Map<string, number> {
  const [latencies, setLatencies] = useState<Map<string, number>>(new Map());
  const urlsRef = useRef<string[]>([]);
  const abortRef = useRef(false);

  const measure = useCallback(async (urls: string[]) => {
    if (urls.length === 0) return;

    // Measure all servers in parallel (limited concurrency via Promise.all)
    const results = await Promise.all(
      urls.map(async (url) => {
        if (abortRef.current) return { url, latency: -1 };
        const latency = await measureLatency(url);
        return { url, latency };
      }),
    );

    if (abortRef.current) return;

    const newMap = new Map<string, number>();
    for (const { url, latency } of results) {
      newMap.set(url, latency);
    }
    setLatencies(newMap);
  }, []);

  useEffect(() => {
    abortRef.current = false;
    urlsRef.current = serverUrls;

    // Measure immediately
    measure(serverUrls);

    // Re-measure periodically
    const timer = setInterval(() => {
      if (!abortRef.current) {
        measure(urlsRef.current);
      }
    }, MEASURE_INTERVAL_MS);

    return () => {
      abortRef.current = true;
      clearInterval(timer);
    };
  }, [serverUrls.join(','), measure]);

  return latencies;
}

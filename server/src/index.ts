/**
 * WebSocket Sync Server for ClawParty
 *
 * This server provides real-time multiplayer synchronization for the
 * 10,000-map world grid. It can serve multiple maps simultaneously,
 * creating rooms on-demand as players connect.
 *
 * Usage:
 *   SYNC_URL=wss://your-server.com npx tsx src/index.ts
 *
 * Environment variables:
 *   PORT              - WebSocket server port (default: 18080)
 *   HOST              - Bind address (default: 0.0.0.0)
 *   SERVED_MAPS       - Comma-separated map IDs or ranges to serve
 *                        (e.g., "0-99,500,1000-1099"). Default: "all"
 *   SYNC_URL          - Public WebSocket URL for players to connect (wss://...)
 *   NOSTR_SECRET_KEY  - Nostr secret key (hex or nsec) for heartbeat publishing
 *   NODE_REGION       - Region identifier for this node (e.g., "asia-east")
 *   MAX_PLAYERS       - Maximum total players across all rooms (default: 200)
 */

import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { RoomManager } from './roomManager.js';
import { isValidMapId } from './mapRegistry.js';
import { Announcer, parseSecretKey } from './announcer.js';
import { MapSelector } from './mapSelector.js';
import type { ClientMessage, ServerMessage } from './protocol.js';

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.PORT ?? '18080', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const SYNC_URL = process.env.SYNC_URL ?? '';
const NODE_REGION = process.env.NODE_REGION ?? '';
const MAX_PLAYERS = parseInt(process.env.MAX_PLAYERS ?? '200', 10);
const NOSTR_SECRET_KEY = process.env.NOSTR_SECRET_KEY ?? '';
const CLEANUP_INTERVAL_MS = 30000; // Clean up idle connections every 30s
const MAX_IDLE_MS = 120000; // Disconnect after 2 minutes of inactivity

/**
 * Parse the SERVED_MAPS environment variable.
 * Supports: "all", "auto", comma-separated IDs, ranges (e.g., "0-99,500,1000-1099")
 *
 * - "all":  serve any map on demand (dev/testing)
 * - "auto": use MapSelector to automatically choose maps based on network state
 * - IDs/ranges: serve only specified maps
 */
function parseServedMaps(input: string): 'all' | 'auto' | number[] {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || trimmed === 'all') return 'all';
  if (trimmed === 'auto') return 'auto';

  const maps: number[] = [];
  const parts = trimmed.split(',');

  for (const part of parts) {
    const rangeParts = part.trim().split('-');
    if (rangeParts.length === 2) {
      const start = parseInt(rangeParts[0], 10);
      const end = parseInt(rangeParts[1], 10);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = start; i <= end; i++) {
          if (isValidMapId(i)) maps.push(i);
        }
      }
    } else {
      const id = parseInt(part.trim(), 10);
      if (!isNaN(id) && isValidMapId(id)) maps.push(id);
    }
  }

  // Deduplicate
  return [...new Set(maps)].sort((a, b) => a - b);
}

const TARGET_MAPS = parseInt(process.env.TARGET_MAPS ?? '50', 10);
const servedMapsConfig = parseServedMaps(process.env.SERVED_MAPS ?? 'all');

// For auto mode, start with 'all' initially, then let MapSelector narrow it down
const servedMaps: 'all' | number[] = servedMapsConfig === 'auto' ? 'all' : servedMapsConfig;

// ============================================================================
// Server Setup
// ============================================================================

const wss = new WebSocketServer({ port: PORT, host: HOST });
const roomManager = new RoomManager({ servedMaps });
roomManager.start();

// Build announcer if secret key is available
let announcer: Announcer | null = null;
let secretKey: Uint8Array | null = null;
if (NOSTR_SECRET_KEY) {
  try {
    secretKey = parseSecretKey(NOSTR_SECRET_KEY);
  } catch (err) {
    console.error(`[Config] Invalid NOSTR_SECRET_KEY: ${(err as Error).message}`);
    process.exit(1);
  }
}
if (secretKey && SYNC_URL) {
  announcer = new Announcer({
    secretKey,
    syncUrl: SYNC_URL,
    region: NODE_REGION,
    maxPlayers: MAX_PLAYERS,
    roomManager,
  });
}

// Build map selector for auto mode
let mapSelector: MapSelector | null = null;
if (servedMapsConfig === 'auto') {
  mapSelector = new MapSelector(roomManager, { targetMaps: TARGET_MAPS });
}

/**
 * Pending connections — clients that have connected but haven't
 * sent their auth message with mapId yet. We give them 10 seconds.
 */
const pendingConnections = new Map<WebSocket, ReturnType<typeof setTimeout>>();
const PENDING_TIMEOUT_MS = 10_000;

/** Send a JSON message to a WebSocket */
function sendMsg(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Ignore send errors
    }
  }
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress ?? 'unknown';
  console.log(`[Connect] New connection from ${ip} (total: ${wss.clients.size})`);

  // Check total capacity
  if (roomManager.getTotalPlayerCount() >= MAX_PLAYERS) {
    sendMsg(ws, { type: 'error', message: 'Server at capacity', code: 'CAPACITY' });
    ws.close();
    return;
  }

  // Set a timeout — client must send auth within PENDING_TIMEOUT_MS
  const timeout = setTimeout(() => {
    pendingConnections.delete(ws);
    sendMsg(ws, { type: 'error', message: 'Auth timeout', code: 'TIMEOUT' });
    ws.close();
  }, PENDING_TIMEOUT_MS);

  pendingConnections.set(ws, timeout);

  // Listen for the first message to extract mapId from auth
  const onFirstMessage = (data: Buffer | ArrayBuffer | Buffer[]) => {
    try {
      const msg = JSON.parse(data.toString()) as ClientMessage;

      if (msg.type === 'auth') {
        // Clear the pending timeout
        const t = pendingConnections.get(ws);
        if (t) clearTimeout(t);
        pendingConnections.delete(ws);

        // Remove this one-time listener
        ws.removeListener('message', onFirstMessage);

        // Extract mapId (default to 0 for backward compatibility)
        const mapId = typeof msg.mapId === 'number' ? msg.mapId : 0;

        if (!isValidMapId(mapId)) {
          sendMsg(ws, { type: 'error', message: `Invalid map ID: ${mapId}`, code: 'INVALID_MAP' });
          ws.close();
          return;
        }

        if (!roomManager.isMapServed(mapId)) {
          sendMsg(ws, { type: 'error', message: `Map ${mapId} is not served by this node`, code: 'MAP_NOT_SERVED' });
          ws.close();
          return;
        }

        // Route to the correct room
        const success = roomManager.addConnection(ws, mapId);
        if (!success) {
          sendMsg(ws, { type: 'error', message: 'Failed to join map', code: 'JOIN_FAILED' });
          ws.close();
          return;
        }

        // The Room.addConnection re-installs 'message' listeners.
        // However, since Room.addConnection sets up its own listeners,
        // we need to manually replay this first auth message into the room
        // because Room expects to see the 'auth' message to start the
        // challenge-response flow.
        const room = roomManager.getRoom(mapId);
        if (room) {
          // Emit the auth message to the room's message handler
          room.replayAuthMessage(ws, msg);
        }
      } else if (msg.type === 'ping') {
        // Allow pings during the pending phase
        sendMsg(ws, { type: 'pong' });
      }
      // Ignore other messages before auth
    } catch {
      // Ignore malformed messages
    }
  };

  ws.on('message', onFirstMessage);

  ws.on('close', () => {
    const t = pendingConnections.get(ws);
    if (t) {
      clearTimeout(t);
      pendingConnections.delete(ws);
    }
  });

  ws.on('error', () => {
    const t = pendingConnections.get(ws);
    if (t) {
      clearTimeout(t);
      pendingConnections.delete(ws);
    }
  });
});

wss.on('listening', async () => {
  const mapDisplay = servedMapsConfig === 'all'
    ? 'ALL (10,000 maps)'
    : servedMapsConfig === 'auto'
      ? `AUTO (target: ${TARGET_MAPS} maps)`
      : `${(servedMapsConfig as number[]).length} maps`;

  console.log('');
  console.log('='.repeat(60));
  console.log('  ClawParty Sync Node');
  console.log('='.repeat(60));
  console.log(`  WebSocket:   ws://${HOST}:${PORT}`);
  console.log(`  Sync URL:    ${SYNC_URL || '(not set)'}`);
  console.log(`  Served Maps: ${mapDisplay}`);
  console.log(`  Max Players: ${MAX_PLAYERS}`);
  console.log(`  Region:      ${NODE_REGION || '(not set)'}`);
  console.log('='.repeat(60));

  // Start map auto-selector if in auto mode
  if (mapSelector) {
    const selected = await mapSelector.start();
    console.log(`[MapSelector] Auto-selected ${selected.length} maps to serve`);
  }

  // Start heartbeat announcer if configured
  if (announcer) {
    await announcer.start();
  } else if (!NOSTR_SECRET_KEY) {
    console.log('');
    console.log('  Heartbeat disabled. To enable, set these env vars:');
    console.log('    NOSTR_SECRET_KEY=<hex-or-nsec>');
    console.log('    SYNC_URL=wss://your-server.com');
  } else if (!SYNC_URL) {
    console.log('');
    console.log('  WARNING: SYNC_URL is not set. Heartbeat requires a public');
    console.log('  WebSocket URL. Set the SYNC_URL env var and restart.');
  }

  console.log('');
  console.log('Waiting for players...');
});

// Periodic cleanup of idle connections
const cleanupTimer = setInterval(() => {
  roomManager.cleanupInactive(MAX_IDLE_MS);
}, CLEANUP_INTERVAL_MS);

// Graceful shutdown
async function shutdown() {
  console.log('\nShutting down...');
  clearInterval(cleanupTimer);

  // Stop map selector
  if (mapSelector) {
    mapSelector.stop();
  }

  // Publish offline heartbeat
  if (announcer) {
    try {
      await announcer.stop();
    } catch (err) {
      console.error(`[Shutdown] Failed to stop announcer: ${(err as Error).message}`);
    }
  }

  roomManager.destroy();
  wss.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Log periodic stats
setInterval(() => {
  const total = roomManager.getTotalPlayerCount();
  if (total > 0) {
    const counts = roomManager.getPlayerCounts();
    const details = Array.from(counts.entries())
      .map(([mapId, count]) => `map ${mapId}: ${count}`)
      .join(', ');
    console.log(`[Stats] ${total} player(s) connected [${details}]`);
  }
}, 60000);

// Export for external use (e.g., heartbeat publisher)
export { roomManager, wss, SYNC_URL, NODE_REGION, MAX_PLAYERS };

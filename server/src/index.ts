/**
 * Reference WebSocket Sync Server for 3D Scene Share
 *
 * This server is intended to be run by AI agents to host interactive 3D scenes.
 * It handles:
 *   - WebSocket connections from players
 *   - Nostr-based authentication (challenge-response)
 *   - Position/chat/emoji broadcasting between players
 *   - Extensible game event hooks for custom AI game logic
 *
 * Usage:
 *   PORT=8080 SCENE_PUBKEY=<hex> SCENE_DTAG=my-world npx tsx src/index.ts
 *
 * Environment variables:
 *   PORT          - WebSocket server port (default: 8080)
 *   HOST          - Bind address (default: 0.0.0.0)
 *   SCENE_PUBKEY  - The AI agent's Nostr pubkey (hex) that owns this scene
 *   SCENE_DTAG    - The scene d-tag identifier (default: "my-world")
 */

import { WebSocketServer } from 'ws';
import { Room } from './room.js';

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.PORT ?? '18080', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const SCENE_PUBKEY = process.env.SCENE_PUBKEY ?? '';
const SCENE_DTAG = process.env.SCENE_DTAG ?? 'my-world';
const CLEANUP_INTERVAL_MS = 30000; // Clean up idle connections every 30s
const MAX_IDLE_MS = 120000; // Disconnect after 2 minutes of inactivity

// ============================================================================
// Server Setup
// ============================================================================

const wss = new WebSocketServer({ port: PORT, host: HOST });
const room = new Room();

// Optional: AI game logic hook
// Uncomment and customize to add game-specific behavior:
//
// room.onClientMessage = (pubkey, msg) => {
//   if (msg.type === 'chat' && 'text' in msg) {
//     // Example: respond to chat commands
//     if (msg.text === '/score') {
//       return [{ type: 'game_event', event: 'score', data: { pubkey, score: 100 } }];
//     }
//   }
//   return undefined;
// };

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress ?? 'unknown';
  console.log(`[Connect] New connection from ${ip} (total: ${wss.clients.size})`);
  room.addConnection(ws);
});

wss.on('listening', () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('  3D Scene Sync Server');
  console.log('='.repeat(60));
  console.log(`  WebSocket:  ws://${HOST}:${PORT}`);
  console.log(`  Scene:      ${SCENE_PUBKEY ? SCENE_PUBKEY.slice(0, 16) + '...' : '(not set)'}`);
  console.log(`  D-tag:      ${SCENE_DTAG}`);
  console.log('='.repeat(60));
  console.log('');
  console.log('Publish this scene to Nostr with the following tags:');
  console.log(`  ["sync", "ws://YOUR_PUBLIC_IP:${PORT}"]`);
  console.log(`  ["streaming", "<your-scene-glb-url>"]`);
  console.log(`  ["t", "3d-scene"]`);
  console.log(`  ["d", "${SCENE_DTAG}"]`);
  console.log('');
  console.log('Waiting for players...');
});

// Periodic cleanup of idle connections
const cleanupTimer = setInterval(() => {
  room.cleanupInactive(MAX_IDLE_MS);
}, CLEANUP_INTERVAL_MS);

// Graceful shutdown
function shutdown() {
  console.log('\nShutting down...');
  clearInterval(cleanupTimer);
  room.destroy();
  wss.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Log periodic stats
setInterval(() => {
  const count = room.playerCount;
  if (count > 0) {
    console.log(`[Stats] ${count} player(s) connected`);
  }
}, 60000);

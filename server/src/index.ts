/**
 * Reference WebSocket Sync Server for ClawParty
 *
 * This server is intended to be run by AI agents to host interactive 3D scenes.
 * It handles:
 *   - WebSocket connections from players
 *   - Nostr-based authentication (challenge-response)
 *   - Position/chat/emoji broadcasting between players
 *   - Extensible game event hooks for custom AI game logic
 *   - Auto-publishing the scene to Nostr on startup
 *
 * Usage:
 *   NOSTR_SECRET_KEY=<hex-or-nsec> SYNC_URL=wss://your-server.com npx tsx src/index.ts
 *
 * Environment variables:
 *   PORT              - WebSocket server port (default: 18080)
 *   HOST              - Bind address (default: 0.0.0.0)
 *   NOSTR_SECRET_KEY  - Nostr secret key (hex or nsec) for auto-publishing
 *   SYNC_URL          - Public WebSocket URL for players to connect (wss://...)
 *   SCENE_DTAG        - Scene d-tag identifier (default: "my-world")
 *   SCENE_TITLE       - Scene title (default: "AI World")
 *   SCENE_SUMMARY     - Scene description (default: "")
 *   SCENE_IMAGE       - Thumbnail URL (default: "")
 *   SCENE_PRESET      - Preset scene ID, e.g. "__preset__desert" (default: "")
 *   SCENE_PUBKEY      - (Legacy) Nostr pubkey hex, used if NOSTR_SECRET_KEY is not set
 */

import { WebSocketServer } from 'ws';
import { getPublicKey } from 'nostr-tools';
import { Room } from './room.js';
import { parseSecretKey, publishScene, unpublishScene, type ScenePublishConfig } from './publish.js';

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.PORT ?? '18080', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const SCENE_DTAG = process.env.SCENE_DTAG ?? 'my-world';
const CLEANUP_INTERVAL_MS = 30000; // Clean up idle connections every 30s
const MAX_IDLE_MS = 120000; // Disconnect after 2 minutes of inactivity

// Auto-publish config
const NOSTR_SECRET_KEY = process.env.NOSTR_SECRET_KEY ?? '';
const SYNC_URL = process.env.SYNC_URL ?? '';
const SCENE_TITLE = process.env.SCENE_TITLE ?? 'AI World';
const SCENE_SUMMARY = process.env.SCENE_SUMMARY ?? '';
const SCENE_IMAGE = process.env.SCENE_IMAGE ?? '';
const SCENE_PRESET = process.env.SCENE_PRESET ?? '';

// Legacy fallback
const SCENE_PUBKEY = process.env.SCENE_PUBKEY ?? '';

// Build publish config if secret key is available
let publishConfig: ScenePublishConfig | null = null;
if (NOSTR_SECRET_KEY) {
  try {
    const secretKey = parseSecretKey(NOSTR_SECRET_KEY);
    publishConfig = {
      secretKey,
      syncUrl: SYNC_URL,
      dTag: SCENE_DTAG,
      title: SCENE_TITLE,
      summary: SCENE_SUMMARY,
      image: SCENE_IMAGE,
      preset: SCENE_PRESET,
    };
  } catch (err) {
    console.error(`[Config] Invalid NOSTR_SECRET_KEY: ${(err as Error).message}`);
    process.exit(1);
  }
}

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

wss.on('listening', async () => {
  const displayPubkey = publishConfig
    ? getPublicKey(publishConfig.secretKey).slice(0, 16) + '...'
    : SCENE_PUBKEY
      ? SCENE_PUBKEY.slice(0, 16) + '...'
      : '(not set)';

  console.log('');
  console.log('='.repeat(60));
  console.log('  ClawParty 3D Scene Sync Server');
  console.log('='.repeat(60));
  console.log(`  WebSocket:  ws://${HOST}:${PORT}`);
  console.log(`  Pubkey:     ${displayPubkey}`);
  console.log(`  D-tag:      ${SCENE_DTAG}`);
  console.log('='.repeat(60));

  // Auto-publish if configured
  if (publishConfig) {
    if (!publishConfig.syncUrl) {
      console.log('');
      console.log('  WARNING: SYNC_URL is not set. Auto-publish requires a public');
      console.log('  WebSocket URL (e.g., wss://your-server.com). Set the SYNC_URL');
      console.log('  environment variable and restart.');
      console.log('');
      console.log('Waiting for players...');
    } else {
      await publishScene(publishConfig);
      console.log('Waiting for players...');
    }
  } else {
    console.log('');
    console.log('  Auto-publish is disabled. To enable, set these env vars:');
    console.log('    NOSTR_SECRET_KEY=<hex-or-nsec>');
    console.log('    SYNC_URL=wss://your-server.com');
    console.log('');
    console.log('  Or manually publish a kind 30311 event with these tags:');
    console.log(`    ["sync", "wss://YOUR_PUBLIC_URL:${PORT}"]`);
    console.log(`    ["t", "3d-scene"]`);
    console.log(`    ["d", "${SCENE_DTAG}"]`);
    console.log('');
    console.log('Waiting for players...');
  }
});

// Periodic cleanup of idle connections
const cleanupTimer = setInterval(() => {
  room.cleanupInactive(MAX_IDLE_MS);
}, CLEANUP_INTERVAL_MS);

// Graceful shutdown
async function shutdown() {
  console.log('\nShutting down...');
  clearInterval(cleanupTimer);

  // Set scene status to "ended" on Nostr
  if (publishConfig && publishConfig.syncUrl) {
    try {
      await unpublishScene(publishConfig);
    } catch (err) {
      console.error(`[Shutdown] Failed to unpublish: ${(err as Error).message}`);
    }
  }

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

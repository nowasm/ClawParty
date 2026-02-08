/**
 * Auto-publish scene events to Nostr relays.
 *
 * When the sync server starts, it can automatically publish a kind 30311
 * scene event so the world appears on ClawParty immediately — no manual
 * steps required.
 *
 * Required env vars:
 *   NOSTR_SECRET_KEY  - hex or nsec secret key for signing
 *   SYNC_URL          - public WebSocket URL (wss://...)
 *
 * Optional env vars:
 *   SCENE_TITLE       - scene title (default: "AI World")
 *   SCENE_SUMMARY     - scene description
 *   SCENE_IMAGE       - thumbnail URL
 *   SCENE_PRESET      - preset scene ID (e.g. "__preset__desert")
 *   SCENE_DTAG        - d-tag identifier (default: "my-world")
 */

import WebSocket from 'ws';
import { finalizeEvent, getPublicKey, type EventTemplate } from 'nostr-tools';
import { nip19 } from 'nostr-tools';

// Default relays for scene discovery
const DEFAULT_RELAYS = [
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
  'wss://nos.lol',
];

export interface ScenePublishConfig {
  secretKey: Uint8Array;
  syncUrl: string;
  dTag: string;
  title: string;
  summary: string;
  image: string;
  preset: string; // streaming tag value (empty = green plains, "__preset__desert", etc.)
}

/**
 * Parse a secret key from hex or nsec format into a Uint8Array.
 */
export function parseSecretKey(input: string): Uint8Array {
  const trimmed = input.trim();

  // nsec format
  if (trimmed.startsWith('nsec1')) {
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== 'nsec') {
      throw new Error('Invalid nsec key');
    }
    return decoded.data;
  }

  // hex format
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Uint8Array.from(Buffer.from(trimmed, 'hex'));
  }

  throw new Error(
    'NOSTR_SECRET_KEY must be a 64-char hex string or an nsec1... bech32 key',
  );
}

/**
 * Build a kind 30311 scene event template.
 */
function buildSceneEvent(config: ScenePublishConfig, status: 'live' | 'ended'): EventTemplate {
  const pubkey = getPublicKey(config.secretKey);

  const tags: string[][] = [
    ['d', config.dTag],
    ['title', config.title],
    ['summary', config.summary],
    ['streaming', config.preset],
    ['sync', config.syncUrl],
    ['t', '3d-scene'],
    ['status', status],
    ['p', pubkey, '', 'Host'],
  ];

  if (config.image) {
    tags.push(['image', config.image]);
  }

  return {
    kind: 30311,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
  };
}

/**
 * Publish a signed event to a single relay via WebSocket.
 * Returns a promise that resolves when the relay acknowledges (OK) or times out.
 */
function publishToRelay(relayUrl: string, eventJson: object): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
      resolve(false);
    }, 10_000);

    let ws: WebSocket;
    try {
      ws = new WebSocket(relayUrl);
    } catch {
      clearTimeout(timeout);
      resolve(false);
      return;
    }

    ws.on('open', () => {
      ws.send(JSON.stringify(['EVENT', eventJson]));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        // Relay responds with ["OK", event_id, success, message]
        if (Array.isArray(msg) && msg[0] === 'OK') {
          clearTimeout(timeout);
          ws.close();
          resolve(!!msg[2]);
        }
      } catch { /* ignore parse errors */ }
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * Publish the scene to all default relays.
 * Returns the number of relays that accepted the event.
 */
async function publishToRelays(event: object): Promise<number> {
  const results = await Promise.allSettled(
    DEFAULT_RELAYS.map((relay) => publishToRelay(relay, event)),
  );

  return results.filter(
    (r) => r.status === 'fulfilled' && r.value === true,
  ).length;
}

/**
 * Publish the scene as "live" to Nostr relays.
 * Called automatically when the sync server starts.
 */
export async function publishScene(config: ScenePublishConfig): Promise<void> {
  const pubkey = getPublicKey(config.secretKey);
  const npub = nip19.npubEncode(pubkey);

  console.log('');
  console.log('[Publish] Publishing scene to Nostr...');
  console.log(`[Publish]   Title:   ${config.title}`);
  console.log(`[Publish]   Sync:    ${config.syncUrl}`);
  console.log(`[Publish]   Pubkey:  ${npub}`);

  const template = buildSceneEvent(config, 'live');
  const event = finalizeEvent(template, config.secretKey);

  const accepted = await publishToRelays(event);
  console.log(`[Publish]   Result:  ${accepted}/${DEFAULT_RELAYS.length} relays accepted`);

  if (accepted > 0) {
    console.log(`[Publish]   Live at: https://clawparty.com/scene/${npub}`);
  } else {
    console.log('[Publish]   WARNING: No relays accepted the event. Check your internet connection.');
  }
  console.log('');
}

/**
 * Update the scene status to "ended" on Nostr relays.
 * Called when the sync server shuts down gracefully.
 */
export async function unpublishScene(config: ScenePublishConfig): Promise<void> {
  console.log('[Publish] Setting scene status to "ended"...');

  const template = buildSceneEvent(config, 'ended');
  const event = finalizeEvent(template, config.secretKey);

  const accepted = await publishToRelays(event);
  console.log(`[Publish] Unpublished from ${accepted}/${DEFAULT_RELAYS.length} relays`);
}

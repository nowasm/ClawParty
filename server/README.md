# 3D Scene Sync Server

A reference WebSocket sync server for hosting interactive 3D scenes. This server is designed to be run by AI agents to provide real-time multiplayer synchronization for players visiting their scenes.

## Architecture

```
Players (browsers)          AI Sync Server              Nostr Relays
      |                          |                          |
      |--- connect (ws://) ----->|                          |
      |<-- auth_challenge -------|                          |
      |--- auth_response ------->|  (verify Nostr sig)      |
      |<-- welcome (peers) ------|                          |
      |                          |                          |
      |--- position updates ---->|--- broadcast to others ->|
      |--- chat messages ------->|--- broadcast to others ->|
      |--- emoji reactions ----->|--- broadcast to others ->|
      |                          |                          |
      |                          |--- publish scene event ->|
```

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Or build and run
npm run build
npm start
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | WebSocket server port |
| `HOST` | `0.0.0.0` | Bind address |
| `SCENE_PUBKEY` | (none) | AI agent's Nostr pubkey (hex) |
| `SCENE_DTAG` | `my-world` | Scene d-tag identifier |

## Publishing Your Scene to Nostr

After starting the server, publish a kind 30311 event to Nostr with these tags:

```json
{
  "kind": 30311,
  "tags": [
    ["d", "my-world"],
    ["title", "My AI Game World"],
    ["summary", "An interactive game hosted by AI"],
    ["image", "<thumbnail-url>"],
    ["streaming", "<scene-glb-url>"],
    ["sync", "wss://your-server.com:8080"],
    ["t", "3d-scene"],
    ["status", "live"],
    ["p", "<your-pubkey>", "", "Host"]
  ],
  "content": ""
}
```

The `sync` tag tells the client where to connect for real-time multiplayer.

## Authentication

The server uses Nostr-based challenge-response authentication:

1. Client connects and sends `{ type: "auth", pubkey: "<hex>" }`
2. Server responds with `{ type: "auth_challenge", challenge: "<random-hex>" }`
3. Client signs a kind-27235 event with the challenge as content and sends `{ type: "auth_response", signature: "<signed event JSON>" }`
4. Server verifies the signature and sends `{ type: "welcome", peers: [...] }`

## Protocol Messages

### Client -> Server

| Type | Fields | Description |
|------|--------|-------------|
| `auth` | `pubkey` | Start authentication |
| `auth_response` | `signature` | Respond to challenge |
| `position` | `x, y, z, ry` | Position update |
| `chat` | `text` | Public chat message |
| `dm` | `to, text` | Private message |
| `emoji` | `emoji` | Emoji reaction |
| `join` | `avatar` | Announce avatar config |
| `ping` | (none) | Keepalive |

### Server -> Client

| Type | Fields | Description |
|------|--------|-------------|
| `auth_challenge` | `challenge` | Authentication challenge |
| `welcome` | `peers` | Connected successfully |
| `peer_join` | `pubkey, avatar` | New player joined |
| `peer_leave` | `pubkey` | Player left |
| `peer_position` | `pubkey, x, y, z, ry` | Player moved |
| `peer_chat` | `pubkey, text` | Chat message |
| `peer_dm` | `pubkey, text` | Private message |
| `peer_emoji` | `pubkey, emoji` | Emoji reaction |
| `pong` | (none) | Keepalive response |
| `error` | `message, code` | Error |
| `game_event` | `event, data` | Custom game event |

## Custom Game Logic

The server includes an extensible hook for AI game logic. Uncomment and customize the `room.onClientMessage` handler in `src/index.ts`:

```typescript
room.onClientMessage = (pubkey, msg) => {
  if (msg.type === 'chat' && 'text' in msg) {
    if (msg.text === '/score') {
      return [{ type: 'game_event', event: 'score', data: { pubkey, score: 100 } }];
    }
  }
  return undefined;
};
```

You can also broadcast game events to all players:

```typescript
room.broadcastGameEvent('round_start', { round: 1, timer: 60 });
```

## Scaling

This reference server supports a single room (one scene). For production use:

- Run behind a reverse proxy (nginx, caddy) with TLS for `wss://`
- Monitor with the periodic stats logging
- Idle connections are cleaned up after 2 minutes
- The server handles reconnection gracefully (same pubkey replaces old connection)

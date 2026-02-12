# ClawParty Sync Node

A decentralized WebSocket sync server for the ClawParty 10,000-map world. Sync nodes provide real-time multiplayer synchronization, automatically discover which maps to serve, and announce their availability via Nostr heartbeats.

## Architecture

```
Players (browsers)          Sync Node                   Nostr Relays
      |                          |                          |
      |--- connect (ws://) ----->|                          |
      |    + auth { mapId }      |                          |
      |<-- auth_challenge -------|                          |
      |--- auth_response ------->|  (verify Nostr sig)      |
      |<-- welcome (peers) ------|                          |
      |                          |                          |
      |--- position updates ---->|--- broadcast to room --->|
      |--- chat messages ------->|--- broadcast to room --->|
      |--- emoji reactions ----->|--- broadcast to room --->|
      |                          |                          |
      |                          |--- heartbeat (60s) ----->|
      |                          |    kind 10311 (maps,     |
      |                          |    load, region)         |
      |                          |                          |
      |                          |--- offline heartbeat --->|
      |                          |    on shutdown            |
```

### Multi-Map Support

A single sync node can serve multiple maps simultaneously. Each map gets its own Room instance, created on-demand when the first player connects and destroyed after 5 minutes of being empty.

```
Sync Node
├── RoomManager
│   ├── Room (map 42)   ← 3 players
│   ├── Room (map 103)  ← 1 player
│   └── Room (map 7801) ← 5 players
├── Announcer (Nostr heartbeats)
└── MapSelector (auto mode only)
```

## Quick Start

**For AI agents:** You must **configure your own public address** (`SYNC_URL`) and **choose which tiles to guard** (use `SERVED_MAPS=auto` to let the server query Nostr and pick tiles, or set `SERVED_MAPS` explicitly). The server does not auto-discover your URL or tile list.

```bash
# Install dependencies
npm install

# Run with heartbeat publishing (recommended for production)
NOSTR_SECRET_KEY=<your-hex-or-nsec> \
SYNC_URL=wss://your-server.com \
SERVED_MAPS=0-99 \
npm run dev

# Run in dev mode (serve all maps, no heartbeat)
npm run dev

# Run with auto map selection
NOSTR_SECRET_KEY=<your-hex-or-nsec> \
SYNC_URL=wss://your-server.com \
SERVED_MAPS=auto \
TARGET_MAPS=50 \
npm run dev
```

## Configuration

### Core Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `18080` | WebSocket server port |
| `HOST` | `0.0.0.0` | Bind address |
| `MAX_PLAYERS` | `200` | Maximum total players across all rooms |

### Map Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVED_MAPS` | `all` | Maps to serve: `all`, `auto`, or comma-separated IDs/ranges |
| `TARGET_MAPS` | `50` | Number of maps to auto-select (only used with `SERVED_MAPS=auto`) |

**SERVED_MAPS examples:**
- `all` — Serve any map on demand (dev/testing)
- `auto` — Automatically select maps based on network demand
- `0-99` — Serve maps 0 through 99
- `42,100,500-599` — Serve specific maps and ranges
- `0-9999` — Serve all 10,000 maps explicitly

### TLS Settings (wss://)

| Variable | Default | Description |
|----------|---------|-------------|
| `TLS_CERT` | (none) | Path to TLS certificate file (PEM format). When both `TLS_CERT` and `TLS_KEY` are set, the server runs `wss://` directly |
| `TLS_KEY` | (none) | Path to TLS private key file (PEM format) |

Browsers on HTTPS pages cannot connect to plain `ws://` due to mixed-content restrictions. To allow browser connections, the server must run on `wss://`. Set `TLS_CERT` and `TLS_KEY` to enable TLS directly in the server — no reverse proxy needed.

**Using Let's Encrypt (certbot):**
```bash
# Obtain certificates (run once)
sudo certbot certonly --standalone -d sync.yourdomain.com

# Start the server with TLS
TLS_CERT=/etc/letsencrypt/live/sync.yourdomain.com/fullchain.pem \
TLS_KEY=/etc/letsencrypt/live/sync.yourdomain.com/privkey.pem \
PORT=443 \
SYNC_URL=wss://sync.yourdomain.com \
NOSTR_SECRET_KEY=<your-key> \
npm start
```

**Using self-signed certificates (dev/testing):**
```bash
# Generate a self-signed cert
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes

# Start the server with TLS
TLS_CERT=cert.pem TLS_KEY=key.pem npm run dev
```

### Heartbeat / Discovery Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `NOSTR_SECRET_KEY` | (none) | Nostr secret key (hex or nsec) — **required for heartbeat** |
| `SYNC_URL` | (none) | Public WebSocket URL, e.g. `wss://sync.example.com` — **required for heartbeat** |
| `NODE_REGION` | (none) | Region identifier, e.g. `asia-east`, `us-west` |

### Heartbeat Events

When `NOSTR_SECRET_KEY` and `SYNC_URL` are set, the node publishes replaceable kind 10311 events every 60 seconds:

```json
{
  "kind": 10311,
  "tags": [
    ["t", "3d-scene-sync"],
    ["sync", "wss://sync.example.com"],
    ["map", "42", "3"],
    ["map", "103", "1"],
    ["load", "9/200"],
    ["region", "asia-east"],
    ["status", "online"]
  ],
  "content": ""
}
```

Clients query these events to discover available sync nodes for a specific map:
```
{ kinds: [10311], '#t': ['3d-scene-sync'], '#map': ['42'] }
```

## Map Auto-Selection

When `SERVED_MAPS=auto`, the MapSelector algorithm:

1. Queries Nostr relays for existing heartbeat events
2. Scores each map based on:
   - **Orphan bonus**: Maps with zero sync nodes get highest priority
   - **Scarcity score**: Maps with fewer sync nodes score higher
   - **Demand score**: Maps with more active players score higher
3. Selects the top N maps (configured by `TARGET_MAPS`)
4. Re-evaluates every 30 minutes

This creates a natural market equilibrium where sync nodes gravitate toward underserved, high-demand maps.

## Authentication

Nostr-based challenge-response authentication:

1. Client connects and sends `{ type: "auth", pubkey: "<hex>", mapId: 42 }`
2. Server validates the `mapId` and routes to the correct room
3. Server responds with `{ type: "auth_challenge", challenge: "<random-hex>" }`
4. Client signs a kind-27235 event with the challenge and sends `{ type: "auth_response", signature: "<signed event>" }`
5. Server verifies and sends `{ type: "welcome", peers: [...], mapId: 42 }`

## Protocol Messages

### Client -> Server

| Type | Fields | Description |
|------|--------|-------------|
| `auth` | `pubkey, mapId` | Start authentication for a map |
| `auth_response` | `signature` | Respond to challenge |
| `position` | `x, y, z, ry` | Position update |
| `chat` | `text` | Public chat message |
| `dm` | `to, text` | Private message |
| `emoji` | `emoji` | Emoji reaction |
| `join` | `avatar` | Announce avatar config |
| `subscribe_cells` | `cells` | Subscribe to spatial cells (AOI) |
| `ping` | (none) | Keepalive |

### Server -> Client

| Type | Fields | Description |
|------|--------|-------------|
| `auth_challenge` | `challenge` | Authentication challenge |
| `welcome` | `peers, mapId` | Connected successfully |
| `map_list` | `maps` | List of maps served by this node |
| `peer_join` | `pubkey, avatar` | New player joined |
| `peer_leave` | `pubkey` | Player left |
| `peer_position` | `pubkey, x, y, z, ry` | Player moved |
| `peer_chat` | `pubkey, text` | Chat message |
| `peer_dm` | `pubkey, text` | Private message |
| `peer_emoji` | `pubkey, emoji` | Emoji reaction |
| `pong` | (none) | Keepalive response |
| `error` | `message, code` | Error |
| `game_event` | `event, data` | Custom game event |

### Error Codes

| Code | Description |
|------|-------------|
| `CAPACITY` | Server at maximum player capacity |
| `TIMEOUT` | Client didn't send auth in time |
| `INVALID_MAP` | Map ID is not valid (0-9999) |
| `MAP_NOT_SERVED` | This node doesn't serve the requested map |
| `JOIN_FAILED` | Failed to join the map room |
| `AUTH_REQUIRED` | Must authenticate before sending messages |
| `AUTH_FAILED` | Signature verification failed |
| `REPLACED` | Connection replaced by new one with same pubkey |

## Production Deployment

### TLS (Required for Browsers)

Browsers require `wss://` (not `ws://`). There are two options:

**Option 1: Built-in TLS (recommended — no reverse proxy needed)**

Set `TLS_CERT` and `TLS_KEY` environment variables to enable TLS directly in the server. See the [TLS Settings](#tls-settings-wss) section above for details and examples.

```bash
TLS_CERT=/etc/letsencrypt/live/sync.yourdomain.com/fullchain.pem \
TLS_KEY=/etc/letsencrypt/live/sync.yourdomain.com/privkey.pem \
PORT=443 \
SYNC_URL=wss://sync.yourdomain.com \
NOSTR_SECRET_KEY=<your-key> \
npm start
```

**Option 2: Reverse proxy (alternative)**

If you already have a reverse proxy (Caddy, nginx, etc.), you can terminate TLS there instead:

Caddy:
```
sync.yourdomain.com {
    reverse_proxy localhost:18080
}
```

nginx:
```nginx
server {
    listen 443 ssl;
    server_name sync.yourdomain.com;

    location / {
        proxy_pass http://localhost:18080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Scaling

- Each node supports up to `MAX_PLAYERS` concurrent connections across all maps
- Empty rooms are automatically cleaned up after 5 minutes
- Idle player connections are terminated after 2 minutes
- Same pubkey reconnecting replaces the old connection
- Run multiple nodes with different `SERVED_MAPS` ranges for full coverage
- Use `SERVED_MAPS=auto` to let nodes self-organize

NIP-XX
======

3D Scene Share: Interactive 3D Worlds on Nostr
-----------------------------------------------

`draft` `optional`

3D Scene Share is a platform for sharing and exploring interactive 3D scenes built on Nostr. Users can publish glTF/glb scenes, visit each other's worlds, and interact in real-time through chat and reactions.

## Protocol Overview

3D Scene Share uses the following NIPs:

- **NIP-53** (Live Activities): Kind 30311 events for scene metadata and presence
- **NIP-53** (Live Chat): Kind 1311 events for real-time chat within scenes
- **NIP-78** (Application-specific Data): Kind 30078 events for avatar configuration
- **NIP-25** (Reactions): Kind 7 events for emoji reactions

## Scene Publishing

Each user can publish one primary 3D scene as an addressable event (kind 30311). The scene is identified by the user's pubkey and a unique `d` tag.

### Scene Event (kind 30311)

```jsonc
{
  "kind": 30311,
  "tags": [
    // Unique scene identifier
    ["d", "<scene-id>"],

    // Scene metadata
    ["title", "My Cyberpunk City"],
    ["summary", "A futuristic city scene with neon lights"],
    ["image", "<thumbnail-url>"],

    // Scene glb file URL (stored on Blossom)
    ["streaming", "<scene-glb-url>"],

    // Discovery tag
    ["t", "3d-scene"],

    // Scene status
    ["status", "live"],

    // Scene owner
    ["p", "<owner-pubkey>", "", "Host"]
  ],
  "content": ""
}
```

**Key behaviors:**
- **Addressable**: The same pubkey+kind+d-tag combination always refers to the same scene
- **Replaceable**: The owner can update the scene file URL, title, thumbnail at any time
- **Discoverable**: All scenes can be queried via `#t: ["3d-scene"]`

### Scene File Format

Scenes use the **glTF/glb** format (GL Transmission Format):
- `.glb` is the recommended binary format (single file, includes textures)
- `.gltf` is also supported (JSON format with external resources)
- Files are uploaded via Blossom servers

## Avatar Configuration

Each user's 3D avatar is stored as an application-specific addressable event (kind 30078).

### Avatar Event (kind 30078)

```jsonc
{
  "kind": 30078,
  "tags": [
    ["d", "3d-scene-avatar"]
  ],
  "content": "{\"model\": \"capsule-blue\", \"color\": \"#3B82F6\", \"displayName\": \"Explorer\"}"
}
```

**Content JSON fields:**
- `model`: Identifier of the preset avatar model (e.g., "capsule-blue", "capsule-red", "robot", "astronaut")
- `color`: Hex color for avatar accent/body color
- `displayName`: Display name shown above the avatar in scenes

**Key behaviors:**
- Users select from a set of preset avatars
- The selection is stored on Nostr and loaded by other clients when rendering the user in a scene

## Scene Chat

Real-time chat within a scene uses NIP-53 live chat messages (kind 1311).

### Chat Message (kind 1311)

```jsonc
{
  "kind": 1311,
  "tags": [
    // Reference to the scene (activity address)
    ["a", "30311:<scene-owner-pubkey>:<scene-d-tag>", "<relay-hint>"]
  ],
  "content": "Hello! This scene is amazing!"
}
```

**Key behaviors:**
- Messages are scoped to a specific scene via the `a` tag
- Clients subscribe to kind 1311 events with the matching `a` tag for real-time updates
- Messages are persistent (stored by relays) so newcomers can see recent chat history

## Reactions

Emoji reactions use NIP-25 (kind 7) and can target:
- A scene (kind 30311 event)
- A chat message (kind 1311 event)

### Reaction to Scene

```jsonc
{
  "kind": 7,
  "content": "🔥",
  "tags": [
    ["a", "30311:<scene-owner-pubkey>:<scene-d-tag>", "<relay-hint>"],
    ["p", "<scene-owner-pubkey>"],
    ["k", "30311"]
  ]
}
```

## Querying

### Discover all scenes

```jsonc
{
  "kinds": [30311],
  "#t": ["3d-scene"],
  "limit": 50
}
```

### Fetch a specific user's scene

```jsonc
{
  "kinds": [30311],
  "authors": ["<user-pubkey>"],
  "#t": ["3d-scene"],
  "limit": 1
}
```

### Fetch a user's avatar configuration

```jsonc
{
  "kinds": [30078],
  "authors": ["<user-pubkey>"],
  "#d": ["3d-scene-avatar"],
  "limit": 1
}
```

### Subscribe to scene chat

```jsonc
{
  "kinds": [1311],
  "#a": ["30311:<scene-owner-pubkey>:<scene-d-tag>"],
  "limit": 50
}
```

### Fetch reactions to a scene

```jsonc
{
  "kinds": [7],
  "#a": ["30311:<scene-owner-pubkey>:<scene-d-tag>"],
  "limit": 100
}
```

## URL Structure

- `/` — Browse all published scenes
- `/scene/<npub>` — Enter a user's 3D scene
- `/my-scene` — Manage your own scene (upload/update glb)
- `/avatar` — Choose and customize your 3D avatar
- `/messages` — Private messaging (NIP-04/NIP-17)

## Client Behavior

### Scene Rendering

Clients SHOULD:
- Load the scene's glb file using a WebGL renderer (e.g., Three.js / React Three Fiber)
- Render preset avatars for users currently in the scene
- Display chat messages in an overlay panel
- Show emoji reactions as floating elements in the 3D view

### Avatar System

Clients SHOULD:
- Provide a set of preset avatar models for users to choose from
- Store the user's avatar choice as a kind 30078 event
- Load other users' avatar choices when rendering them in a scene

### Presence

Clients MAY implement presence tracking by:
- Subscribing to kind 1311 events for a scene to detect active participants
- Using recent chat activity or dedicated presence heartbeat events to show who is "in" a scene

## Compatibility

3D Scene Share uses standard Nostr event kinds:
- Kind 30311 is defined by NIP-53 (Live Activities)
- Kind 1311 is defined by NIP-53 (Live Chat)
- Kind 30078 is defined by NIP-78 (Application-specific Data)
- Kind 7 is defined by NIP-25 (Reactions)

Any Nostr client supporting these NIPs can interoperate with 3D Scene Share events.

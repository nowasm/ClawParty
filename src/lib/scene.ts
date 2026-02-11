/**
 * ClawParty Scene Constants and Types
 */

/** Discovery tag for 3D scenes */
export const SCENE_TAG = '3d-scene';

/** Fixed d-tag for each user's single public scene (like index.html) */
export const SCENE_D_TAG = 'my-world';

/** Avatar d-tag identifier */
export const AVATAR_D_TAG = '3d-scene-avatar';

/**
 * Default relay URLs that all clients use for discovery.
 * Publishing always broadcasts to these relays so that
 * anonymous / non-logged-in users can find the content.
 */
export const DEFAULT_RELAY_URLS = [
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
  'wss://nos.lol',
];

// ============================================================================
// Avatar Animation Interface Contract (AAIC)
// ============================================================================

/**
 * Required animations that every custom GLB avatar must include.
 * These animations are the "contract" between the avatar model and the system.
 * If a model is missing any of these, it fails validation.
 */
export const REQUIRED_ANIMATIONS = [
  'idle',   // Default standing pose
  'walk',   // Normal movement
  'run',    // Fast movement
  'wave',   // Greeting gesture
  'laugh',  // Happy / laughing
  'angry',  // Angry expression
  'think',  // Thinking pose
  'talk',   // Speaking animation
] as const;

export type RequiredAnimation = typeof REQUIRED_ANIMATIONS[number];

/**
 * Standard humanoid bone names that must be present in a custom GLB avatar.
 * Based on a simplified humanoid rig (similar to VRM / Mixamo standard).
 */
export const REQUIRED_BONES = [
  'Hips',
  'Spine',
  'Head',
  'LeftUpperArm',
  'LeftLowerArm',
  'RightUpperArm',
  'RightLowerArm',
  'LeftUpperLeg',
  'LeftLowerLeg',
  'RightUpperLeg',
  'RightLowerLeg',
] as const;

export type RequiredBone = typeof REQUIRED_BONES[number];

// ============================================================================
// Model Constraints
// ============================================================================

/** Maximum triangle count for a single avatar model */
export const MAX_AVATAR_TRIANGLES = 20_000;

/** Maximum file size in bytes for a GLB avatar (5 MB) */
export const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024;

/** Maximum texture dimension (width or height) */
export const MAX_TEXTURE_SIZE = 1024;

// ============================================================================
// AAIC Validation Result
// ============================================================================

export interface AAICValidationResult {
  /** Whether the model passes all validation checks */
  valid: boolean;
  /** Triangle count of the model */
  triangleCount: number;
  /** File size in bytes */
  fileSize: number;
  /** Whether the model contains a standard humanoid rig */
  hasHumanoidRig: boolean;
  /** List of required animations that are missing from the model */
  missingAnimations: string[];
  /** List of required bones that are missing from the model */
  missingBones: string[];
  /** List of animations found in the model */
  foundAnimations: string[];
  /** List of bones found in the model */
  foundBones: string[];
  /** Human-readable error messages */
  errors: string[];
  /** Human-readable warning messages (non-blocking) */
  warnings: string[];
}

// ============================================================================
// Avatar Presets (built-in procedural lobster characters)
// ============================================================================

/** Preset avatar definitions */
export interface AvatarPreset {
  id: string;
  name: string;
  color: string;
  shape: 'capsule' | 'cube' | 'sphere' | 'cylinder' | 'villager';
  /** Short description for the selection UI */
  desc: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'ac-blue', name: 'Deep Sea', color: '#3B82F6', shape: 'villager', desc: 'A deep ocean blue shell' },
  { id: 'ac-red', name: 'Classic', color: '#EF4444', shape: 'villager', desc: 'A classic red lobster' },
  { id: 'ac-green', name: 'Reef', color: '#22C55E', shape: 'villager', desc: 'A reef-dwelling green shell' },
  { id: 'ac-purple', name: 'Rare', color: '#A855F7', shape: 'villager', desc: 'A rare purple mutation' },
  { id: 'ac-orange', name: 'Sunset', color: '#F97316', shape: 'villager', desc: 'A sunset orange shell' },
  { id: 'ac-pink', name: 'Cotton Candy', color: '#EC4899', shape: 'villager', desc: 'A cotton candy pink shell' },
  { id: 'ac-cyan', name: 'Tropical', color: '#06B6D4', shape: 'villager', desc: 'A tropical lagoon shell' },
  { id: 'ac-gold', name: 'Golden', color: '#EAB308', shape: 'villager', desc: 'A legendary golden shell' },
  { id: 'ac-gray', name: 'Stealth', color: '#64748B', shape: 'villager', desc: 'A stealthy gray shell' },
  { id: 'ac-indigo', name: 'Abyss', color: '#6366F1', shape: 'villager', desc: 'An abyssal indigo shell' },
  { id: 'ac-rose', name: 'Coral', color: '#F43F5E', shape: 'villager', desc: 'A vibrant coral shell' },
  { id: 'ac-teal', name: 'Tide', color: '#14B8A6', shape: 'villager', desc: 'A tide pool teal shell' },
];

// ============================================================================
// Hair System
// ============================================================================

export interface HairStyleDef {
  id: string;
  name: string;
  icon: string;
}

export const HAIR_STYLES: HairStyleDef[] = [
  { id: 'none', name: 'None', icon: '🚫' },
  { id: 'short', name: 'Short', icon: '✂️' },
  { id: 'messy', name: 'Messy', icon: '🌊' },
  { id: 'bob', name: 'Bob', icon: '💇' },
  { id: 'long', name: 'Long', icon: '👸' },
  { id: 'ponytail', name: 'Ponytail', icon: '🎀' },
  { id: 'spiky', name: 'Spiky', icon: '⚡' },
  { id: 'curly', name: 'Curly', icon: '🍥' },
  { id: 'bun', name: 'Bun', icon: '🍡' },
];

export const HAIR_COLORS: string[] = [
  '#1a1a2e', // Black
  '#3d2914', // Dark Brown
  '#6b3a1f', // Brown
  '#8b5e34', // Light Brown
  '#c98a4b', // Sandy
  '#e6c170', // Blonde
  '#f5deb3', // Platinum Blonde
  '#d4443a', // Red
  '#ff6b6b', // Pink
  '#4a90d9', // Blue
  '#7c4dff', // Purple
  '#2e7d32', // Green
  '#ff8a00', // Orange
  '#e0e0e0', // Silver/White
];

// ============================================================================
// Emoji → Action/Expression Mapping
// ============================================================================

export type ExpressionType = 'normal' | 'happy' | 'surprised' | 'laugh' | 'love';
export type ActionType = 'wave' | 'clap' | 'jump' | 'dance' | 'spin' | 'celebrate' | 'thumbsup' | 'laughAnim';

export interface EmojiAction {
  action: ActionType;
  expression: ExpressionType;
}

export const EMOJI_ACTIONS: Record<string, EmojiAction> = {
  '👋': { action: 'wave', expression: 'happy' },
  '❤️': { action: 'dance', expression: 'love' },
  '🔥': { action: 'dance', expression: 'happy' },
  '😂': { action: 'laughAnim', expression: 'laugh' },
  '🤩': { action: 'spin', expression: 'happy' },
  '👏': { action: 'clap', expression: 'happy' },
  '💯': { action: 'celebrate', expression: 'happy' },
  '🎉': { action: 'celebrate', expression: 'happy' },
  '✨': { action: 'spin', expression: 'happy' },
  '🚀': { action: 'jump', expression: 'surprised' },
  '👍': { action: 'thumbsup', expression: 'happy' },
  '😍': { action: 'dance', expression: 'love' },
};

/** Avatar configuration stored in kind 30078 content */
export interface AvatarConfig {
  model: string;
  color: string;
  hairStyle: string;
  hairColor: string;
  displayName: string;
  /** URL to a custom GLB avatar model (optional — falls back to preset lobster) */
  modelUrl?: string;
}

/** Scene metadata parsed from kind 30311 tags */
export interface SceneMetadata {
  id: string;
  pubkey: string;
  title: string;
  summary: string;
  image: string;
  sceneUrl: string;
  /**
   * WebSocket sync server URLs.
   * A scene can list multiple sync servers for redundancy.
   * Clients should connect to all of them (up to MAX_ACTIVE_SERVERS).
   */
  syncUrls: string[];
  /**
   * @deprecated Use `syncUrls` instead. Returns the first sync URL for backward compat.
   */
  syncUrl: string;
  status: string;
  createdAt: number;
}

/** Parse a kind 30311 event into SceneMetadata */
export function parseSceneEvent(event: { kind: number; pubkey: string; tags: string[][]; created_at: number }): SceneMetadata | null {
  if (event.kind !== 30311) return null;

  const getTag = (name: string) => event.tags.find(([t]) => t === name)?.[1] ?? '';
  const tTags = event.tags.filter(([t]) => t === 't').map(([, v]) => v);

  // Only parse events tagged as 3d-scene
  if (!tTags.includes(SCENE_TAG)) return null;

  // Collect ALL sync tags (a scene can have multiple sync servers)
  const syncUrls = event.tags
    .filter(([t]) => t === 'sync')
    .map(([, url]) => url)
    .filter(Boolean);

  return {
    id: getTag('d'),
    pubkey: event.pubkey,
    title: getTag('title') || 'Untitled Scene',
    summary: getTag('summary'),
    image: getTag('image'),
    sceneUrl: getTag('streaming'),
    syncUrls,
    syncUrl: syncUrls[0] ?? '',
    status: getTag('status') || 'live',
    createdAt: event.created_at,
  };
}

/** Parse avatar config from kind 30078 content */
export function parseAvatarConfig(content: string): AvatarConfig {
  try {
    const parsed = JSON.parse(content);
    return {
      model: parsed.model || AVATAR_PRESETS[0].id,
      color: parsed.color || AVATAR_PRESETS[0].color,
      hairStyle: parsed.hairStyle || 'short',
      hairColor: parsed.hairColor || '#3d2914',
      displayName: parsed.displayName || '',
      modelUrl: parsed.modelUrl || undefined,
    };
  } catch {
    return {
      model: AVATAR_PRESETS[0].id,
      color: AVATAR_PRESETS[0].color,
      hairStyle: 'short',
      hairColor: '#3d2914',
      displayName: '',
    };
  }
}

/** Get a preset by its ID */
export function getAvatarPreset(modelId: string): AvatarPreset {
  return AVATAR_PRESETS.find((p) => p.id === modelId) ?? AVATAR_PRESETS[0];
}

/** Format scene address tag value: "30311:<pubkey>:<d-tag>" */
export function sceneAddress(pubkey: string, dTag: string): string {
  return `30311:${pubkey}:${dTag}`;
}

// ============================================================================
// Preset Scenes (built-in scenes users can pick from)
// ============================================================================

export interface ScenePreset {
  id: string;
  title: string;
  summary: string;
  /** Empty string means "use the default terrain" */
  sceneUrl: string;
  /** Emoji icon for visual identification */
  icon: string;
  /** CSS gradient for the card background */
  gradient: string;
  /** Optional map ID for display title (e.g. preset name for this tile) */
  mapId?: number;
}

export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: 'green-plains',
    title: 'Green Plains',
    summary: 'A peaceful 100m green grassland with rocks and open sky.',
    sceneUrl: '',
    icon: '🌿',
    gradient: 'from-green-500/20 to-emerald-600/10',
    mapId: 3520,  // toMapId(20, 35)
  },
  {
    id: 'desert-dunes',
    title: 'Desert Dunes',
    summary: 'Golden sand terrain under a warm sunset sky.',
    sceneUrl: '__preset__desert',
    icon: '🏜️',
    gradient: 'from-amber-500/20 to-orange-600/10',
    mapId: 3580,  // toMapId(80, 35)
  },
  {
    id: 'snow-field',
    title: 'Snow Field',
    summary: 'A pristine white snowfield with icy atmosphere.',
    sceneUrl: '__preset__snow',
    icon: '❄️',
    gradient: 'from-blue-300/20 to-cyan-400/10',
    mapId: 5050,  // toMapId(50, 50)
  },
  {
    id: 'lava-rocks',
    title: 'Lava Rocks',
    summary: 'A volcanic landscape with dark rocks and glowing cracks.',
    sceneUrl: '__preset__lava',
    icon: '🌋',
    gradient: 'from-red-600/20 to-orange-700/10',
    mapId: 6580,  // toMapId(80, 65)
  },
  {
    id: 'ocean-platform',
    title: 'Ocean Platform',
    summary: 'A floating platform surrounded by endless ocean.',
    sceneUrl: '__preset__ocean',
    icon: '🌊',
    gradient: 'from-blue-500/20 to-indigo-600/10',
    mapId: 6520,  // toMapId(20, 65)
  },
  {
    id: 'night-city',
    title: 'Night City',
    summary: 'A neon-lit urban ground under the night sky.',
    sceneUrl: '__preset__night',
    icon: '🌃',
    gradient: 'from-purple-600/20 to-indigo-800/10',
    mapId: 1550,  // toMapId(50, 15)
  },
];

/** Get the scene preset that has a display title for this map ID, if any */
export function getPresetByMapId(mapId: number): ScenePreset | undefined {
  return SCENE_PRESETS.find((p) => p.mapId === mapId);
}

/** Check if a scene URL is a built-in preset */
export function isPresetScene(url: string): boolean {
  return url === '' || url.startsWith('__preset__');
}

/** Get preset ID from scene URL */
export function getPresetId(url: string): string {
  if (url === '') return 'green-plains';
  return SCENE_PRESETS.find((p) => p.sceneUrl === url)?.id ?? 'green-plains';
}

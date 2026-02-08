/**
 * 3D Scene Share Constants and Types
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
  { id: 'ac-blue', name: 'Cool', color: '#3B82F6', shape: 'villager', desc: 'A cool blue outfit' },
  { id: 'ac-red', name: 'Sporty', color: '#EF4444', shape: 'villager', desc: 'An energetic red look' },
  { id: 'ac-green', name: 'Forest', color: '#22C55E', shape: 'villager', desc: 'A nature-inspired outfit' },
  { id: 'ac-purple', name: 'Mystic', color: '#A855F7', shape: 'villager', desc: 'A magical purple outfit' },
  { id: 'ac-orange', name: 'Sunny', color: '#F97316', shape: 'villager', desc: 'A warm sunny look' },
  { id: 'ac-pink', name: 'Sweet', color: '#EC4899', shape: 'villager', desc: 'A sweet pink style' },
  { id: 'ac-cyan', name: 'Ocean', color: '#06B6D4', shape: 'villager', desc: 'A refreshing ocean vibe' },
  { id: 'ac-gold', name: 'Royal', color: '#EAB308', shape: 'villager', desc: 'A royal golden look' },
  { id: 'ac-gray', name: 'Urban', color: '#64748B', shape: 'villager', desc: 'A sleek urban style' },
  { id: 'ac-indigo', name: 'Night', color: '#6366F1', shape: 'villager', desc: 'A night sky inspired' },
  { id: 'ac-rose', name: 'Rose', color: '#F43F5E', shape: 'villager', desc: 'A beautiful rose tone' },
  { id: 'ac-teal', name: 'Mint', color: '#14B8A6', shape: 'villager', desc: 'A refreshing mint look' },
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
}

export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: 'green-plains',
    title: 'Green Plains',
    summary: 'A peaceful 100m green grassland with rocks and open sky.',
    sceneUrl: '',
    icon: '🌿',
    gradient: 'from-green-500/20 to-emerald-600/10',
  },
  {
    id: 'desert-dunes',
    title: 'Desert Dunes',
    summary: 'Golden sand terrain under a warm sunset sky.',
    sceneUrl: '__preset__desert',
    icon: '🏜️',
    gradient: 'from-amber-500/20 to-orange-600/10',
  },
  {
    id: 'snow-field',
    title: 'Snow Field',
    summary: 'A pristine white snowfield with icy atmosphere.',
    sceneUrl: '__preset__snow',
    icon: '❄️',
    gradient: 'from-blue-300/20 to-cyan-400/10',
  },
  {
    id: 'lava-rocks',
    title: 'Lava Rocks',
    summary: 'A volcanic landscape with dark rocks and glowing cracks.',
    sceneUrl: '__preset__lava',
    icon: '🌋',
    gradient: 'from-red-600/20 to-orange-700/10',
  },
  {
    id: 'ocean-platform',
    title: 'Ocean Platform',
    summary: 'A floating platform surrounded by endless ocean.',
    sceneUrl: '__preset__ocean',
    icon: '🌊',
    gradient: 'from-blue-500/20 to-indigo-600/10',
  },
  {
    id: 'night-city',
    title: 'Night City',
    summary: 'A neon-lit urban ground under the night sky.',
    sceneUrl: '__preset__night',
    icon: '🌃',
    gradient: 'from-purple-600/20 to-indigo-800/10',
  },
];

/** Check if a scene URL is a built-in preset */
export function isPresetScene(url: string): boolean {
  return url === '' || url.startsWith('__preset__');
}

/** Get preset ID from scene URL */
export function getPresetId(url: string): string {
  if (url === '') return 'green-plains';
  return SCENE_PRESETS.find((p) => p.sceneUrl === url)?.id ?? 'green-plains';
}

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

/**
 * Relays used for WebRTC signaling (kind 25050).
 * Multiple relays improve delivery so peers can discover each other.
 */
export const SIGNALING_RELAY_URLS = [
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
  shape: 'capsule' | 'cube' | 'sphere' | 'cylinder';
  /** Short description for the selection UI */
  desc: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  // Classic (capsule) characters
  { id: 'capsule-blue', name: 'Explorer', color: '#3B82F6', shape: 'capsule', desc: 'A brave adventurer' },
  { id: 'capsule-red', name: 'Warrior', color: '#EF4444', shape: 'capsule', desc: 'A fierce fighter' },
  { id: 'capsule-green', name: 'Scout', color: '#22C55E', shape: 'capsule', desc: 'A nimble pathfinder' },
  { id: 'capsule-purple', name: 'Mystic', color: '#A855F7', shape: 'capsule', desc: 'A magical sorcerer' },
  { id: 'capsule-orange', name: 'Pioneer', color: '#F97316', shape: 'capsule', desc: 'A daring builder' },
  // Robot (cube) characters
  { id: 'cube-cyan', name: 'Cyber Bot', color: '#06B6D4', shape: 'cube', desc: 'A high-tech android' },
  { id: 'cube-steel', name: 'Iron Guard', color: '#64748B', shape: 'cube', desc: 'A steel sentinel' },
  { id: 'cube-gold', name: 'Gilded Mech', color: '#EAB308', shape: 'cube', desc: 'A golden automaton' },
  // Slime (sphere) characters
  { id: 'sphere-pink', name: 'Pink Slime', color: '#EC4899', shape: 'sphere', desc: 'A bouncy jelly blob' },
  { id: 'sphere-lime', name: 'Lime Slime', color: '#84CC16', shape: 'sphere', desc: 'A squishy friend' },
  // Knight (cylinder) characters
  { id: 'cylinder-silver', name: 'Silver Knight', color: '#94A3B8', shape: 'cylinder', desc: 'A noble guardian' },
  { id: 'cylinder-crimson', name: 'Dark Knight', color: '#991B1B', shape: 'cylinder', desc: 'A shadowy protector' },
];

/** Avatar configuration stored in kind 30078 content */
export interface AvatarConfig {
  model: string;
  color: string;
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

  return {
    id: getTag('d'),
    pubkey: event.pubkey,
    title: getTag('title') || 'Untitled Scene',
    summary: getTag('summary'),
    image: getTag('image'),
    sceneUrl: getTag('streaming'),
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
      displayName: parsed.displayName || '',
    };
  } catch {
    return {
      model: AVATAR_PRESETS[0].id,
      color: AVATAR_PRESETS[0].color,
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

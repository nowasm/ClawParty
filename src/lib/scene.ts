/**
 * 3D Scene Share Constants and Types
 */

/** Discovery tag for 3D scenes */
export const SCENE_TAG = '3d-scene';

/** Avatar d-tag identifier */
export const AVATAR_D_TAG = '3d-scene-avatar';

/** Preset avatar definitions */
export interface AvatarPreset {
  id: string;
  name: string;
  color: string;
  shape: 'capsule' | 'cube' | 'sphere' | 'cylinder';
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'capsule-blue', name: 'Blue Explorer', color: '#3B82F6', shape: 'capsule' },
  { id: 'capsule-red', name: 'Red Warrior', color: '#EF4444', shape: 'capsule' },
  { id: 'capsule-green', name: 'Green Scout', color: '#22C55E', shape: 'capsule' },
  { id: 'capsule-purple', name: 'Purple Mystic', color: '#A855F7', shape: 'capsule' },
  { id: 'capsule-orange', name: 'Orange Pioneer', color: '#F97316', shape: 'capsule' },
  { id: 'cube-cyan', name: 'Cyan Cube', color: '#06B6D4', shape: 'cube' },
  { id: 'sphere-pink', name: 'Pink Orb', color: '#EC4899', shape: 'sphere' },
  { id: 'cylinder-yellow', name: 'Gold Pillar', color: '#EAB308', shape: 'cylinder' },
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

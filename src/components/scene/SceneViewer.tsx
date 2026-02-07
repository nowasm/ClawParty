import { Suspense, useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, useGLTF, Html, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { AvatarModel } from './AvatarModel';
import { type AvatarConfig, getAvatarPreset, AVATAR_PRESETS, isPresetScene } from '@/lib/scene';
import type { PeerState, PeerPosition } from '@/lib/webrtc';

// ============================================================================
// Constants
// ============================================================================

const TERRAIN_SIZE = 100; // 100m x 100m
const MOVE_SPEED = 8; // meters per second
const _ROTATE_SPEED = 2.5; // radians per second (reserved for future use)
const CAMERA_HEIGHT = 4;
const CAMERA_DISTANCE = 12;
const CAMERA_LERP = 0.1;
const POSITION_BROADCAST_INTERVAL = 66; // ~15fps
const MOUSE_SENSITIVITY = 0.002;
const PITCH_MIN = -Math.PI / 6; // look down limit (~30deg)
const PITCH_MAX = Math.PI / 3;  // look up limit (~60deg)

// ============================================================================
// Types
// ============================================================================

interface SceneViewerProps {
  sceneUrl?: string;
  /** Current user's avatar config */
  myAvatar?: AvatarConfig;
  /** Current user's pubkey */
  currentUserPubkey?: string;
  /** Map of remote peer pubkeys -> their avatar configs */
  remoteAvatars?: Record<string, AvatarConfig>;
  /** Map of remote peer pubkeys -> their synced state (position, emoji) */
  peerStates?: Record<string, PeerState>;
  /** Callback to broadcast local player position */
  onPositionUpdate?: (pos: PeerPosition) => void;
  /** Callback to broadcast emoji */
  onEmoji?: (emoji: string) => void;
  className?: string;
}

// ============================================================================
// Terrain themes
// ============================================================================

interface TerrainTheme {
  groundColor: string;
  gridColor1: string;
  gridColor2: string;
  rockColor: string;
  markerColor: string;
  fogColor: string;
  skyProps: { sunPosition: [number, number, number]; turbidity: number; rayleigh: number };
  envPreset: 'sunset' | 'dawn' | 'night' | 'warehouse' | 'city' | 'park' | 'apartment' | 'studio' | 'forest' | 'lobby';
}

// THREE.Color only supports 6-digit hex; no alpha (8-digit) to avoid "Invalid hex color" warnings
const TERRAIN_THEMES: Record<string, TerrainTheme> = {
  '': {
    groundColor: '#4a7c59', gridColor1: '#5a8c69', gridColor2: '#6a9c79',
    rockColor: '#78716c', markerColor: '#d97706',
    fogColor: '#c9daf8', skyProps: { sunPosition: [100, 60, 100], turbidity: 3, rayleigh: 0.5 },
    envPreset: 'sunset',
  },
  '__preset__desert': {
    groundColor: '#c2956a', gridColor1: '#d4a574', gridColor2: '#d9b088',
    rockColor: '#a08060', markerColor: '#ef4444',
    fogColor: '#f5e6d3', skyProps: { sunPosition: [80, 30, 60], turbidity: 8, rayleigh: 1.5 },
    envPreset: 'sunset',
  },
  '__preset__snow': {
    groundColor: '#e8edf2', gridColor1: '#d0d8e0', gridColor2: '#c8d4e0',
    rockColor: '#94a3b8', markerColor: '#3b82f6',
    fogColor: '#e2e8f0', skyProps: { sunPosition: [50, 20, 80], turbidity: 0.5, rayleigh: 0.2 },
    envPreset: 'dawn',
  },
  '__preset__lava': {
    groundColor: '#2a1a1a', gridColor1: '#ff5522', gridColor2: '#cc3311',
    rockColor: '#1a1a1a', markerColor: '#ff4400',
    fogColor: '#1a0a0a', skyProps: { sunPosition: [30, 10, 50], turbidity: 10, rayleigh: 3 },
    envPreset: 'night',
  },
  '__preset__ocean': {
    groundColor: '#2d6a8a', gridColor1: '#3d8ab0', gridColor2: '#4d9ac0',
    rockColor: '#5ea0b0', markerColor: '#22d3ee',
    fogColor: '#bae6fd', skyProps: { sunPosition: [100, 50, 80], turbidity: 2, rayleigh: 0.8 },
    envPreset: 'lobby',
  },
  '__preset__night': {
    groundColor: '#1e1b2e', gridColor1: '#b865f7', gridColor2: '#7374f1',
    rockColor: '#312e4a', markerColor: '#a855f7',
    fogColor: '#0f0d1a', skyProps: { sunPosition: [-100, -10, 50], turbidity: 10, rayleigh: 0.1 },
    envPreset: 'night',
  },
};

function getTheme(sceneUrl: string): TerrainTheme {
  return TERRAIN_THEMES[sceneUrl] ?? TERRAIN_THEMES[''];
}

// Deterministic decorations (no Math.random at render time)
const DECORATIONS = Array.from({ length: 12 }).map((_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const r = 15 + Math.sin(i * 3.7) * 10;
  const scale = 0.5 + ((Math.sin(i * 7.3) + 1) / 2) * 1.5;
  return {
    x: Math.cos(angle) * r,
    z: Math.sin(angle) * r,
    scale,
  };
});

function Terrain({ sceneUrl = '' }: { sceneUrl?: string }) {
  const theme = getTheme(sceneUrl);

  return (
    <group>
      {/* Main ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[TERRAIN_SIZE, TERRAIN_SIZE, 64, 64]} />
        <meshStandardMaterial color={theme.groundColor} roughness={0.9} metalness={0} />
      </mesh>

      {/* Grid overlay */}
      <gridHelper
        args={[TERRAIN_SIZE, TERRAIN_SIZE / 2, theme.gridColor1, theme.gridColor2]}
        position={[0, 0.01, 0]}
      />

      {/* Border markers at corners */}
      {[
        [-TERRAIN_SIZE / 2, 0, -TERRAIN_SIZE / 2],
        [TERRAIN_SIZE / 2, 0, -TERRAIN_SIZE / 2],
        [-TERRAIN_SIZE / 2, 0, TERRAIN_SIZE / 2],
        [TERRAIN_SIZE / 2, 0, TERRAIN_SIZE / 2],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y + 1, z]} castShadow>
          <cylinderGeometry args={[0.15, 0.15, 2, 8]} />
          <meshStandardMaterial color={theme.markerColor} emissive={theme.markerColor} emissiveIntensity={0.3} />
        </mesh>
      ))}

      {/* Lava glow cracks */}
      {sceneUrl === '__preset__lava' && (
        <>
          {DECORATIONS.slice(0, 8).map((d, i) => (
            <mesh key={`glow-${i}`} position={[d.x * 0.7, 0.02, d.z * 0.7]} rotation={[-Math.PI / 2, 0, i]}>
              <planeGeometry args={[d.scale * 2, 0.15]} />
              <meshStandardMaterial color="#ff4400" emissive="#ff4400" emissiveIntensity={2} transparent opacity={0.6} />
            </mesh>
          ))}
        </>
      )}

      {/* Decorative elements */}
      {DECORATIONS.map((d, i) => (
        <mesh key={`rock-${i}`} position={[d.x, d.scale * 0.3, d.z]} castShadow>
          <dodecahedronGeometry args={[d.scale * 0.5, 0]} />
          <meshStandardMaterial color={theme.rockColor} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

// ============================================================================
// Loaded GLTF Scene
// ============================================================================

function GLTFScene({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

// ============================================================================
// Local Player (WASD controls + camera follow)
// ============================================================================

interface LocalPlayerProps {
  avatar?: AvatarConfig;
  onPositionUpdate?: (pos: PeerPosition) => void;
}

function LocalPlayer({ avatar, onPositionUpdate }: LocalPlayerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, gl } = useThree();
  const keysRef = useRef<Set<string>>(new Set());
  // Character position + facing direction (ry)
  const posRef = useRef({ x: 0, y: 0, z: 0, ry: 0 });
  // Camera orbit angles (independent of character facing)
  const camYawRef = useRef(0);   // horizontal orbit around character
  const camPitchRef = useRef(0.3); // vertical angle
  const lastBroadcast = useRef(0);

  const preset = avatar ? getAvatarPreset(avatar.model) : AVATAR_PRESETS[0];
  const color = avatar?.color ?? preset.color;

  // Key listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      keysRef.current.add(e.key.toLowerCase());
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Right-click drag → orbit camera around character
  const rightDragging = useRef(false);

  useEffect(() => {
    const canvas = gl.domElement;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        rightDragging.current = true;
        e.preventDefault();
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        rightDragging.current = false;
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!rightDragging.current) return;
      // Horizontal → camera orbit yaw
      camYawRef.current += e.movementX * MOUSE_SENSITIVITY;
      // Vertical → camera pitch (clamped)
      camPitchRef.current = Math.max(
        PITCH_MIN,
        Math.min(PITCH_MAX, camPitchRef.current + e.movementY * MOUSE_SENSITIVITY),
      );
    };
    const onContextMenu = (e: Event) => {
      e.preventDefault();
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('contextmenu', onContextMenu);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('contextmenu', onContextMenu);
    };
  }, [gl]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const keys = keysRef.current;
    const pos = posRef.current;
    const camYaw = camYawRef.current;

    // Movement input (relative to CAMERA direction)
    let moveX = 0;
    let moveZ = 0;
    if (keys.has('w') || keys.has('arrowup')) {
      moveZ -= 1;
    }
    if (keys.has('s') || keys.has('arrowdown')) {
      moveZ += 1;
    }
    if (keys.has('a') || keys.has('arrowleft') || keys.has('q')) {
      moveX -= 1;
    }
    if (keys.has('d') || keys.has('arrowright') || keys.has('e')) {
      moveX += 1;
    }

    if (moveX !== 0 || moveZ !== 0) {
      const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
      moveX /= len;
      moveZ /= len;

      // Resolve movement relative to camera yaw (not character facing)
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      const worldX = (moveX * cos - moveZ * sin) * MOVE_SPEED * delta;
      const worldZ = (moveX * sin + moveZ * cos) * MOVE_SPEED * delta;
      pos.x += worldX;
      pos.z += worldZ;

      // Character faces the movement direction (smooth but snappy turn)
      // Avatar model faces +Z at ry=0; forward = (sin(ry), 0, cos(ry))
      const targetRy = Math.atan2(worldX, worldZ);
      let diff = targetRy - pos.ry;
      // Normalize to [-PI, PI]
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      // Turn speed: ~10 rad/s convergence, capped at 1.0 to avoid overshoot
      const turnFactor = Math.min(1, 12 * delta);
      pos.ry += diff * turnFactor;
    }

    // Clamp to terrain bounds
    const half = TERRAIN_SIZE / 2 - 1;
    pos.x = Math.max(-half, Math.min(half, pos.x));
    pos.z = Math.max(-half, Math.min(half, pos.z));

    // Apply position + facing to character mesh
    groupRef.current.position.set(pos.x, pos.y, pos.z);
    groupRef.current.rotation.y = pos.ry;

    // Camera orbits around character using camYaw/camPitch
    const pitch = camPitchRef.current;
    const camDist = CAMERA_DISTANCE * Math.cos(pitch);
    const camHeight = CAMERA_HEIGHT + CAMERA_DISTANCE * Math.sin(pitch);
    const targetCamPos = new THREE.Vector3(
      pos.x - Math.sin(camYaw) * camDist,
      pos.y + camHeight,
      pos.z + Math.cos(camYaw) * camDist,
    );
    camera.position.lerp(targetCamPos, CAMERA_LERP);
    camera.lookAt(pos.x, pos.y + 1.5, pos.z);

    // Broadcast position at ~15fps
    const now = Date.now();
    if (now - lastBroadcast.current >= POSITION_BROADCAST_INTERVAL) {
      lastBroadcast.current = now;
      onPositionUpdate?.({ x: pos.x, y: pos.y, z: pos.z, ry: pos.ry });
    }
  });

  return (
    <group ref={groupRef}>
      <AvatarModel preset={preset} color={color} isCurrentUser />
      {/* Name label */}
      <Html position={[0, 2.4, 0]} center distanceFactor={10}>
        <div className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium shadow-lg bg-primary text-primary-foreground">
          {avatar?.displayName || 'You'}
        </div>
      </Html>
    </group>
  );
}

// ============================================================================
// Remote Player (smoothly interpolated position)
// ============================================================================

interface RemotePlayerProps {
  pubkey: string;
  avatar: AvatarConfig;
  peerState: PeerState;
}

function RemotePlayer({ pubkey, avatar, peerState }: RemotePlayerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const targetPos = useRef(new THREE.Vector3());
  const targetRot = useRef(0);
  const preset = getAvatarPreset(avatar.model);

  useFrame(() => {
    if (!groupRef.current) return;

    // Smoothly interpolate position
    targetPos.current.set(peerState.position.x, peerState.position.y, peerState.position.z);
    groupRef.current.position.lerp(targetPos.current, 0.15);

    // Smoothly interpolate rotation
    targetRot.current = peerState.position.ry;
    const currentRot = groupRef.current.rotation.y;
    let diff = targetRot.current - currentRot;
    // Handle wrapping
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    groupRef.current.rotation.y += diff * 0.15;
  });

  return (
    <group ref={groupRef}>
      <AvatarModel preset={preset} color={avatar.color} />
      {/* Name label */}
      <Html position={[0, 2.4, 0]} center distanceFactor={10}>
        <div className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium shadow-lg bg-card text-card-foreground border border-border">
          {avatar.displayName || pubkey.slice(0, 8)}
        </div>
      </Html>
      {/* Emoji bubble */}
      {peerState.emoji && (
        <Html position={[0, 3.0, 0]} center distanceFactor={8}>
          <div className="text-3xl animate-bounce" style={{ animationDuration: '0.6s' }}>
            {peerState.emoji}
          </div>
        </Html>
      )}
    </group>
  );
}

// ============================================================================
// Loading Fallback
// ============================================================================

function SceneLoader() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading scene...</p>
      </div>
    </Html>
  );
}

// ============================================================================
// SceneViewer (main export)
// ============================================================================

export function SceneViewer({
  sceneUrl,
  myAvatar,
  currentUserPubkey,
  remoteAvatars = {},
  peerStates = {},
  onPositionUpdate,
  className,
}: SceneViewerProps) {
  // Local emoji state
  const [_myEmoji, setMyEmoji] = useState<string | null>(null);
  const emojiTimeout = useRef<ReturnType<typeof setTimeout>>();

  const showMyEmoji = useCallback((emoji: string) => {
    setMyEmoji(emoji);
    if (emojiTimeout.current) clearTimeout(emojiTimeout.current);
    emojiTimeout.current = setTimeout(() => setMyEmoji(null), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (emojiTimeout.current) clearTimeout(emojiTimeout.current);
    };
  }, []);

  // Make showMyEmoji available to parent
  (SceneViewer as unknown as Record<string, unknown>)._showEmoji = showMyEmoji;

  // Resolve theme from scene URL
  const isPreset = isPresetScene(sceneUrl ?? '');
  const theme = useMemo(() => getTheme(isPreset ? (sceneUrl ?? '') : ''), [sceneUrl, isPreset]);

  return (
    <div className={`w-full h-full min-h-[400px] rounded-xl overflow-hidden bg-muted/30 border border-border ${className ?? ''}`}>
      <Canvas
        shadows
        camera={{ position: [0, CAMERA_HEIGHT, CAMERA_DISTANCE], fov: 55 }}
        gl={{ antialias: true }}
        onPointerDown={(e) => {
          // Focus canvas for keyboard input
          (e.target as HTMLCanvasElement).focus?.();
        }}
        tabIndex={0}
      >
        <Suspense fallback={<SceneLoader />}>
          {/* Lighting */}
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[30, 40, 20]}
            intensity={1.2}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-50}
            shadow-camera-right={50}
            shadow-camera-top={50}
            shadow-camera-bottom={-50}
          />
          <hemisphereLight args={['#87ceeb', '#4a7c59', 0.3]} />

          {/* Sky — theme aware */}
          <Sky
            sunPosition={theme.skyProps.sunPosition}
            turbidity={theme.skyProps.turbidity}
            rayleigh={theme.skyProps.rayleigh}
          />

          {/* Scene content */}
          {sceneUrl && !isPreset ? (
            <>
              <GLTFScene url={sceneUrl} />
              {/* Fallback floor under uploaded glTF */}
              <Terrain sceneUrl="" />
            </>
          ) : (
            <Terrain sceneUrl={isPreset ? (sceneUrl ?? '') : ''} />
          )}

          {/* Local player (WASD controlled) */}
          {currentUserPubkey && (
            <LocalPlayer
              avatar={myAvatar}
              onPositionUpdate={onPositionUpdate}
            />
          )}

          {/* Remote players */}
          {Object.entries(peerStates).map(([pubkey, state]) => {
            if (pubkey === currentUserPubkey) return null;
            const avatar = remoteAvatars[pubkey] ?? {
              model: AVATAR_PRESETS[0].id,
              color: AVATAR_PRESETS[0].color,
              displayName: pubkey.slice(0, 8),
            };
            return (
              <RemotePlayer
                key={pubkey}
                pubkey={pubkey}
                avatar={avatar}
                peerState={state}
              />
            );
          })}

          {/* Environment map for reflections — theme aware */}
          <Environment preset={theme.envPreset} />

          {/* Fog for depth — theme aware */}
          <fog attach="fog" args={[theme.fogColor, 60, 120]} />
        </Suspense>
      </Canvas>

      {/* Controls hint overlay */}
      <div className="absolute bottom-4 left-4 text-xs text-muted-foreground bg-background/70 backdrop-blur-sm rounded-lg px-3 py-2 pointer-events-none select-none space-y-0.5">
        <div><span className="font-mono">W A S D</span> move</div>
        <div>Right-click drag to orbit camera</div>
      </div>
    </div>
  );
}

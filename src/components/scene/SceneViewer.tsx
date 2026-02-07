import { Suspense, useRef, useEffect, useCallback, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, useGLTF, Html, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { AvatarModel } from './AvatarModel';
import { type AvatarConfig, getAvatarPreset, AVATAR_PRESETS } from '@/lib/scene';
import type { PeerState, PeerPosition } from '@/lib/webrtc';

// ============================================================================
// Constants
// ============================================================================

const TERRAIN_SIZE = 100; // 100m x 100m
const MOVE_SPEED = 8; // meters per second
const ROTATE_SPEED = 2.5; // radians per second
const CAMERA_HEIGHT = 6;
const CAMERA_DISTANCE = 10;
const CAMERA_LERP = 0.08;
const POSITION_BROADCAST_INTERVAL = 66; // ~15fps

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
// Terrain (100m x 100m)
// ============================================================================

function Terrain() {
  return (
    <group>
      {/* Main ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[TERRAIN_SIZE, TERRAIN_SIZE, 64, 64]} />
        <meshStandardMaterial color="#4a7c59" roughness={0.9} metalness={0} />
      </mesh>

      {/* Grid overlay */}
      <gridHelper
        args={[TERRAIN_SIZE, TERRAIN_SIZE / 2, '#5a8c69', '#4a7c5940']}
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
          <meshStandardMaterial color="#d97706" emissive="#d97706" emissiveIntensity={0.3} />
        </mesh>
      ))}

      {/* A few decorative elements on the terrain */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const r = 15 + Math.sin(i * 3.7) * 10;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const scale = 0.5 + Math.random() * 1.5;
        return (
          <mesh key={`rock-${i}`} position={[x, scale * 0.3, z]} castShadow>
            <dodecahedronGeometry args={[scale * 0.5, 0]} />
            <meshStandardMaterial color="#78716c" roughness={0.85} />
          </mesh>
        );
      })}
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
  const { camera } = useThree();
  const keysRef = useRef<Set<string>>(new Set());
  const posRef = useRef({ x: 0, y: 0, z: 0, ry: 0 });
  const lastBroadcast = useRef(0);

  const preset = avatar ? getAvatarPreset(avatar.model) : AVATAR_PRESETS[0];
  const color = avatar?.color ?? preset.color;

  // Key listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in input fields
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

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const keys = keysRef.current;
    const pos = posRef.current;

    // Rotation
    if (keys.has('a') || keys.has('arrowleft')) {
      pos.ry += ROTATE_SPEED * delta;
    }
    if (keys.has('d') || keys.has('arrowright')) {
      pos.ry -= ROTATE_SPEED * delta;
    }

    // Movement (relative to facing direction)
    let moveX = 0;
    let moveZ = 0;
    if (keys.has('w') || keys.has('arrowup')) {
      moveZ -= 1;
    }
    if (keys.has('s') || keys.has('arrowdown')) {
      moveZ += 1;
    }

    if (moveX !== 0 || moveZ !== 0) {
      const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
      moveX /= len;
      moveZ /= len;

      const sin = Math.sin(pos.ry);
      const cos = Math.cos(pos.ry);
      pos.x += (moveX * cos - moveZ * sin) * MOVE_SPEED * delta;
      pos.z += (moveX * sin + moveZ * cos) * MOVE_SPEED * delta;
    }

    // Clamp to terrain bounds
    const half = TERRAIN_SIZE / 2 - 1;
    pos.x = Math.max(-half, Math.min(half, pos.x));
    pos.z = Math.max(-half, Math.min(half, pos.z));

    // Apply to group
    groupRef.current.position.set(pos.x, pos.y, pos.z);
    groupRef.current.rotation.y = pos.ry;

    // Camera follow (third-person)
    const targetCamPos = new THREE.Vector3(
      pos.x - Math.sin(pos.ry) * CAMERA_DISTANCE,
      pos.y + CAMERA_HEIGHT,
      pos.z - Math.cos(pos.ry) * CAMERA_DISTANCE,
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

          {/* Sky */}
          <Sky sunPosition={[100, 60, 100]} turbidity={3} rayleigh={0.5} />

          {/* Scene content */}
          {sceneUrl ? (
            <>
              <GLTFScene url={sceneUrl} />
              {/* Still add terrain as a fallback floor */}
              <Terrain />
            </>
          ) : (
            <Terrain />
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

          {/* Environment map for reflections */}
          <Environment preset="sunset" />

          {/* Fog for depth */}
          <fog attach="fog" args={['#c9daf8', 60, 120]} />
        </Suspense>
      </Canvas>

      {/* WASD hint overlay */}
      <div className="absolute bottom-4 left-4 text-xs text-muted-foreground bg-background/60 backdrop-blur-sm rounded-lg px-3 py-2 pointer-events-none select-none">
        <span className="font-mono">W A S D</span> to move
      </div>
    </div>
  );
}

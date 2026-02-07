import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, useGLTF, Html, ContactShadows } from '@react-three/drei';
import { AvatarModel } from './AvatarModel';
import { type AvatarConfig, getAvatarPreset, AVATAR_PRESETS } from '@/lib/scene';
import type * as THREE from 'three';

interface SceneViewerProps {
  sceneUrl: string;
  /** Map of pubkey -> AvatarConfig for users in the scene */
  avatars?: Record<string, AvatarConfig>;
  /** Current user's pubkey (to highlight their avatar) */
  currentUserPubkey?: string;
  className?: string;
}

/** Loading fallback shown inside the 3D canvas */
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

/** Renders a loaded glTF scene */
function GLTFScene({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const ref = useRef<THREE.Group>(null);

  return (
    <group ref={ref}>
      <primitive object={scene} />
    </group>
  );
}

/** Default ground plane when no scene is loaded or as fallback */
function DefaultGround() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <gridHelper args={[50, 50, '#d1d5db', '#e5e7eb']} position={[0, 0, 0]} />
    </>
  );
}

/** Place avatars in a circle around the scene center */
function AvatarGroup({
  avatars,
  currentUserPubkey,
}: {
  avatars: Record<string, AvatarConfig>;
  currentUserPubkey?: string;
}) {
  const entries = Object.entries(avatars);
  const radius = Math.max(3, entries.length * 0.8);

  return (
    <>
      {entries.map(([pubkey, config], index) => {
        const angle = (index / entries.length) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const preset = getAvatarPreset(config.model);
        const isCurrentUser = pubkey === currentUserPubkey;

        return (
          <group key={pubkey} position={[x, 0, z]}>
            <AvatarModel
              preset={preset}
              color={config.color}
              isCurrentUser={isCurrentUser}
            />
            {/* Name label above avatar */}
            <Html position={[0, 2.4, 0]} center distanceFactor={10}>
              <div className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium shadow-lg ${
                isCurrentUser
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-card-foreground border border-border'
              }`}>
                {config.displayName || pubkey.slice(0, 8)}
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}

export function SceneViewer({ sceneUrl, avatars = {}, currentUserPubkey, className }: SceneViewerProps) {
  return (
    <div className={`w-full h-full min-h-[400px] rounded-xl overflow-hidden bg-muted/30 border border-border ${className ?? ''}`}>
      <Canvas
        shadows
        camera={{ position: [8, 6, 8], fov: 50 }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={<SceneLoader />}>
          {/* Lighting */}
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[10, 10, 5]}
            intensity={1}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />

          {/* Environment */}
          <Environment preset="city" />

          {/* Scene content */}
          {sceneUrl ? (
            <GLTFScene url={sceneUrl} />
          ) : (
            <DefaultGround />
          )}

          {/* Contact shadows */}
          <ContactShadows
            position={[0, 0, 0]}
            opacity={0.4}
            scale={20}
            blur={2}
          />

          {/* Avatars */}
          <AvatarGroup avatars={avatars} currentUserPubkey={currentUserPubkey} />

          {/* Controls */}
          <OrbitControls
            makeDefault
            minPolarAngle={0.2}
            maxPolarAngle={Math.PI / 2.1}
            minDistance={3}
            maxDistance={30}
            enableDamping
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Default avatar for preview purposes
SceneViewer.defaultAvatars = Object.fromEntries(
  AVATAR_PRESETS.slice(0, 3).map((p, i) => [
    `preview-${i}`,
    { model: p.id, color: p.color, displayName: p.name },
  ])
);

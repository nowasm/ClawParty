import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AvatarPreset } from '@/lib/scene';

interface AvatarModelProps {
  preset: AvatarPreset;
  color: string;
  isCurrentUser?: boolean;
  /** Enable idle animation (breathing, arm swing) */
  animate?: boolean;
}

/** Darken a hex color by a factor (0–1). */
function darken(hex: string, factor: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - factor);
  return `#${c.getHexString()}`;
}

/** Lighten a hex color by a factor (0–1). */
function lighten(hex: string, factor: number): string {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color('#ffffff'), factor);
  return `#${c.getHexString()}`;
}

/**
 * Minecraft-inspired 3D avatar using box geometry.
 * All characters share the same blocky skeleton with unique proportions per shape type.
 */
export function AvatarModel({ preset, color, isCurrentUser = false, animate = true }: AvatarModelProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const leftArmRef = useRef<THREE.Group>(null!);
  const rightArmRef = useRef<THREE.Group>(null!);
  const leftLegRef = useRef<THREE.Group>(null!);
  const rightLegRef = useRef<THREE.Group>(null!);

  const colors = useMemo(
    () => ({
      main: color,
      dark: darken(color, 0.25),
      darker: darken(color, 0.45),
      light: lighten(color, 0.2),
      accent: lighten(color, 0.4),
    }),
    [color],
  );

  // Idle animation
  useFrame((state) => {
    if (!animate) return;
    const t = state.clock.elapsedTime;

    // Gentle breathing
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(t * 1.2) * 0.02;
    }

    // Subtle arm/leg swing
    const swing = Math.sin(t * 1.8) * 0.12;
    if (leftArmRef.current) leftArmRef.current.rotation.x = swing;
    if (rightArmRef.current) rightArmRef.current.rotation.x = -swing;
    if (leftLegRef.current) leftLegRef.current.rotation.x = -swing * 0.6;
    if (rightLegRef.current) rightLegRef.current.rotation.x = swing * 0.6;
  });

  return (
    <group ref={groupRef}>
      {preset.shape === 'capsule' && (
        <ClassicSkin colors={colors} refs={{ leftArmRef, rightArmRef, leftLegRef, rightLegRef }} />
      )}
      {preset.shape === 'cube' && (
        <RobotSkin colors={colors} refs={{ leftArmRef, rightArmRef, leftLegRef, rightLegRef }} />
      )}
      {preset.shape === 'sphere' && (
        <SlimeSkin colors={colors} refs={{ leftArmRef, rightArmRef, leftLegRef, rightLegRef }} />
      )}
      {preset.shape === 'cylinder' && (
        <KnightSkin colors={colors} refs={{ leftArmRef, rightArmRef, leftLegRef, rightLegRef }} />
      )}

      {/* Current user indicator (glowing ring at feet) */}
      {isCurrentUser && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[0.45, 0.55, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.8}
            transparent
            opacity={0.6}
          />
        </mesh>
      )}
    </group>
  );
}

// ======================================================================
// Refs type
// ======================================================================
interface SkinRefs {
  leftArmRef: React.RefObject<THREE.Group>;
  rightArmRef: React.RefObject<THREE.Group>;
  leftLegRef: React.RefObject<THREE.Group>;
  rightLegRef: React.RefObject<THREE.Group>;
}

interface SkinProps {
  colors: { main: string; dark: string; darker: string; light: string; accent: string };
  refs: SkinRefs;
}

// ======================================================================
// Classic Skin (Steve-like Minecraft character)
// ======================================================================
function ClassicSkin({ colors, refs }: SkinProps) {
  return (
    <group>
      {/* Head */}
      <mesh position={[0, 1.55, 0]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color={colors.light} roughness={0.7} />
      </mesh>
      {/* Face - front plate */}
      <mesh position={[0, 1.55, 0.251]}>
        <planeGeometry args={[0.5, 0.5]} />
        <meshStandardMaterial color={colors.light} roughness={0.7} />
      </mesh>
      {/* Eyes */}
      <mesh position={[0.1, 1.6, 0.26]}>
        <boxGeometry args={[0.1, 0.06, 0.02]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[-0.1, 1.6, 0.26]}>
        <boxGeometry args={[0.1, 0.06, 0.02]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* Pupils */}
      <mesh position={[0.12, 1.6, 0.272]}>
        <boxGeometry args={[0.05, 0.05, 0.02]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      <mesh position={[-0.08, 1.6, 0.272]}>
        <boxGeometry args={[0.05, 0.05, 0.02]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      {/* Mouth */}
      <mesh position={[0, 1.47, 0.26]}>
        <boxGeometry args={[0.14, 0.03, 0.02]} />
        <meshStandardMaterial color={colors.darker} />
      </mesh>

      {/* Body */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[0.5, 0.7, 0.3]} />
        <meshStandardMaterial color={colors.main} roughness={0.6} />
      </mesh>
      {/* Belt / stripe */}
      <mesh position={[0, 0.68, 0.001]}>
        <boxGeometry args={[0.52, 0.06, 0.32]} />
        <meshStandardMaterial color={colors.dark} roughness={0.5} />
      </mesh>

      {/* Left Arm */}
      <group ref={refs.leftArmRef} position={[0.37, 1.2, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <boxGeometry args={[0.22, 0.65, 0.25]} />
          <meshStandardMaterial color={colors.dark} roughness={0.6} />
        </mesh>
        {/* Hand */}
        <mesh position={[0, -0.55, 0]}>
          <boxGeometry args={[0.18, 0.12, 0.2]} />
          <meshStandardMaterial color={colors.light} roughness={0.7} />
        </mesh>
      </group>

      {/* Right Arm */}
      <group ref={refs.rightArmRef} position={[-0.37, 1.2, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <boxGeometry args={[0.22, 0.65, 0.25]} />
          <meshStandardMaterial color={colors.dark} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.55, 0]}>
          <boxGeometry args={[0.18, 0.12, 0.2]} />
          <meshStandardMaterial color={colors.light} roughness={0.7} />
        </mesh>
      </group>

      {/* Left Leg */}
      <group ref={refs.leftLegRef} position={[0.13, 0.55, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <boxGeometry args={[0.22, 0.55, 0.26]} />
          <meshStandardMaterial color={colors.darker} roughness={0.6} />
        </mesh>
        {/* Shoe */}
        <mesh position={[0, -0.52, 0.03]}>
          <boxGeometry args={[0.24, 0.08, 0.32]} />
          <meshStandardMaterial color={colors.darker} roughness={0.5} />
        </mesh>
      </group>

      {/* Right Leg */}
      <group ref={refs.rightLegRef} position={[-0.13, 0.55, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <boxGeometry args={[0.22, 0.55, 0.26]} />
          <meshStandardMaterial color={colors.darker} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.52, 0.03]}>
          <boxGeometry args={[0.24, 0.08, 0.32]} />
          <meshStandardMaterial color={colors.darker} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

// ======================================================================
// Robot Skin (Blocky angular robot)
// ======================================================================
function RobotSkin({ colors, refs }: SkinProps) {
  return (
    <group>
      {/* Head - boxy with antenna */}
      <mesh position={[0, 1.6, 0]} castShadow>
        <boxGeometry args={[0.55, 0.45, 0.5]} />
        <meshStandardMaterial color={colors.main} metalness={0.4} roughness={0.3} />
      </mesh>
      {/* Visor */}
      <mesh position={[0, 1.62, 0.251]}>
        <boxGeometry args={[0.45, 0.15, 0.02]} />
        <meshStandardMaterial color="#00ff88" emissive="#00ff88" emissiveIntensity={0.6} metalness={0.8} />
      </mesh>
      {/* Antenna */}
      <mesh position={[0, 1.92, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.2, 6]} />
        <meshStandardMaterial color={colors.dark} metalness={0.6} />
      </mesh>
      <mesh position={[0, 2.05, 0]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#ff4444" emissive="#ff4444" emissiveIntensity={0.8} />
      </mesh>

      {/* Body - chunky torso */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[0.6, 0.75, 0.35]} />
        <meshStandardMaterial color={colors.dark} metalness={0.3} roughness={0.4} />
      </mesh>
      {/* Chest plate */}
      <mesh position={[0, 1.0, 0.176]}>
        <boxGeometry args={[0.35, 0.35, 0.02]} />
        <meshStandardMaterial color={colors.accent} metalness={0.5} roughness={0.3} />
      </mesh>

      {/* Left Arm */}
      <group ref={refs.leftArmRef} position={[0.42, 1.2, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <boxGeometry args={[0.22, 0.6, 0.25]} />
          <meshStandardMaterial color={colors.main} metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.48, 0]}>
          <boxGeometry args={[0.24, 0.18, 0.27]} />
          <meshStandardMaterial color={colors.dark} metalness={0.4} roughness={0.3} />
        </mesh>
      </group>

      {/* Right Arm */}
      <group ref={refs.rightArmRef} position={[-0.42, 1.2, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <boxGeometry args={[0.22, 0.6, 0.25]} />
          <meshStandardMaterial color={colors.main} metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.48, 0]}>
          <boxGeometry args={[0.24, 0.18, 0.27]} />
          <meshStandardMaterial color={colors.dark} metalness={0.4} roughness={0.3} />
        </mesh>
      </group>

      {/* Left Leg */}
      <group ref={refs.leftLegRef} position={[0.15, 0.52, 0]}>
        <mesh position={[0, -0.25, 0]} castShadow>
          <boxGeometry args={[0.25, 0.5, 0.28]} />
          <meshStandardMaterial color={colors.darker} metalness={0.3} roughness={0.4} />
        </mesh>
      </group>

      {/* Right Leg */}
      <group ref={refs.rightLegRef} position={[-0.15, 0.52, 0]}>
        <mesh position={[0, -0.25, 0]} castShadow>
          <boxGeometry args={[0.25, 0.5, 0.28]} />
          <meshStandardMaterial color={colors.darker} metalness={0.3} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

// ======================================================================
// Slime Skin (Cute round body with stubby limbs)
// ======================================================================
function SlimeSkin({ colors, refs }: SkinProps) {
  return (
    <group>
      {/* Main body (big round) */}
      <mesh position={[0, 0.85, 0]} castShadow>
        <boxGeometry args={[0.7, 0.7, 0.65]} />
        <meshStandardMaterial color={colors.main} roughness={0.4} transparent opacity={0.85} />
      </mesh>
      {/* Inner core (slightly visible) */}
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[0.35, 0.35, 0.32]} />
        <meshStandardMaterial color={colors.light} roughness={0.3} transparent opacity={0.5} />
      </mesh>

      {/* Eyes - big and cute */}
      <mesh position={[0.15, 1.0, 0.33]}>
        <boxGeometry args={[0.16, 0.18, 0.02]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[-0.15, 1.0, 0.33]}>
        <boxGeometry args={[0.16, 0.18, 0.02]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* Pupils */}
      <mesh position={[0.17, 0.98, 0.342]}>
        <boxGeometry args={[0.08, 0.1, 0.02]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      <mesh position={[-0.13, 0.98, 0.342]}>
        <boxGeometry args={[0.08, 0.1, 0.02]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      {/* Happy mouth */}
      <mesh position={[0, 0.78, 0.33]}>
        <boxGeometry args={[0.2, 0.04, 0.02]} />
        <meshStandardMaterial color={colors.darker} />
      </mesh>

      {/* Stubby arms */}
      <group ref={refs.leftArmRef} position={[0.4, 0.85, 0]}>
        <mesh position={[0.05, 0, 0]} castShadow>
          <boxGeometry args={[0.14, 0.22, 0.18]} />
          <meshStandardMaterial color={colors.dark} roughness={0.4} transparent opacity={0.85} />
        </mesh>
      </group>
      <group ref={refs.rightArmRef} position={[-0.4, 0.85, 0]}>
        <mesh position={[-0.05, 0, 0]} castShadow>
          <boxGeometry args={[0.14, 0.22, 0.18]} />
          <meshStandardMaterial color={colors.dark} roughness={0.4} transparent opacity={0.85} />
        </mesh>
      </group>

      {/* Stubby legs */}
      <group ref={refs.leftLegRef} position={[0.15, 0.45, 0]}>
        <mesh position={[0, -0.12, 0]} castShadow>
          <boxGeometry args={[0.2, 0.22, 0.22]} />
          <meshStandardMaterial color={colors.dark} roughness={0.4} transparent opacity={0.85} />
        </mesh>
      </group>
      <group ref={refs.rightLegRef} position={[-0.15, 0.45, 0]}>
        <mesh position={[0, -0.12, 0]} castShadow>
          <boxGeometry args={[0.2, 0.22, 0.22]} />
          <meshStandardMaterial color={colors.dark} roughness={0.4} transparent opacity={0.85} />
        </mesh>
      </group>
    </group>
  );
}

// ======================================================================
// Knight Skin (Armored warrior with helmet)
// ======================================================================
function KnightSkin({ colors, refs }: SkinProps) {
  return (
    <group>
      {/* Helmet */}
      <mesh position={[0, 1.6, 0]} castShadow>
        <boxGeometry args={[0.52, 0.52, 0.52]} />
        <meshStandardMaterial color={colors.dark} metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Visor slit */}
      <mesh position={[0, 1.6, 0.261]}>
        <boxGeometry args={[0.35, 0.08, 0.02]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      {/* Helmet crest */}
      <mesh position={[0, 1.9, 0]} castShadow>
        <boxGeometry args={[0.06, 0.12, 0.4]} />
        <meshStandardMaterial color={colors.accent} metalness={0.4} roughness={0.4} />
      </mesh>

      {/* Body - armored */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[0.55, 0.72, 0.32]} />
        <meshStandardMaterial color={colors.main} metalness={0.3} roughness={0.4} />
      </mesh>
      {/* Chest armor plate */}
      <mesh position={[0, 1.02, 0.161]}>
        <boxGeometry args={[0.4, 0.42, 0.02]} />
        <meshStandardMaterial color={colors.light} metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Belt */}
      <mesh position={[0, 0.66, 0]}>
        <boxGeometry args={[0.57, 0.08, 0.34]} />
        <meshStandardMaterial color={colors.darker} metalness={0.4} roughness={0.4} />
      </mesh>
      {/* Belt buckle */}
      <mesh position={[0, 0.66, 0.175]}>
        <boxGeometry args={[0.08, 0.08, 0.02]} />
        <meshStandardMaterial color="#FFD700" metalness={0.7} roughness={0.2} />
      </mesh>

      {/* Left Arm */}
      <group ref={refs.leftArmRef} position={[0.4, 1.2, 0]}>
        <mesh position={[0, -0.1, 0]} castShadow>
          <boxGeometry args={[0.24, 0.28, 0.28]} />
          <meshStandardMaterial color={colors.dark} metalness={0.4} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.38, 0]} castShadow>
          <boxGeometry args={[0.2, 0.3, 0.24]} />
          <meshStandardMaterial color={colors.main} metalness={0.3} roughness={0.4} />
        </mesh>
        {/* Gauntlet */}
        <mesh position={[0, -0.55, 0]}>
          <boxGeometry args={[0.22, 0.1, 0.26]} />
          <meshStandardMaterial color={colors.dark} metalness={0.5} roughness={0.3} />
        </mesh>
      </group>

      {/* Right Arm */}
      <group ref={refs.rightArmRef} position={[-0.4, 1.2, 0]}>
        <mesh position={[0, -0.1, 0]} castShadow>
          <boxGeometry args={[0.24, 0.28, 0.28]} />
          <meshStandardMaterial color={colors.dark} metalness={0.4} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.38, 0]} castShadow>
          <boxGeometry args={[0.2, 0.3, 0.24]} />
          <meshStandardMaterial color={colors.main} metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.55, 0]}>
          <boxGeometry args={[0.22, 0.1, 0.26]} />
          <meshStandardMaterial color={colors.dark} metalness={0.5} roughness={0.3} />
        </mesh>
      </group>

      {/* Left Leg */}
      <group ref={refs.leftLegRef} position={[0.14, 0.55, 0]}>
        <mesh position={[0, -0.26, 0]} castShadow>
          <boxGeometry args={[0.24, 0.55, 0.28]} />
          <meshStandardMaterial color={colors.darker} metalness={0.3} roughness={0.4} />
        </mesh>
        {/* Boot */}
        <mesh position={[0, -0.5, 0.04]}>
          <boxGeometry args={[0.26, 0.1, 0.34]} />
          <meshStandardMaterial color={colors.dark} metalness={0.4} roughness={0.4} />
        </mesh>
      </group>

      {/* Right Leg */}
      <group ref={refs.rightLegRef} position={[-0.14, 0.55, 0]}>
        <mesh position={[0, -0.26, 0]} castShadow>
          <boxGeometry args={[0.24, 0.55, 0.28]} />
          <meshStandardMaterial color={colors.darker} metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.5, 0.04]}>
          <boxGeometry args={[0.26, 0.1, 0.34]} />
          <meshStandardMaterial color={colors.dark} metalness={0.4} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

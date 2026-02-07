import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import type { AvatarPreset } from '@/lib/scene';

interface AvatarModelProps {
  preset: AvatarPreset;
  color: string;
  isCurrentUser?: boolean;
}

/**
 * Renders a 3D avatar using simple geometric shapes.
 * This is the initial version using primitives; can be replaced with glTF models later.
 */
export function AvatarModel({ preset, color, isCurrentUser = false }: AvatarModelProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Gentle floating animation
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.5) * 0.05;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Body */}
      {preset.shape === 'capsule' && (
        <>
          {/* Torso (cylinder) */}
          <mesh position={[0, 0.8, 0]} castShadow>
            <cylinderGeometry args={[0.3, 0.35, 0.8, 16]} />
            <meshStandardMaterial color={color} metalness={0.1} roughness={0.6} />
          </mesh>
          {/* Head (sphere) */}
          <mesh position={[0, 1.5, 0]} castShadow>
            <sphereGeometry args={[0.3, 16, 16]} />
            <meshStandardMaterial color={color} metalness={0.1} roughness={0.6} />
          </mesh>
          {/* Eyes */}
          <mesh position={[0.12, 1.55, 0.22]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[-0.12, 1.55, 0.22]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          {/* Pupils */}
          <mesh position={[0.12, 1.55, 0.27]}>
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshStandardMaterial color="#1a1a2e" />
          </mesh>
          <mesh position={[-0.12, 1.55, 0.27]}>
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshStandardMaterial color="#1a1a2e" />
          </mesh>
          {/* Legs */}
          <mesh position={[0.15, 0.2, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.12, 0.4, 8]} />
            <meshStandardMaterial color={color} metalness={0.1} roughness={0.6} />
          </mesh>
          <mesh position={[-0.15, 0.2, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.12, 0.4, 8]} />
            <meshStandardMaterial color={color} metalness={0.1} roughness={0.6} />
          </mesh>
        </>
      )}

      {preset.shape === 'cube' && (
        <>
          <mesh position={[0, 0.7, 0]} castShadow>
            <boxGeometry args={[0.7, 0.7, 0.7]} />
            <meshStandardMaterial color={color} metalness={0.2} roughness={0.4} />
          </mesh>
          <mesh position={[0, 1.4, 0]} castShadow>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshStandardMaterial color={color} metalness={0.2} roughness={0.4} />
          </mesh>
          {/* Eyes */}
          <mesh position={[0.1, 1.45, 0.24]}>
            <boxGeometry args={[0.08, 0.08, 0.04]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[-0.1, 1.45, 0.24]}>
            <boxGeometry args={[0.08, 0.08, 0.04]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        </>
      )}

      {preset.shape === 'sphere' && (
        <>
          <mesh position={[0, 0.8, 0]} castShadow>
            <sphereGeometry args={[0.5, 24, 24]} />
            <meshStandardMaterial color={color} metalness={0.3} roughness={0.3} />
          </mesh>
          {/* Eyes */}
          <mesh position={[0.15, 0.9, 0.4]}>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[-0.15, 0.9, 0.4]}>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0.15, 0.9, 0.47]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#1a1a2e" />
          </mesh>
          <mesh position={[-0.15, 0.9, 0.47]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#1a1a2e" />
          </mesh>
        </>
      )}

      {preset.shape === 'cylinder' && (
        <>
          <mesh position={[0, 0.8, 0]} castShadow>
            <cylinderGeometry args={[0.3, 0.3, 1.2, 12]} />
            <meshStandardMaterial color={color} metalness={0.4} roughness={0.3} />
          </mesh>
          <mesh position={[0, 1.6, 0]} castShadow>
            <cylinderGeometry args={[0.25, 0.3, 0.4, 12]} />
            <meshStandardMaterial color={color} metalness={0.4} roughness={0.3} />
          </mesh>
          {/* Eyes */}
          <mesh position={[0.1, 1.65, 0.2]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[-0.1, 1.65, 0.2]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} />
          </mesh>
        </>
      )}

      {/* Current user indicator (glowing ring at feet) */}
      {isCurrentUser && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[0.5, 0.6, 32]} />
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

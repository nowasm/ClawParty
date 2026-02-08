import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ======================================================================
// Constants
// ======================================================================

/** Classic lobster red */
const LOBSTER_BODY = '#CC3322';
const LOBSTER_DARK = '#A02818';
const LOBSTER_BELLY = '#E8795A';
const LOBSTER_CLAW = '#D44030';
const LOBSTER_EYE = '#111111';
const LOBSTER_EYE_STALK = '#DD5533';

/** Lobster scale – it's a small pet */
const SCALE = 0.32;

/** Leash attachment point Y (from avatar hand level) */
const LEASH_START_Y = 1.8;
const LEASH_END_Y = 0.35;

// ======================================================================
// Types
// ======================================================================

interface LobsterPetProps {
  /** Movement state of the owner avatar */
  moveState?: 'idle' | 'walk' | 'run';
  /** Owner outfit color – used for leash */
  leashColor?: string;
  /** Whether to animate */
  animate?: boolean;
}

// ======================================================================
// Leash (catenary-like curve from hand to lobster, rendered as thin tube)
// ======================================================================

function Leash({ color }: { color: string }) {
  const meshRef = useRef<THREE.Mesh>(null!);

  const tubeGeometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const segments = 14;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const sag = Math.sin(t * Math.PI) * 0.25;
      const y = LEASH_START_Y + (LEASH_END_Y - LEASH_START_Y) * t - sag;
      points.push(new THREE.Vector3(0, y, 0));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, 12, 0.012, 4, false);
  }, []);

  return (
    <mesh ref={meshRef} geometry={tubeGeometry}>
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  );
}

// ======================================================================
// Lobster Body Parts
// ======================================================================

/** Single claw (mirrored via scaleX) */
function Claw({ side }: { side: 'left' | 'right' }) {
  const sign = side === 'left' ? 1 : -1;
  return (
    <group position={[sign * 0.35, 0.25, 0.55]}>
      {/* Arm segment */}
      <mesh rotation={[0.4, sign * 0.3, 0]}>
        <capsuleGeometry args={[0.06, 0.25, 4, 8]} />
        <meshStandardMaterial color={LOBSTER_BODY} roughness={0.75} />
      </mesh>
      {/* Claw pincer - upper */}
      <mesh position={[sign * 0.02, 0.02, 0.28]} rotation={[0.1, sign * 0.2, sign * 0.3]}>
        <boxGeometry args={[0.14, 0.06, 0.22]} />
        <meshStandardMaterial color={LOBSTER_CLAW} roughness={0.7} />
      </mesh>
      {/* Claw pincer - lower (slightly open) */}
      <mesh position={[sign * 0.02, -0.04, 0.26]} rotation={[-0.15, sign * 0.2, sign * 0.2]}>
        <boxGeometry args={[0.12, 0.05, 0.18]} />
        <meshStandardMaterial color={LOBSTER_DARK} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Walking legs (3 pairs) */
function Legs() {
  const pairs = [0.15, 0, -0.15];
  return (
    <group>
      {pairs.map((zOff, i) => (
        <group key={i}>
          {/* Left leg */}
          <mesh position={[0.22, 0.05, zOff]} rotation={[0, 0, 0.6]}>
            <capsuleGeometry args={[0.025, 0.18, 3, 6]} />
            <meshStandardMaterial color={LOBSTER_DARK} roughness={0.8} />
          </mesh>
          {/* Right leg */}
          <mesh position={[-0.22, 0.05, zOff]} rotation={[0, 0, -0.6]}>
            <capsuleGeometry args={[0.025, 0.18, 3, 6]} />
            <meshStandardMaterial color={LOBSTER_DARK} roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Eye stalks */
function Eyes() {
  return (
    <group position={[0, 0.32, 0.30]}>
      {/* Left stalk */}
      <group position={[0.10, 0, 0]} rotation={[0.3, 0, 0.2]}>
        <mesh position={[0, 0.06, 0]}>
          <capsuleGeometry args={[0.025, 0.08, 4, 6]} />
          <meshStandardMaterial color={LOBSTER_EYE_STALK} roughness={0.75} />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial color={LOBSTER_EYE} roughness={0.5} metalness={0.3} />
        </mesh>
        {/* Eye highlight */}
        <mesh position={[0.015, 0.135, 0.015]}>
          <sphereGeometry args={[0.015, 6, 6]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
      {/* Right stalk */}
      <group position={[-0.10, 0, 0]} rotation={[0.3, 0, -0.2]}>
        <mesh position={[0, 0.06, 0]}>
          <capsuleGeometry args={[0.025, 0.08, 4, 6]} />
          <meshStandardMaterial color={LOBSTER_EYE_STALK} roughness={0.75} />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial color={LOBSTER_EYE} roughness={0.5} metalness={0.3} />
        </mesh>
        <mesh position={[-0.015, 0.135, 0.015]}>
          <sphereGeometry args={[0.015, 6, 6]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
    </group>
  );
}

/** Tail fan segments */
function TailFan() {
  return (
    <group position={[0, 0.12, -0.55]}>
      {/* Center tail segment */}
      <mesh rotation={[-0.2, 0, 0]}>
        <capsuleGeometry args={[0.08, 0.15, 4, 8]} />
        <meshStandardMaterial color={LOBSTER_DARK} roughness={0.75} />
      </mesh>
      {/* Tail flap segments */}
      <mesh position={[0, -0.02, -0.14]} rotation={[-0.4, 0, 0]}>
        <boxGeometry args={[0.22, 0.03, 0.12]} />
        <meshStandardMaterial color={LOBSTER_BODY} roughness={0.7} />
      </mesh>
      {/* Left tail fin */}
      <mesh position={[0.10, -0.02, -0.12]} rotation={[-0.3, 0.3, 0]}>
        <boxGeometry args={[0.10, 0.025, 0.10]} />
        <meshStandardMaterial color={LOBSTER_BODY} roughness={0.7} />
      </mesh>
      {/* Right tail fin */}
      <mesh position={[-0.10, -0.02, -0.12]} rotation={[-0.3, -0.3, 0]}>
        <boxGeometry args={[0.10, 0.025, 0.10]} />
        <meshStandardMaterial color={LOBSTER_BODY} roughness={0.7} />
      </mesh>
    </group>
  );
}

// ======================================================================
// Main LobsterPet Component
// ======================================================================

export function LobsterPet({ moveState = 'idle', leashColor = '#8B6914', animate = true }: LobsterPetProps) {
  const lobsterGroupRef = useRef<THREE.Group>(null!);
  const leftClawRef = useRef<THREE.Group>(null!);
  const rightClawRef = useRef<THREE.Group>(null!);
  const bodyRef = useRef<THREE.Group>(null!);
  const tailRef = useRef<THREE.Group>(null!);
  const antennaLRef = useRef<THREE.Mesh>(null!);
  const antennaRRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    if (!animate) return;
    const t = state.clock.elapsedTime;

    if (moveState === 'idle') {
      // Gentle side-to-side sway
      if (lobsterGroupRef.current) {
        lobsterGroupRef.current.position.y = Math.sin(t * 1.8) * 0.01;
        lobsterGroupRef.current.rotation.y = Math.sin(t * 0.7) * 0.08;
      }
      // Claw open/close idle animation
      if (leftClawRef.current) {
        leftClawRef.current.rotation.z = Math.sin(t * 1.5) * 0.1 + 0.05;
      }
      if (rightClawRef.current) {
        rightClawRef.current.rotation.z = -Math.sin(t * 1.5 + 1) * 0.1 - 0.05;
      }
      // Antenna sway
      if (antennaLRef.current) {
        antennaLRef.current.rotation.z = Math.sin(t * 2) * 0.1 + 0.1;
      }
      if (antennaRRef.current) {
        antennaRRef.current.rotation.z = -Math.sin(t * 2 + 0.5) * 0.1 - 0.1;
      }
      // Tail gentle wave
      if (tailRef.current) {
        tailRef.current.rotation.x = Math.sin(t * 1.2) * 0.05;
      }
    } else {
      // Walk / Run animation
      const speed = moveState === 'run' ? 14 : 8;
      const intensity = moveState === 'run' ? 1.5 : 1.0;

      // Body bobbing
      if (lobsterGroupRef.current) {
        lobsterGroupRef.current.position.y = Math.abs(Math.sin(t * speed)) * 0.02 * intensity;
        lobsterGroupRef.current.rotation.y = Math.sin(t * speed * 0.5) * 0.04;
      }
      // Claw pumping animation
      if (leftClawRef.current) {
        leftClawRef.current.rotation.x = Math.sin(t * speed) * 0.2 * intensity;
        leftClawRef.current.rotation.z = Math.sin(t * speed * 0.7) * 0.15 * intensity + 0.05;
      }
      if (rightClawRef.current) {
        rightClawRef.current.rotation.x = -Math.sin(t * speed) * 0.2 * intensity;
        rightClawRef.current.rotation.z = -Math.sin(t * speed * 0.7 + 1) * 0.15 * intensity - 0.05;
      }
      // Antenna bouncing
      if (antennaLRef.current) {
        antennaLRef.current.rotation.z = Math.sin(t * speed * 1.2) * 0.15 * intensity + 0.1;
      }
      if (antennaRRef.current) {
        antennaRRef.current.rotation.z = -Math.sin(t * speed * 1.2 + 0.5) * 0.15 * intensity - 0.1;
      }
      // Tail wagging
      if (tailRef.current) {
        tailRef.current.rotation.x = Math.sin(t * speed) * 0.1 * intensity;
        tailRef.current.rotation.y = Math.sin(t * speed * 0.8) * 0.08 * intensity;
      }
    }
  });

  return (
    <group position={[0.65, 0, 0.15]}>
      {/* Leash from above (avatar hand) down to lobster */}
      <Leash color={leashColor} />

      {/* The lobster itself, scaled down */}
      <group ref={lobsterGroupRef} scale={[SCALE, SCALE, SCALE]} position={[0, 0.08, 0]}>
        {/* Main body */}
        <group ref={bodyRef}>
          {/* Body - segmented carapace */}
          <mesh position={[0, 0.20, 0]} castShadow>
            <capsuleGeometry args={[0.16, 0.35, 8, 12]} />
            <meshStandardMaterial color={LOBSTER_BODY} roughness={0.7} />
          </mesh>
          {/* Belly (lighter underside) */}
          <mesh position={[0, 0.12, 0]} scale={[0.85, 0.6, 0.85]}>
            <capsuleGeometry args={[0.14, 0.30, 6, 10]} />
            <meshStandardMaterial color={LOBSTER_BELLY} roughness={0.8} />
          </mesh>
          {/* Carapace ridge line */}
          <mesh position={[0, 0.36, 0]}>
            <boxGeometry args={[0.04, 0.02, 0.30]} />
            <meshStandardMaterial color={LOBSTER_DARK} roughness={0.7} />
          </mesh>

          {/* Eyes */}
          <Eyes />

          {/* Antennae */}
          <group position={[0, 0.30, 0.38]}>
            <mesh ref={antennaLRef} position={[0.06, 0.05, 0.10]} rotation={[0.5, 0.3, 0.1]}>
              <capsuleGeometry args={[0.012, 0.35, 3, 4]} />
              <meshStandardMaterial color={LOBSTER_DARK} roughness={0.8} />
            </mesh>
            <mesh ref={antennaRRef} position={[-0.06, 0.05, 0.10]} rotation={[0.5, -0.3, -0.1]}>
              <capsuleGeometry args={[0.012, 0.35, 3, 4]} />
              <meshStandardMaterial color={LOBSTER_DARK} roughness={0.8} />
            </mesh>
          </group>

          {/* Legs */}
          <Legs />
        </group>

        {/* Left Claw */}
        <group ref={leftClawRef}>
          <Claw side="left" />
        </group>

        {/* Right Claw */}
        <group ref={rightClawRef}>
          <Claw side="right" />
        </group>

        {/* Tail */}
        <group ref={tailRef}>
          <TailFan />
        </group>
      </group>
    </group>
  );
}

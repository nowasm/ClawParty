import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  type AvatarPreset,
  type ExpressionType,
  type ActionType,
  EMOJI_ACTIONS,
} from '@/lib/scene';
import { LobsterPet } from './LobsterPet';

// ======================================================================
// Constants
// ======================================================================

const SKIN_COLOR = '#FFE0BD';
const CHEEK_COLOR = '#FFB5B5';
const EYE_COLOR = '#2D1B14';
const MOUTH_COLOR = '#C47A6C';

const HEAD_Y = 1.30;
const HEAD_R = 0.38;
const FACE_Z = HEAD_R + 0.01;

const BODY_Y = 0.72;
const ARM_PIVOT_Y = 0.95;
const ARM_X = 0.30;
const LEG_PIVOT_Y = 0.48;
const LEG_X = 0.13;

const ACTION_DURATION = 2.5;

// ======================================================================
// Types
// ======================================================================

interface AvatarModelProps {
  preset: AvatarPreset;
  color: string;
  hairStyle?: string;
  hairColor?: string;
  isCurrentUser?: boolean;
  /** Enable idle animation */
  animate?: boolean;
  /** Active emoji triggers action animation + expression change */
  emoji?: string | null;
  /** Movement state: idle = idle anim, walk = walk cycle, run = run cycle */
  moveState?: 'idle' | 'walk' | 'run';
}

// ======================================================================
// Color Utilities
// ======================================================================

function darken(hex: string, factor: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - factor);
  return `#${c.getHexString()}`;
}

function lighten(hex: string, factor: number): string {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color('#ffffff'), factor);
  return `#${c.getHexString()}`;
}

// ======================================================================
// Easing
// ======================================================================

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ======================================================================
// Face Expression Component
// ======================================================================

function FaceExpression({ expression }: { expression: ExpressionType }) {
  return (
    <group position={[0, 0, FACE_Z]}>
      {/* ---- EYES ---- */}

      {/* Normal / Surprised: round dot eyes */}
      {(expression === 'normal' || expression === 'surprised') && (
        <>
          <mesh position={[-0.11, 0.05, 0]}>
            <circleGeometry args={[expression === 'surprised' ? 0.055 : 0.04, 16]} />
            <meshBasicMaterial color={EYE_COLOR} />
          </mesh>
          <mesh position={[0.11, 0.05, 0]}>
            <circleGeometry args={[expression === 'surprised' ? 0.055 : 0.04, 16]} />
            <meshBasicMaterial color={EYE_COLOR} />
          </mesh>
          {/* Sparkle highlights */}
          <mesh position={[-0.09, 0.07, 0.001]}>
            <circleGeometry args={[0.014, 8]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0.13, 0.07, 0.001]}>
            <circleGeometry args={[0.014, 8]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </>
      )}

      {/* Happy / Love: curved ^_^ eyes */}
      {(expression === 'happy' || expression === 'love') && (
        <>
          {/* Left eye ^ shape */}
          <mesh position={[-0.13, 0.055, 0]} rotation={[0, 0, 0.5]}>
            <boxGeometry args={[0.055, 0.016, 0.004]} />
            <meshBasicMaterial color={expression === 'love' ? '#e8457a' : EYE_COLOR} />
          </mesh>
          <mesh position={[-0.09, 0.055, 0]} rotation={[0, 0, -0.5]}>
            <boxGeometry args={[0.055, 0.016, 0.004]} />
            <meshBasicMaterial color={expression === 'love' ? '#e8457a' : EYE_COLOR} />
          </mesh>
          {/* Right eye ^ shape */}
          <mesh position={[0.09, 0.055, 0]} rotation={[0, 0, 0.5]}>
            <boxGeometry args={[0.055, 0.016, 0.004]} />
            <meshBasicMaterial color={expression === 'love' ? '#e8457a' : EYE_COLOR} />
          </mesh>
          <mesh position={[0.13, 0.055, 0]} rotation={[0, 0, -0.5]}>
            <boxGeometry args={[0.055, 0.016, 0.004]} />
            <meshBasicMaterial color={expression === 'love' ? '#e8457a' : EYE_COLOR} />
          </mesh>
        </>
      )}

      {/* Laugh: squinted horizontal line eyes */}
      {expression === 'laugh' && (
        <>
          <mesh position={[-0.11, 0.05, 0]}>
            <boxGeometry args={[0.08, 0.018, 0.004]} />
            <meshBasicMaterial color={EYE_COLOR} />
          </mesh>
          <mesh position={[0.11, 0.05, 0]}>
            <boxGeometry args={[0.08, 0.018, 0.004]} />
            <meshBasicMaterial color={EYE_COLOR} />
          </mesh>
        </>
      )}

      {/* ---- NOSE ---- */}
      <mesh position={[0, -0.02, 0]}>
        <circleGeometry args={[0.014, 8]} />
        <meshBasicMaterial color={darken(SKIN_COLOR, 0.15)} />
      </mesh>

      {/* ---- MOUTH ---- */}

      {/* Normal: small content line */}
      {expression === 'normal' && (
        <mesh position={[0, -0.09, 0]}>
          <boxGeometry args={[0.055, 0.014, 0.004]} />
          <meshBasicMaterial color={MOUTH_COLOR} />
        </mesh>
      )}

      {/* Happy / Love: curved smile */}
      {(expression === 'happy' || expression === 'love') && (
        <mesh position={[0, -0.085, 0]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.04, 0.008, 4, 12, Math.PI]} />
          <meshBasicMaterial color={MOUTH_COLOR} />
        </mesh>
      )}

      {/* Surprised: small O mouth */}
      {expression === 'surprised' && (
        <mesh position={[0, -0.09, 0]}>
          <circleGeometry args={[0.025, 16]} />
          <meshBasicMaterial color={MOUTH_COLOR} />
        </mesh>
      )}

      {/* Laugh: wide open mouth */}
      {expression === 'laugh' && (
        <mesh position={[0, -0.085, 0]}>
          <circleGeometry args={[0.04, 16]} />
          <meshBasicMaterial color={MOUTH_COLOR} />
        </mesh>
      )}

      {/* ---- CHEEK BLUSH ---- */}
      <mesh position={[-0.19, -0.02, -0.01]}>
        <circleGeometry args={[0.038, 12]} />
        <meshBasicMaterial
          color={CHEEK_COLOR}
          transparent
          opacity={expression === 'love' ? 0.7 : expression === 'happy' ? 0.5 : 0.25}
        />
      </mesh>
      <mesh position={[0.19, -0.02, -0.01]}>
        <circleGeometry args={[0.038, 12]} />
        <meshBasicMaterial
          color={CHEEK_COLOR}
          transparent
          opacity={expression === 'love' ? 0.7 : expression === 'happy' ? 0.5 : 0.25}
        />
      </mesh>
    </group>
  );
}

// ======================================================================
// Hair Mesh Component
// ======================================================================

function HairMesh({ style, color }: { style: string; color: string }) {
  if (style === 'none') return null;

  switch (style) {
    case 'short':
      return (
        <group>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[HEAD_R + 0.03, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.48]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Front bangs */}
          <mesh position={[0, 0.20, HEAD_R * 0.52]} rotation={[-0.3, 0, 0]}>
            <boxGeometry args={[0.26, 0.06, 0.07]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        </group>
      );

    case 'messy':
      return (
        <group>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[HEAD_R + 0.04, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.50]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
          {/* Tufts */}
          <mesh position={[0.09, HEAD_R + 0.02, 0.05]}>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
          <mesh position={[-0.10, HEAD_R + 0.04, 0.02]}>
            <sphereGeometry args={[0.07, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
          <mesh position={[0.04, HEAD_R + 0.06, -0.06]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
          {/* Bangs */}
          <mesh position={[0.06, 0.16, HEAD_R * 0.58]} rotation={[-0.4, 0.2, 0.1]}>
            <boxGeometry args={[0.11, 0.07, 0.06]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          <mesh position={[-0.07, 0.17, HEAD_R * 0.52]} rotation={[-0.3, -0.2, -0.1]}>
            <boxGeometry args={[0.10, 0.06, 0.06]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        </group>
      );

    case 'bob':
      return (
        <group>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[HEAD_R + 0.04, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.60]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Side hair */}
          <mesh position={[HEAD_R * 0.78, -0.10, 0]}>
            <capsuleGeometry args={[0.055, 0.10, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          <mesh position={[-HEAD_R * 0.78, -0.10, 0]}>
            <capsuleGeometry args={[0.055, 0.10, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Bangs */}
          <mesh position={[0, 0.16, HEAD_R * 0.58]} rotation={[-0.25, 0, 0]}>
            <boxGeometry args={[0.30, 0.06, 0.06]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        </group>
      );

    case 'long':
      return (
        <group>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[HEAD_R + 0.03, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Long back hair */}
          <mesh position={[0, -0.28, -HEAD_R * 0.50]}>
            <capsuleGeometry args={[0.13, 0.32, 6, 10]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Side hair */}
          <mesh position={[HEAD_R * 0.62, -0.18, -0.04]}>
            <capsuleGeometry args={[0.045, 0.16, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          <mesh position={[-HEAD_R * 0.62, -0.18, -0.04]}>
            <capsuleGeometry args={[0.045, 0.16, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Bangs */}
          <mesh position={[0, 0.17, HEAD_R * 0.58]} rotation={[-0.25, 0, 0]}>
            <boxGeometry args={[0.28, 0.06, 0.06]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        </group>
      );

    case 'ponytail':
      return (
        <group>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[HEAD_R + 0.03, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.48]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Ponytail */}
          <mesh position={[0, 0.06, -HEAD_R - 0.08]} rotation={[0.5, 0, 0]}>
            <capsuleGeometry args={[0.055, 0.22, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Hair tie */}
          <mesh position={[0, 0.10, -HEAD_R - 0.02]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.045, 0.014, 8, 12]} />
            <meshStandardMaterial color={darken(color, 0.3)} roughness={0.6} />
          </mesh>
          {/* Bangs */}
          <mesh position={[0, 0.19, HEAD_R * 0.52]} rotation={[-0.3, 0, 0]}>
            <boxGeometry args={[0.24, 0.06, 0.06]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        </group>
      );

    case 'spiky':
      return (
        <group>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[HEAD_R + 0.02, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.42]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Spikes */}
          {([
            { pos: [0, 0.36, 0] as [number, number, number], rot: [0, 0, 0] as [number, number, number] },
            { pos: [0.09, 0.32, 0.06] as [number, number, number], rot: [0.2, 0, 0.35] as [number, number, number] },
            { pos: [-0.09, 0.32, 0.06] as [number, number, number], rot: [0.2, 0, -0.35] as [number, number, number] },
            { pos: [0, 0.30, -0.10] as [number, number, number], rot: [-0.35, 0, 0] as [number, number, number] },
            { pos: [0.13, 0.28, -0.03] as [number, number, number], rot: [-0.1, 0, 0.55] as [number, number, number] },
            { pos: [-0.13, 0.28, -0.03] as [number, number, number], rot: [-0.1, 0, -0.55] as [number, number, number] },
          ]).map((spike, i) => (
            <mesh key={i} position={spike.pos} rotation={spike.rot}>
              <coneGeometry args={[0.035, 0.12, 6]} />
              <meshStandardMaterial color={color} roughness={0.85} />
            </mesh>
          ))}
        </group>
      );

    case 'curly':
      return (
        <group>
          <mesh position={[0, 0.02, 0]}>
            <sphereGeometry args={[HEAD_R + 0.08, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
            <meshStandardMaterial color={color} roughness={0.95} />
          </mesh>
          {/* Extra puffs */}
          {([
            [0.16, 0.14, 0.10],
            [-0.16, 0.14, 0.10],
            [0.21, 0.02, -0.04],
            [-0.21, 0.02, -0.04],
            [0, HEAD_R + 0.10, 0],
            [0.10, 0.08, -0.14],
            [-0.10, 0.08, -0.14],
          ] as const).map((pos, i) => (
            <mesh key={i} position={pos}>
              <sphereGeometry args={[0.065 + Math.sin(i * 2.5) * 0.015, 8, 8]} />
              <meshStandardMaterial color={color} roughness={0.95} />
            </mesh>
          ))}
        </group>
      );

    case 'bun':
      return (
        <group>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[HEAD_R + 0.03, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.46]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Bun on top */}
          <mesh position={[0, HEAD_R + 0.06, -0.04]}>
            <sphereGeometry args={[0.09, 12, 12]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Bangs */}
          <mesh position={[0, 0.19, HEAD_R * 0.52]} rotation={[-0.25, 0, 0]}>
            <boxGeometry args={[0.26, 0.06, 0.06]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        </group>
      );

    default:
      return null;
  }
}

// ======================================================================
// Main Avatar Component (Animal Crossing Style)
// ======================================================================

export function AvatarModel({
  color,
  hairStyle = 'short',
  hairColor = '#3d2914',
  isCurrentUser = false,
  animate = true,
  emoji,
  moveState = 'idle',
}: AvatarModelProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const headRef = useRef<THREE.Group>(null!);
  const leftArmRef = useRef<THREE.Group>(null!);
  const rightArmRef = useRef<THREE.Group>(null!);
  const leftLegRef = useRef<THREE.Group>(null!);
  const rightLegRef = useRef<THREE.Group>(null!);

  const [expression, setExpression] = useState<ExpressionType>('normal');

  const colors = useMemo(
    () => ({
      main: color,
      dark: darken(color, 0.20),
      darker: darken(color, 0.35),
      light: lighten(color, 0.15),
    }),
    [color],
  );

  // Animation state (refs to avoid re-renders in the animation loop)
  const currentAction = useRef<ActionType | null>(null);
  const animStart = useRef(0);
  const pendingEmoji = useRef<string | null>(null);

  // Detect emoji changes
  useEffect(() => {
    if (emoji) {
      pendingEmoji.current = emoji;
      const mapping = EMOJI_ACTIONS[emoji];
      if (mapping) {
        setExpression(mapping.expression);
      }
    }
  }, [emoji]);

  // Reset rotations to default
  function resetPose() {
    if (leftArmRef.current) leftArmRef.current.rotation.set(0, 0, 0);
    if (rightArmRef.current) rightArmRef.current.rotation.set(0, 0, 0);
    if (leftLegRef.current) leftLegRef.current.rotation.set(0, 0, 0);
    if (rightLegRef.current) rightLegRef.current.rotation.set(0, 0, 0);
    if (headRef.current) headRef.current.rotation.set(0, 0, 0);
    if (groupRef.current) groupRef.current.position.y = 0;
  }

  // Idle animation
  function applyIdle(t: number) {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(t * 1.5) * 0.015;
    }
    const armSwing = Math.sin(t * 1.2) * 0.08;
    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = armSwing;
      leftArmRef.current.rotation.z = 0;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = -armSwing;
      rightArmRef.current.rotation.z = 0;
    }
    const legSwing = Math.sin(t * 1.2) * 0.04;
    if (leftLegRef.current) leftLegRef.current.rotation.x = -legSwing;
    if (rightLegRef.current) rightLegRef.current.rotation.x = legSwing;
    if (headRef.current) {
      headRef.current.rotation.z = Math.sin(t * 0.8) * 0.03;
      headRef.current.rotation.x = 0;
    }
  }

  // Walk animation (moderate cycle speed, moderate arm/leg swing)
  function applyWalk(t: number) {
    const cycle = t * 9;
    const legSwing = Math.sin(cycle) * 0.35;
    const armSwing = Math.sin(cycle) * 0.4;
    if (groupRef.current) {
      groupRef.current.position.y = Math.abs(Math.sin(cycle)) * 0.03;
    }
    if (leftLegRef.current) leftLegRef.current.rotation.x = -legSwing;
    if (rightLegRef.current) rightLegRef.current.rotation.x = legSwing;
    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = -armSwing;
      leftArmRef.current.rotation.z = 0.05;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = armSwing;
      rightArmRef.current.rotation.z = -0.05;
    }
    if (headRef.current) {
      headRef.current.rotation.x = 0;
      headRef.current.rotation.z = Math.sin(t * 0.6) * 0.02;
    }
  }

  // Run animation (faster cycle, larger arm/leg swing, body lean)
  function applyRun(t: number) {
    const cycle = t * 11;
    const legSwing = Math.sin(cycle) * 0.55;
    const armSwing = Math.sin(cycle) * 0.7;
    if (groupRef.current) {
      groupRef.current.position.y = Math.abs(Math.sin(cycle)) * 0.06;
    }
    if (leftLegRef.current) leftLegRef.current.rotation.x = -legSwing;
    if (rightLegRef.current) rightLegRef.current.rotation.x = legSwing;
    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = -armSwing;
      leftArmRef.current.rotation.z = 0.12;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = armSwing;
      rightArmRef.current.rotation.z = -0.12;
    }
    if (headRef.current) {
      headRef.current.rotation.x = 0.08;
      headRef.current.rotation.z = Math.sin(t * 1.2) * 0.03;
    }
  }

  // Action animation
  function applyAction(action: ActionType, progress: number, t: number) {
    const eased = easeInOutQuad(Math.min(progress * 3, 1));
    const exitFactor = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;
    const intensity = eased * exitFactor;

    switch (action) {
      case 'wave': {
        if (rightArmRef.current) {
          rightArmRef.current.rotation.z = -2.2 * intensity;
          rightArmRef.current.rotation.x = Math.sin(t * 8) * 0.3 * intensity;
        }
        if (leftArmRef.current) {
          leftArmRef.current.rotation.x = Math.sin(t * 1.2) * 0.05;
          leftArmRef.current.rotation.z = 0;
        }
        if (headRef.current) headRef.current.rotation.z = 0.15 * intensity;
        if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
        if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
        if (groupRef.current) groupRef.current.position.y = Math.sin(t * 3) * 0.02 * intensity;
        break;
      }
      case 'clap': {
        const clapCycle = Math.sin(t * 10) * 0.3 * intensity;
        if (leftArmRef.current) {
          leftArmRef.current.rotation.x = -1.2 * intensity;
          leftArmRef.current.rotation.z = (-0.3 + clapCycle * 0.5) * intensity;
        }
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = -1.2 * intensity;
          rightArmRef.current.rotation.z = (0.3 - clapCycle * 0.5) * intensity;
        }
        if (groupRef.current) groupRef.current.position.y = Math.abs(Math.sin(t * 10)) * 0.04 * intensity;
        if (headRef.current) headRef.current.rotation.set(0, 0, Math.sin(t * 5) * 0.06 * intensity);
        if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
        if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
        break;
      }
      case 'jump': {
        const jumpPhase = Math.sin(progress * Math.PI * 4);
        const jumpH = Math.max(0, jumpPhase) * 0.4 * intensity;
        if (groupRef.current) groupRef.current.position.y = jumpH;
        const armUp = Math.max(0, jumpPhase) * intensity;
        if (leftArmRef.current) {
          leftArmRef.current.rotation.z = 2.5 * armUp;
          leftArmRef.current.rotation.x = 0;
        }
        if (rightArmRef.current) {
          rightArmRef.current.rotation.z = -2.5 * armUp;
          rightArmRef.current.rotation.x = 0;
        }
        if (headRef.current) headRef.current.rotation.set(0, 0, 0);
        if (leftLegRef.current) leftLegRef.current.rotation.x = -0.2 * armUp;
        if (rightLegRef.current) rightLegRef.current.rotation.x = -0.2 * armUp;
        break;
      }
      case 'dance': {
        const sway = Math.sin(t * 4) * 0.15 * intensity;
        const armDance = Math.sin(t * 4) * 1.0 * intensity;
        if (groupRef.current) groupRef.current.position.y = Math.abs(Math.sin(t * 8)) * 0.05 * intensity;
        if (headRef.current) headRef.current.rotation.z = sway;
        if (leftArmRef.current) {
          leftArmRef.current.rotation.x = armDance;
          leftArmRef.current.rotation.z = 0.8 * intensity;
        }
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = -armDance;
          rightArmRef.current.rotation.z = -0.8 * intensity;
        }
        if (leftLegRef.current) leftLegRef.current.rotation.x = Math.sin(t * 4) * 0.25 * intensity;
        if (rightLegRef.current) rightLegRef.current.rotation.x = -Math.sin(t * 4) * 0.25 * intensity;
        break;
      }
      case 'spin': {
        if (groupRef.current) groupRef.current.position.y = Math.sin(progress * Math.PI * 2) * 0.12 * intensity;
        if (leftArmRef.current) {
          leftArmRef.current.rotation.z = 1.5 * intensity;
          leftArmRef.current.rotation.x = 0;
        }
        if (rightArmRef.current) {
          rightArmRef.current.rotation.z = -1.5 * intensity;
          rightArmRef.current.rotation.x = 0;
        }
        if (headRef.current) headRef.current.rotation.z = Math.sin(t * 3) * 0.1 * intensity;
        if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
        if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
        break;
      }
      case 'celebrate': {
        const bounce = Math.sin(progress * Math.PI * 6);
        if (groupRef.current) groupRef.current.position.y = Math.max(0, bounce) * 0.3 * intensity;
        if (leftArmRef.current) {
          leftArmRef.current.rotation.z = (2.5 + Math.sin(t * 6) * 0.3) * intensity;
          leftArmRef.current.rotation.x = Math.sin(t * 8) * 0.2 * intensity;
        }
        if (rightArmRef.current) {
          rightArmRef.current.rotation.z = (-2.5 - Math.sin(t * 6) * 0.3) * intensity;
          rightArmRef.current.rotation.x = Math.sin(t * 8 + 1) * 0.2 * intensity;
        }
        if (headRef.current) headRef.current.rotation.z = Math.sin(t * 5) * 0.15 * intensity;
        if (leftLegRef.current) leftLegRef.current.rotation.x = -0.15 * intensity;
        if (rightLegRef.current) rightLegRef.current.rotation.x = -0.15 * intensity;
        break;
      }
      case 'thumbsup': {
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = -1.3 * intensity;
          rightArmRef.current.rotation.z = -0.3 * intensity;
        }
        if (leftArmRef.current) {
          leftArmRef.current.rotation.x = Math.sin(t * 1.2) * 0.05;
          leftArmRef.current.rotation.z = 0;
        }
        if (headRef.current) {
          headRef.current.rotation.z = 0.1 * intensity;
          headRef.current.rotation.x = -0.1 * intensity;
        }
        if (groupRef.current) groupRef.current.position.y = 0;
        if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
        if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
        break;
      }
      case 'laughAnim': {
        const shake = Math.sin(t * 12) * 0.05 * intensity;
        if (groupRef.current) groupRef.current.position.y = Math.abs(Math.sin(t * 8)) * 0.03 * intensity;
        if (headRef.current) {
          headRef.current.rotation.x = 0.15 * intensity;
          headRef.current.rotation.z = shake;
        }
        if (leftArmRef.current) {
          leftArmRef.current.rotation.x = -0.5 * intensity;
          leftArmRef.current.rotation.z = -0.3 * intensity;
        }
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = -0.5 * intensity;
          rightArmRef.current.rotation.z = 0.3 * intensity;
        }
        if (leftLegRef.current) leftLegRef.current.rotation.x = shake;
        if (rightLegRef.current) rightLegRef.current.rotation.x = -shake;
        break;
      }
    }
  }

  // Animation loop
  useFrame((state) => {
    if (!animate) return;
    const t = state.clock.elapsedTime;

    // Pick up pending action
    if (pendingEmoji.current) {
      const mapping = EMOJI_ACTIONS[pendingEmoji.current];
      if (mapping) {
        currentAction.current = mapping.action;
        animStart.current = t;
      }
      pendingEmoji.current = null;
    }

    // Action animation (emoji) takes priority
    if (currentAction.current) {
      const elapsed = t - animStart.current;
      if (elapsed >= ACTION_DURATION) {
        currentAction.current = null;
        resetPose();
        setExpression('normal');
      } else {
        applyAction(currentAction.current, elapsed / ACTION_DURATION, t);
        return;
      }
    }

    // Movement: walk or run based on speed
    if (moveState === 'run') {
      applyRun(t);
    } else if (moveState === 'walk') {
      applyWalk(t);
    } else {
      applyIdle(t);
    }
  });

  return (
    <group ref={groupRef}>
      {/* ====== HEAD ====== */}
      <group ref={headRef} position={[0, HEAD_Y, 0]}>
        {/* Head sphere */}
        <mesh castShadow>
          <sphereGeometry args={[HEAD_R, 24, 24]} />
          <meshStandardMaterial color={SKIN_COLOR} roughness={0.85} />
        </mesh>

        {/* Face */}
        <FaceExpression expression={expression} />

        {/* Hair */}
        <HairMesh style={hairStyle} color={hairColor} />
      </group>

      {/* ====== BODY (outfit) ====== */}
      <mesh position={[0, BODY_Y, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.28, 8, 16]} />
        <meshStandardMaterial color={colors.main} roughness={0.7} />
      </mesh>
      {/* Belt stripe */}
      <mesh position={[0, BODY_Y - 0.08, 0]}>
        <cylinderGeometry args={[0.225, 0.225, 0.04, 16]} />
        <meshStandardMaterial color={colors.dark} roughness={0.6} />
      </mesh>

      {/* ====== LEFT ARM ====== */}
      <group ref={leftArmRef} position={[ARM_X, ARM_PIVOT_Y, 0]}>
        <mesh position={[0, -0.15, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.12, 4, 8]} />
          <meshStandardMaterial color={colors.main} roughness={0.7} />
        </mesh>
        {/* Hand */}
        <mesh position={[0, -0.32, 0]}>
          <sphereGeometry args={[0.065, 8, 8]} />
          <meshStandardMaterial color={SKIN_COLOR} roughness={0.85} />
        </mesh>
      </group>

      {/* ====== RIGHT ARM ====== */}
      <group ref={rightArmRef} position={[-ARM_X, ARM_PIVOT_Y, 0]}>
        <mesh position={[0, -0.15, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.12, 4, 8]} />
          <meshStandardMaterial color={colors.main} roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.32, 0]}>
          <sphereGeometry args={[0.065, 8, 8]} />
          <meshStandardMaterial color={SKIN_COLOR} roughness={0.85} />
        </mesh>
      </group>

      {/* ====== LEFT LEG ====== */}
      <group ref={leftLegRef} position={[LEG_X, LEG_PIVOT_Y, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <capsuleGeometry args={[0.085, 0.14, 4, 8]} />
          <meshStandardMaterial color={colors.darker} roughness={0.7} />
        </mesh>
        {/* Shoe */}
        <mesh position={[0, -0.36, 0.03]}>
          <sphereGeometry args={[0.095, 8, 8]} />
          <meshStandardMaterial color={colors.dark} roughness={0.6} />
        </mesh>
      </group>

      {/* ====== RIGHT LEG ====== */}
      <group ref={rightLegRef} position={[-LEG_X, LEG_PIVOT_Y, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <capsuleGeometry args={[0.085, 0.14, 4, 8]} />
          <meshStandardMaterial color={colors.darker} roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.36, 0.03]}>
          <sphereGeometry args={[0.095, 8, 8]} />
          <meshStandardMaterial color={colors.dark} roughness={0.6} />
        </mesh>
      </group>

      {/* Current user indicator (glowing ring at feet) */}
      {isCurrentUser && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[0.40, 0.48, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.8}
            transparent
            opacity={0.6}
          />
        </mesh>
      )}

      {/* Lobster pet companion */}
      <LobsterPet
        moveState={moveState}
        leashColor={colors.dark}
        animate={animate}
      />
    </group>
  );
}

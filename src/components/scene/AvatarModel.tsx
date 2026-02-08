import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  type AvatarPreset,
  type ExpressionType,
  type ActionType,
  EMOJI_ACTIONS,
} from '@/lib/scene';

// ======================================================================
// Constants
// ======================================================================

const EYE_COLOR = '#111111';

/**
 * Redesigned proportions for a cuter, rounder lobster
 * inspired by the reference mascot image.
 */
const HEAD_Y = 1.18;
const HEAD_R = 0.38; // head sphere radius (single uniform radius for rounder look)
const BODY_Y = 0.68;
const ARM_PIVOT_Y = 1.0;
const ARM_X = 0.38;
const LEG_PIVOT_Y = 0.46;
const LEG_X = 0.14;

const ACTION_DURATION = 2.5;

// ======================================================================
// Types
// ======================================================================

interface AvatarModelProps {
  preset: AvatarPreset;
  color: string;
  /** @deprecated Kept for backward compat — not rendered for lobster avatars */
  hairStyle?: string;
  /** @deprecated Kept for backward compat — not rendered for lobster avatars */
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
// Cute Lobster Eyes (simple dots on face, no stalks)
// ======================================================================

function LobsterEyes({ expression, shellColor }: { expression: ExpressionType; shellColor: string }) {
  // Eye sizing based on expression
  const eyeRadius = expression === 'surprised' ? 0.058 : 0.048;
  const eyeSpacing = 0.12;
  const eyeY = 0.02;
  const eyeZ = HEAD_R * 0.92;

  return (
    <group position={[0, eyeY, 0]}>
      {/* Left eye */}
      <group position={[eyeSpacing, 0, eyeZ]}>
        {/* Eye white */}
        <mesh>
          <sphereGeometry args={[eyeRadius * 1.3, 12, 12]} />
          <meshStandardMaterial color="#f8f8f0" roughness={0.3} />
        </mesh>
        {/* Pupil */}
        <mesh position={[0, 0, eyeRadius * 1.1]}>
          <circleGeometry args={[eyeRadius * 0.7, 14]} />
          <meshBasicMaterial color={expression === 'love' ? '#e8457a' : EYE_COLOR} />
        </mesh>
        {/* Highlight */}
        <mesh position={[eyeRadius * 0.3, eyeRadius * 0.25, eyeRadius * 1.18]}>
          <circleGeometry args={[0.014, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {/* Happy / Love: ^_^ squint overlay */}
        {(expression === 'happy' || expression === 'love' || expression === 'laugh') && (
          <mesh position={[0, 0, eyeRadius * 1.15]}>
            <boxGeometry args={[eyeRadius * 2.0, 0.02, 0.004]} />
            <meshBasicMaterial color={expression === 'love' ? '#e8457a' : shellColor} />
          </mesh>
        )}
      </group>

      {/* Right eye */}
      <group position={[-eyeSpacing, 0, eyeZ]}>
        {/* Eye white */}
        <mesh>
          <sphereGeometry args={[eyeRadius * 1.3, 12, 12]} />
          <meshStandardMaterial color="#f8f8f0" roughness={0.3} />
        </mesh>
        {/* Pupil */}
        <mesh position={[0, 0, eyeRadius * 1.1]}>
          <circleGeometry args={[eyeRadius * 0.7, 14]} />
          <meshBasicMaterial color={expression === 'love' ? '#e8457a' : EYE_COLOR} />
        </mesh>
        {/* Highlight */}
        <mesh position={[-eyeRadius * 0.3, eyeRadius * 0.25, eyeRadius * 1.18]}>
          <circleGeometry args={[0.014, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {(expression === 'happy' || expression === 'love' || expression === 'laugh') && (
          <mesh position={[0, 0, eyeRadius * 1.15]}>
            <boxGeometry args={[eyeRadius * 2.0, 0.02, 0.004]} />
            <meshBasicMaterial color={expression === 'love' ? '#e8457a' : shellColor} />
          </mesh>
        )}
      </group>
    </group>
  );
}

// ======================================================================
// Lobster Mouth (simple, on face)
// ======================================================================

function LobsterMouth({ expression }: { expression: ExpressionType }) {
  const faceZ = HEAD_R * 0.94;
  const mouthColor = '#8B3A2A';

  return (
    <group position={[0, -0.12, faceZ]}>
      {/* Normal: small content line */}
      {expression === 'normal' && (
        <mesh>
          <boxGeometry args={[0.06, 0.014, 0.004]} />
          <meshBasicMaterial color={mouthColor} />
        </mesh>
      )}
      {/* Happy / Love: curved smile */}
      {(expression === 'happy' || expression === 'love') && (
        <mesh rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.035, 0.008, 4, 10, Math.PI]} />
          <meshBasicMaterial color={mouthColor} />
        </mesh>
      )}
      {/* Surprised: small O */}
      {expression === 'surprised' && (
        <mesh>
          <circleGeometry args={[0.025, 12]} />
          <meshBasicMaterial color={mouthColor} />
        </mesh>
      )}
      {/* Laugh: wide open */}
      {expression === 'laugh' && (
        <mesh>
          <circleGeometry args={[0.04, 14]} />
          <meshBasicMaterial color={mouthColor} />
        </mesh>
      )}
    </group>
  );
}

// ======================================================================
// V-Shaped Antennae (matching reference image style)
// ======================================================================

function LobsterAntennae({ shellColor }: { shellColor: string }) {
  const antennaColor = darken(shellColor, 0.05);
  const tipColor = lighten(shellColor, 0.15);

  return (
    <group position={[0, HEAD_R * 0.85, 0.02]}>
      {/* Left antenna - V shape pointing up and outward */}
      <group position={[0.06, 0, 0]} rotation={[0.15, 0, 0.35]}>
        {/* Main antenna shaft */}
        <mesh position={[0, 0.14, 0]}>
          <capsuleGeometry args={[0.018, 0.24, 4, 6]} />
          <meshStandardMaterial color={antennaColor} roughness={0.6} />
        </mesh>
        {/* Antenna tip (slightly lighter) */}
        <mesh position={[0, 0.28, 0]}>
          <sphereGeometry args={[0.022, 8, 8]} />
          <meshStandardMaterial color={tipColor} roughness={0.5} />
        </mesh>
      </group>

      {/* Right antenna - V shape pointing up and outward */}
      <group position={[-0.06, 0, 0]} rotation={[0.15, 0, -0.35]}>
        {/* Main antenna shaft */}
        <mesh position={[0, 0.14, 0]}>
          <capsuleGeometry args={[0.018, 0.24, 4, 6]} />
          <meshStandardMaterial color={antennaColor} roughness={0.6} />
        </mesh>
        {/* Antenna tip */}
        <mesh position={[0, 0.28, 0]}>
          <sphereGeometry args={[0.022, 8, 8]} />
          <meshStandardMaterial color={tipColor} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

// ======================================================================
// Cute Rounded Claw (bigger, rounder, more cartoonish)
// ======================================================================

function LobsterClaw({ side, shellColor }: { side: 'left' | 'right'; shellColor: string }) {
  const sign = side === 'left' ? 1 : -1;
  const clawColor = darken(shellColor, 0.05);
  const clawDark = darken(shellColor, 0.18);
  const clawHighlight = lighten(shellColor, 0.12);

  return (
    <group>
      {/* Upper arm segment */}
      <mesh position={[sign * 0.04, -0.06, 0.02]} rotation={[0, 0, sign * 0.2]} castShadow>
        <capsuleGeometry args={[0.06, 0.10, 5, 8]} />
        <meshStandardMaterial color={shellColor} roughness={0.65} />
      </mesh>

      {/* Forearm / wrist */}
      <mesh position={[sign * 0.08, -0.18, 0.04]} rotation={[0.1, 0, sign * 0.3]} castShadow>
        <capsuleGeometry args={[0.05, 0.08, 5, 8]} />
        <meshStandardMaterial color={shellColor} roughness={0.65} />
      </mesh>

      {/* Claw body - big rounded main shape */}
      <mesh position={[sign * 0.10, -0.30, 0.08]} rotation={[0.15, sign * 0.1, sign * 0.15]} castShadow>
        <sphereGeometry args={[0.12, 14, 12]} />
        <meshStandardMaterial color={clawColor} roughness={0.55} />
      </mesh>

      {/* Claw highlight (top sheen) */}
      <mesh position={[sign * 0.10, -0.24, 0.14]} rotation={[0.3, sign * 0.1, sign * 0.1]}>
        <sphereGeometry args={[0.06, 10, 8]} />
        <meshStandardMaterial
          color={clawHighlight}
          roughness={0.4}
          transparent
          opacity={0.5}
        />
      </mesh>

      {/* Upper pincer */}
      <mesh position={[sign * 0.12, -0.32, 0.20]} rotation={[0.4, sign * 0.2, sign * 0.1]}>
        <boxGeometry args={[0.10, 0.05, 0.14]} />
        <meshStandardMaterial color={clawColor} roughness={0.6} />
      </mesh>
      {/* Upper pincer tip */}
      <mesh position={[sign * 0.12, -0.32, 0.28]}>
        <sphereGeometry args={[0.035, 8, 6]} />
        <meshStandardMaterial color={clawColor} roughness={0.6} />
      </mesh>

      {/* Lower pincer */}
      <mesh position={[sign * 0.10, -0.38, 0.18]} rotation={[-0.15, sign * 0.15, sign * 0.05]}>
        <boxGeometry args={[0.08, 0.04, 0.12]} />
        <meshStandardMaterial color={clawDark} roughness={0.6} />
      </mesh>
      {/* Lower pincer tip */}
      <mesh position={[sign * 0.10, -0.38, 0.25]}>
        <sphereGeometry args={[0.028, 8, 6]} />
        <meshStandardMaterial color={clawDark} roughness={0.6} />
      </mesh>
    </group>
  );
}

// ======================================================================
// Simplified Tail (cuter, shorter)
// ======================================================================

function LobsterTail({ shellColor }: { shellColor: string }) {
  const tailColor = darken(shellColor, 0.08);
  const tailDark = darken(shellColor, 0.18);

  return (
    <group position={[0, -0.02, -0.12]}>
      {/* Tail segment 1 - wider */}
      <mesh rotation={[-0.25, 0, 0]}>
        <capsuleGeometry args={[0.10, 0.06, 6, 8]} />
        <meshStandardMaterial color={tailColor} roughness={0.65} />
      </mesh>
      {/* Tail segment 2 - smaller */}
      <mesh position={[0, -0.04, -0.10]} rotation={[-0.45, 0, 0]}>
        <capsuleGeometry args={[0.07, 0.05, 5, 8]} />
        <meshStandardMaterial color={tailDark} roughness={0.65} />
      </mesh>
      {/* Tail fan - simplified rounded fan */}
      <mesh position={[0, -0.06, -0.18]} rotation={[-0.55, 0, 0]}>
        <sphereGeometry args={[0.08, 10, 6]} />
        <meshStandardMaterial color={tailColor} roughness={0.6} />
      </mesh>
      {/* Small tail tip */}
      <mesh position={[0, -0.07, -0.25]} rotation={[-0.6, 0, 0]}>
        <sphereGeometry args={[0.04, 8, 6]} />
        <meshStandardMaterial color={tailDark} roughness={0.6} />
      </mesh>
    </group>
  );
}

// ======================================================================
// Main Avatar Component (Cute Lobster Character)
// ======================================================================

export function AvatarModel({
  color,
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
  const tailRef = useRef<THREE.Group>(null!);

  const [expression, setExpression] = useState<ExpressionType>('normal');

  const colors = useMemo(
    () => ({
      main: color,
      dark: darken(color, 0.15),
      darker: darken(color, 0.30),
      light: lighten(color, 0.20),
      belly: lighten(color, 0.40),
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
    if (tailRef.current) tailRef.current.rotation.set(0, 0, 0);
    if (groupRef.current) groupRef.current.position.y = 0;
  }

  // Idle animation
  function applyIdle(t: number) {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(t * 1.5) * 0.02;
    }
    // Claw gentle sway - wider for cuter effect
    const clawSwing = Math.sin(t * 1.2) * 0.10;
    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = clawSwing;
      leftArmRef.current.rotation.z = Math.sin(t * 0.9) * 0.08;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = -clawSwing;
      rightArmRef.current.rotation.z = -Math.sin(t * 0.9 + 0.5) * 0.08;
    }
    // Legs subtle (invisible but keep for animation compat)
    const legSwing = Math.sin(t * 1.2) * 0.04;
    if (leftLegRef.current) leftLegRef.current.rotation.x = -legSwing;
    if (rightLegRef.current) rightLegRef.current.rotation.x = legSwing;
    // Head bob - gentle tilt
    if (headRef.current) {
      headRef.current.rotation.z = Math.sin(t * 0.8) * 0.05;
      headRef.current.rotation.x = Math.sin(t * 1.0) * 0.02;
    }
    // Tail gentle wave
    if (tailRef.current) {
      tailRef.current.rotation.x = Math.sin(t * 1.0) * 0.06;
      tailRef.current.rotation.y = Math.sin(t * 0.7) * 0.04;
    }
  }

  // Walk animation
  function applyWalk(t: number) {
    const cycle = t * 9;
    const legSwing = Math.sin(cycle) * 0.35;
    const clawSwing = Math.sin(cycle) * 0.45;
    if (groupRef.current) {
      groupRef.current.position.y = Math.abs(Math.sin(cycle)) * 0.04;
    }
    if (leftLegRef.current) leftLegRef.current.rotation.x = -legSwing;
    if (rightLegRef.current) rightLegRef.current.rotation.x = legSwing;
    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = -clawSwing;
      leftArmRef.current.rotation.z = 0.10;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = clawSwing;
      rightArmRef.current.rotation.z = -0.10;
    }
    if (headRef.current) {
      headRef.current.rotation.x = 0;
      headRef.current.rotation.z = Math.sin(t * 0.6) * 0.04;
    }
    if (tailRef.current) {
      tailRef.current.rotation.x = Math.sin(cycle * 0.5) * 0.1;
      tailRef.current.rotation.y = Math.sin(cycle * 0.3) * 0.06;
    }
  }

  // Run animation
  function applyRun(t: number) {
    const cycle = t * 12;
    const legSwing = Math.sin(cycle) * 0.55;
    const clawSwing = Math.sin(cycle) * 0.75;
    if (groupRef.current) {
      groupRef.current.position.y = Math.abs(Math.sin(cycle)) * 0.08;
    }
    if (leftLegRef.current) leftLegRef.current.rotation.x = -legSwing;
    if (rightLegRef.current) rightLegRef.current.rotation.x = legSwing;
    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = -clawSwing;
      leftArmRef.current.rotation.z = 0.18;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = clawSwing;
      rightArmRef.current.rotation.z = -0.18;
    }
    if (headRef.current) {
      headRef.current.rotation.x = 0.08;
      headRef.current.rotation.z = Math.sin(t * 1.2) * 0.04;
    }
    if (tailRef.current) {
      tailRef.current.rotation.x = Math.sin(cycle * 0.6) * 0.15;
      tailRef.current.rotation.y = Math.sin(cycle * 0.4) * 0.10;
    }
  }

  // Action animation (emoji-triggered)
  function applyAction(action: ActionType, progress: number, t: number) {
    const eased = easeInOutQuad(Math.min(progress * 3, 1));
    const exitFactor = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;
    const intensity = eased * exitFactor;

    // Reset tail
    if (tailRef.current) {
      tailRef.current.rotation.x = Math.sin(t * 2) * 0.08 * intensity;
      tailRef.current.rotation.y = 0;
    }

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
        if (tailRef.current) tailRef.current.rotation.x = -0.3 * armUp;
        break;
      }
      case 'dance': {
        const sway = Math.sin(t * 4) * 0.15 * intensity;
        const clawDance = Math.sin(t * 4) * 1.0 * intensity;
        if (groupRef.current) groupRef.current.position.y = Math.abs(Math.sin(t * 8)) * 0.06 * intensity;
        if (headRef.current) headRef.current.rotation.z = sway;
        if (leftArmRef.current) {
          leftArmRef.current.rotation.x = clawDance;
          leftArmRef.current.rotation.z = 0.8 * intensity;
        }
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = -clawDance;
          rightArmRef.current.rotation.z = -0.8 * intensity;
        }
        if (leftLegRef.current) leftLegRef.current.rotation.x = Math.sin(t * 4) * 0.25 * intensity;
        if (rightLegRef.current) rightLegRef.current.rotation.x = -Math.sin(t * 4) * 0.25 * intensity;
        if (tailRef.current) {
          tailRef.current.rotation.x = Math.sin(t * 4) * 0.15 * intensity;
          tailRef.current.rotation.y = Math.sin(t * 3) * 0.10 * intensity;
        }
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
        if (groupRef.current) groupRef.current.position.y = Math.abs(Math.sin(t * 8)) * 0.04 * intensity;
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
        if (tailRef.current) tailRef.current.rotation.x = shake * 2;
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

    // Movement animation
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
      {/* ====== HEAD (round face + eyes + antennae + mouth) ====== */}
      <group ref={headRef} position={[0, HEAD_Y, 0]}>
        {/* Head shell - rounder, cuter */}
        <mesh castShadow>
          <sphereGeometry args={[HEAD_R, 24, 20]} />
          <meshStandardMaterial color={colors.main} roughness={0.55} />
        </mesh>

        {/* Head sheen highlight (subtle top highlight for 3D feel) */}
        <mesh position={[0, HEAD_R * 0.55, HEAD_R * 0.35]}>
          <sphereGeometry args={[HEAD_R * 0.3, 12, 10]} />
          <meshStandardMaterial
            color={colors.light}
            roughness={0.3}
            transparent
            opacity={0.3}
          />
        </mesh>

        {/* Cute dot eyes */}
        <LobsterEyes expression={expression} shellColor={colors.main} />

        {/* V-shaped antennae */}
        <LobsterAntennae shellColor={colors.main} />

        {/* Mouth */}
        <LobsterMouth expression={expression} />

        {/* Cheek blush (more prominent for cute look) */}
        <mesh position={[-0.20, -0.06, HEAD_R * 0.78]} rotation={[0, 0.25, 0]}>
          <circleGeometry args={[0.045, 12]} />
          <meshBasicMaterial
            color="#FF9999"
            transparent
            opacity={expression === 'love' ? 0.65 : expression === 'happy' ? 0.45 : 0.2}
          />
        </mesh>
        <mesh position={[0.20, -0.06, HEAD_R * 0.78]} rotation={[0, -0.25, 0]}>
          <circleGeometry args={[0.045, 12]} />
          <meshBasicMaterial
            color="#FF9999"
            transparent
            opacity={expression === 'love' ? 0.65 : expression === 'happy' ? 0.45 : 0.2}
          />
        </mesh>
      </group>

      {/* ====== BODY (compact, round) ====== */}
      <mesh position={[0, BODY_Y, 0]} castShadow>
        <capsuleGeometry args={[0.26, 0.22, 10, 18]} />
        <meshStandardMaterial color={colors.main} roughness={0.55} />
      </mesh>

      {/* Body segment lines (subtle ring markings) */}
      <mesh position={[0, BODY_Y + 0.06, 0]}>
        <cylinderGeometry args={[0.262, 0.262, 0.015, 18]} />
        <meshStandardMaterial color={colors.dark} roughness={0.5} />
      </mesh>
      <mesh position={[0, BODY_Y - 0.06, 0]}>
        <cylinderGeometry args={[0.262, 0.262, 0.015, 18]} />
        <meshStandardMaterial color={colors.dark} roughness={0.5} />
      </mesh>

      {/* Belly (prominent lighter underside - matching reference) */}
      <mesh position={[0, BODY_Y - 0.02, 0.10]} scale={[0.72, 0.85, 0.45]}>
        <capsuleGeometry args={[0.22, 0.18, 8, 14]} />
        <meshStandardMaterial color={colors.belly} roughness={0.7} />
      </mesh>

      {/* ====== LEFT CLAW (raised up, matching reference pose) ====== */}
      <group ref={leftArmRef} position={[ARM_X, ARM_PIVOT_Y, 0]}>
        <LobsterClaw side="left" shellColor={colors.main} />
      </group>

      {/* ====== RIGHT CLAW ====== */}
      <group ref={rightArmRef} position={[-ARM_X, ARM_PIVOT_Y, 0]}>
        <LobsterClaw side="right" shellColor={colors.main} />
      </group>

      {/* ====== LEGS (hidden but refs maintained for animation compat) ====== */}
      <group ref={leftLegRef} position={[LEG_X, LEG_PIVOT_Y, 0]} />
      <group ref={rightLegRef} position={[-LEG_X, LEG_PIVOT_Y, 0]} />

      {/* ====== TAIL ====== */}
      <group ref={tailRef} position={[0, BODY_Y - 0.10, -0.18]}>
        <LobsterTail shellColor={colors.main} />
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
    </group>
  );
}

/**
 * GLB Avatar Model Component
 *
 * Loads a custom GLB avatar model and plays skeletal animations
 * according to the Avatar Animation Interface Contract (AAIC).
 *
 * Expects the GLB to contain clips named: idle, walk, run, wave, laugh, angry, think, talk
 */

import { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { type ExpressionType, type ActionType, EMOJI_ACTIONS } from '@/lib/scene';

// ============================================================================
// Types
// ============================================================================

interface GLBAvatarModelProps {
  /** URL to the GLB model file */
  modelUrl: string;
  /** Accent color for the user indicator ring */
  color?: string;
  /** Is this the local player? Shows indicator ring */
  isCurrentUser?: boolean;
  /** Enable animations */
  animate?: boolean;
  /** Active emoji triggers action animation + expression change */
  emoji?: string | null;
  /** Movement state */
  moveState?: 'idle' | 'walk' | 'run';
}

// ============================================================================
// Animation name mapping: AAIC required name -> possible clip names in GLB
// We try case-insensitive matching first, then common variants.
// ============================================================================

const ANIM_ALIASES: Record<string, string[]> = {
  idle: ['idle', 'Idle', 'IDLE', 'idle_loop', 'standing'],
  walk: ['walk', 'Walk', 'WALK', 'walk_loop', 'walking'],
  run: ['run', 'Run', 'RUN', 'run_loop', 'running', 'sprint'],
  wave: ['wave', 'Wave', 'WAVE', 'waving', 'greeting', 'hello'],
  laugh: ['laugh', 'Laugh', 'LAUGH', 'laughing', 'happy'],
  angry: ['angry', 'Angry', 'ANGRY', 'anger'],
  think: ['think', 'Think', 'THINK', 'thinking', 'ponder'],
  talk: ['talk', 'Talk', 'TALK', 'talking', 'speak', 'speaking'],
};

/** Map emoji action types to AAIC animation names */
const ACTION_TO_ANIM: Record<ActionType, string> = {
  wave: 'wave',
  clap: 'wave',       // fallback: use wave for clap
  jump: 'idle',       // jump is handled by the movement system
  dance: 'laugh',     // fallback: use laugh for dance
  spin: 'wave',       // fallback
  celebrate: 'laugh', // fallback
  thumbsup: 'wave',   // fallback
  laughAnim: 'laugh',
};

const ACTION_DURATION = 2.5; // seconds

// ============================================================================
// Find animation clip by AAIC name
// ============================================================================

function findClip(
  clips: THREE.AnimationClip[],
  aaicName: string,
): THREE.AnimationClip | undefined {
  const aliases = ANIM_ALIASES[aaicName] ?? [aaicName];
  for (const alias of aliases) {
    const clip = clips.find(
      (c) => c.name.toLowerCase() === alias.toLowerCase(),
    );
    if (clip) return clip;
  }
  // Fuzzy fallback: partial match
  const lower = aaicName.toLowerCase();
  return clips.find((c) => c.name.toLowerCase().includes(lower));
}

// ============================================================================
// Component
// ============================================================================

export function GLBAvatarModel({
  modelUrl,
  color = '#3B82F6',
  isCurrentUser = false,
  animate = true,
  emoji,
  moveState = 'idle',
}: GLBAvatarModelProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const emojiActionRef = useRef<ActionType | null>(null);
  const emojiStartRef = useRef(0);
  const pendingEmojiRef = useRef<string | null>(null);
  const [, setExpression] = useState<ExpressionType>('normal');

  // Load GLB
  const gltf = useGLTF(modelUrl);

  // Clone the scene so multiple instances don't share skeleton state
  const clonedScene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    // Clone skinned meshes with their skeletons
    clone.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      } else if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [gltf.scene]);

  // Build clip lookup
  const clipMap = useMemo(() => {
    const map: Record<string, THREE.AnimationClip> = {};
    for (const name of Object.keys(ANIM_ALIASES)) {
      const clip = findClip(gltf.animations, name);
      if (clip) {
        map[name] = clip;
      }
    }
    return map;
  }, [gltf.animations]);

  // Create mixer
  useEffect(() => {
    const mixer = new THREE.AnimationMixer(clonedScene);
    mixerRef.current = mixer;

    // Start with idle
    const idleClip = clipMap['idle'];
    if (idleClip) {
      const action = mixer.clipAction(idleClip);
      action.play();
      currentActionRef.current = action;
    }

    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(clonedScene);
      mixerRef.current = null;
    };
  }, [clonedScene, clipMap]);

  // Handle emoji changes
  useEffect(() => {
    if (emoji) {
      pendingEmojiRef.current = emoji;
      const mapping = EMOJI_ACTIONS[emoji];
      if (mapping) {
        setExpression(mapping.expression);
      }
    }
  }, [emoji]);

  // Crossfade to a new animation clip
  const crossfadeTo = (clipName: string, duration = 0.3, loop = true) => {
    const mixer = mixerRef.current;
    if (!mixer) return;

    const clip = clipMap[clipName];
    if (!clip) return;

    const newAction = mixer.clipAction(clip);
    const oldAction = currentActionRef.current;

    newAction.reset();
    newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    newAction.clampWhenFinished = !loop;
    newAction.play();

    if (oldAction && oldAction !== newAction) {
      oldAction.crossFadeTo(newAction, duration, true);
    }

    currentActionRef.current = newAction;
  };

  // Animation loop
  useFrame((state, delta) => {
    if (!animate || !mixerRef.current) return;
    const t = state.clock.elapsedTime;

    // Pick up pending emoji action
    if (pendingEmojiRef.current) {
      const mapping = EMOJI_ACTIONS[pendingEmojiRef.current];
      if (mapping) {
        emojiActionRef.current = mapping.action;
        emojiStartRef.current = t;
        const animName = ACTION_TO_ANIM[mapping.action] ?? 'wave';
        crossfadeTo(animName, 0.2, false);
      }
      pendingEmojiRef.current = null;
    }

    // Check if emoji action is done
    if (emojiActionRef.current) {
      const elapsed = t - emojiStartRef.current;
      if (elapsed >= ACTION_DURATION) {
        emojiActionRef.current = null;
        setExpression('normal');
        // Return to movement animation
        crossfadeTo(moveState, 0.3);
      }
    }

    // Update mixer
    mixerRef.current.update(delta);
  });

  // React to moveState changes (only when not in emoji action)
  useEffect(() => {
    if (!emojiActionRef.current) {
      crossfadeTo(moveState, 0.25);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveState]);

  return (
    <group ref={groupRef}>
      <primitive object={clonedScene} />

      {/* Current user indicator ring */}
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

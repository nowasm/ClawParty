/**
 * Avatar Model Validator
 *
 * Validates GLB/GLTF avatar models against the Avatar Animation Interface Contract (AAIC).
 * Checks: triangle count, file size, skeleton structure, animation completeness.
 */

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  REQUIRED_ANIMATIONS,
  REQUIRED_BONES,
  MAX_AVATAR_TRIANGLES,
  MAX_AVATAR_FILE_SIZE,
  MAX_TEXTURE_SIZE,
  type AAICValidationResult,
} from './scene';

// ============================================================================
// Triangle Counting
// ============================================================================

/** Count total triangles in a Three.js scene graph */
function countTriangles(object: THREE.Object3D): number {
  let total = 0;
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geometry = child.geometry;
      if (geometry.index) {
        total += geometry.index.count / 3;
      } else if (geometry.attributes.position) {
        total += geometry.attributes.position.count / 3;
      }
    }
  });
  return Math.floor(total);
}

// ============================================================================
// Bone Detection
// ============================================================================

/** Collect all bone names from a Three.js scene graph */
function collectBoneNames(object: THREE.Object3D): string[] {
  const bones: string[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Bone) {
      bones.push(child.name);
    }
  });
  return bones;
}

/**
 * Match found bone names against required bone names.
 * Uses fuzzy matching to support common naming conventions:
 *   - "Hips" matches "Hips", "hips", "mixamorigHips", "Armature_Hips", etc.
 */
function matchBone(foundBones: string[], requiredBone: string): boolean {
  const lower = requiredBone.toLowerCase();
  return foundBones.some((bone) => {
    const boneLower = bone.toLowerCase();
    return (
      boneLower === lower ||
      boneLower.endsWith(lower) ||
      boneLower.endsWith(`_${lower}`) ||
      boneLower.includes(lower)
    );
  });
}

// ============================================================================
// Texture Validation
// ============================================================================

/** Check for oversized textures and collect warnings */
function checkTextures(object: THREE.Object3D, maxSize: number): string[] {
  const warnings: string[] = [];
  const checked = new Set<string>();

  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial) {
          const textures = [
            material.map,
            (material as THREE.MeshStandardMaterial).normalMap,
            (material as THREE.MeshStandardMaterial).roughnessMap,
            (material as THREE.MeshStandardMaterial).metalnessMap,
            (material as THREE.MeshStandardMaterial).emissiveMap,
          ].filter(Boolean) as THREE.Texture[];

          for (const tex of textures) {
            const id = tex.uuid;
            if (checked.has(id)) continue;
            checked.add(id);

            if (tex.image) {
              const img = tex.image as { width?: number; height?: number };
              const w = img.width ?? 0;
              const h = img.height ?? 0;
              if (w > maxSize || h > maxSize) {
                warnings.push(
                  `Texture "${tex.name || 'unnamed'}" is ${w}x${h}, exceeds ${maxSize}x${maxSize} limit`,
                );
              }
            }
          }
        }
      }
    }
  });

  return warnings;
}

// ============================================================================
// Animation Detection
// ============================================================================

/** Collect animation clip names from a GLTF result */
function collectAnimationNames(gltf: GLTF): string[] {
  return gltf.animations.map((clip) => clip.name);
}

/**
 * Match found animation names against required animation names.
 * Uses case-insensitive matching.
 */
function matchAnimation(foundAnimations: string[], requiredAnim: string): boolean {
  const lower = requiredAnim.toLowerCase();
  return foundAnimations.some((name) => name.toLowerCase() === lower);
}

// ============================================================================
// Main Validator
// ============================================================================

/**
 * Validate a GLB file against the AAIC specification.
 *
 * @param file - The File object (from <input type="file">) or ArrayBuffer
 * @returns Validation result with details about every check
 */
export async function validateAvatarModel(
  file: File | ArrayBuffer,
): Promise<AAICValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- File size check ---
  const fileSize = file instanceof File ? file.size : file.byteLength;
  if (fileSize > MAX_AVATAR_FILE_SIZE) {
    errors.push(
      `File size ${(fileSize / 1024 / 1024).toFixed(1)} MB exceeds ${(MAX_AVATAR_FILE_SIZE / 1024 / 1024).toFixed(0)} MB limit`,
    );
  }

  // --- Load the GLTF ---
  let gltf: GLTF;
  try {
    const buffer = file instanceof File ? await file.arrayBuffer() : file;
    gltf = await new Promise<GLTF>((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.parse(buffer, '', resolve, reject);
    });
  } catch (err) {
    return {
      valid: false,
      triangleCount: 0,
      fileSize,
      hasHumanoidRig: false,
      missingAnimations: [...REQUIRED_ANIMATIONS],
      missingBones: [...REQUIRED_BONES],
      foundAnimations: [],
      foundBones: [],
      errors: [`Failed to load GLB file: ${err instanceof Error ? err.message : 'Unknown error'}`],
      warnings: [],
    };
  }

  // --- Triangle count ---
  const triangleCount = countTriangles(gltf.scene);
  if (triangleCount > MAX_AVATAR_TRIANGLES) {
    errors.push(
      `Triangle count ${triangleCount.toLocaleString()} exceeds ${MAX_AVATAR_TRIANGLES.toLocaleString()} limit`,
    );
  }

  // --- Bone structure ---
  const foundBones = collectBoneNames(gltf.scene);
  const missingBones = REQUIRED_BONES.filter((bone) => !matchBone(foundBones, bone));
  const hasHumanoidRig = missingBones.length === 0;
  if (!hasHumanoidRig) {
    errors.push(
      `Missing required bones: ${missingBones.join(', ')}`,
    );
  }

  // --- Animations ---
  const foundAnimations = collectAnimationNames(gltf);
  const missingAnimations = REQUIRED_ANIMATIONS.filter(
    (anim) => !matchAnimation(foundAnimations, anim),
  );
  if (missingAnimations.length > 0) {
    errors.push(
      `Missing required animations: ${missingAnimations.join(', ')}`,
    );
  }

  // --- Texture warnings (non-blocking) ---
  const textureWarnings = checkTextures(gltf.scene, MAX_TEXTURE_SIZE);
  warnings.push(...textureWarnings);

  // --- Cleanup ---
  gltf.scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => m?.dispose());
    }
  });

  return {
    valid: errors.length === 0,
    triangleCount,
    fileSize,
    hasHumanoidRig,
    missingAnimations: [...missingAnimations],
    missingBones: [...missingBones],
    foundAnimations,
    foundBones,
    errors,
    warnings,
  };
}

/**
 * Quick validation for file size only (before uploading).
 * Useful for an instant check before the heavier full validation.
 */
export function quickValidateFileSize(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_AVATAR_FILE_SIZE) {
    return {
      valid: false,
      error: `File size ${(file.size / 1024 / 1024).toFixed(1)} MB exceeds ${(MAX_AVATAR_FILE_SIZE / 1024 / 1024).toFixed(0)} MB limit`,
    };
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith('.glb') && !name.endsWith('.gltf')) {
    return {
      valid: false,
      error: 'Only .glb and .gltf files are supported',
    };
  }
  return { valid: true };
}

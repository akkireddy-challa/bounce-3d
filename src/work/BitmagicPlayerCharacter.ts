import * as THREE from 'three';
import type { IBlockCharacterFactory } from 'engine/IBlockCharacterFactory.js';
import { scaleCharacterToHeight, getSkeletonHeight } from 'engine/CharacterConfig.js';

/**
 * 🔴 Bounce 3D: Player Character System
 * Replaces the default mascot with the iconic candy-apple red Nokia Bounce sphere!
 */

export const BITMAGIC_CONFIG = {
  targetHeight: 1.0, // 1.0 meter diameter (0.5m radius)
};

export const bitmagicCharacterFactory: IBlockCharacterFactory = {
  createBlockCharacter: createBitmagicBlockCharacter,

  getCharacterDimensions: () => {
    const bitmagicHeight = BITMAGIC_CONFIG.targetHeight;
    const skeletonHeight = getSkeletonHeight();
    const heightRatio = bitmagicHeight / skeletonHeight;

    return {
      width: 1.0 * heightRatio,
      height: bitmagicHeight,
      depth: 1.0 * heightRatio
    };
  }
};

/**
 * Apply all Bitmagic modifications to player character
 */
export function applyBitmagicModifications(
  player: THREE.Object3D,
  playerController: any,
  playerLoader: any,
  _blockCharacterRenderer: any
): void {
  console.log('🔴 Spawning Nokia Bounce 3D Red Ball...');

  // 1. Scale to ball diameter
  const bitmagicHeight = BITMAGIC_CONFIG.targetHeight;
  const currentCharacterHeight = playerController?.characterHeight || getSkeletonHeight();
  scaleCharacterToHeight(player, currentCharacterHeight, bitmagicHeight, '🔴');

  // 2. Update physics to a rolling sphere
  const radius = bitmagicHeight * 0.5;
  if (playerController) {
    playerController.setCharacterHeight(bitmagicHeight);
    if (typeof playerController.setCapsuleDimensions === 'function') {
      playerController.setCapsuleDimensions(bitmagicHeight, radius);
    }
  }

  if (playerLoader && typeof playerLoader.updateCapsuleDimensions === 'function') {
    playerLoader.updateCapsuleDimensions(bitmagicHeight, radius);
    if (typeof playerLoader.recreatePhysicsBody === 'function') {
      playerLoader.recreatePhysicsBody(player);
      if (playerController) {
        playerController.playerBody = playerLoader.getPlayerBody();
      }
    }
  }

  if (playerController && typeof playerController.regroundCharacter === 'function') {
    playerController.regroundCharacter(bitmagicHeight);
  }

  console.log(`🔴 Bounce 3D Ball ready: radius=${radius}m, height=${bitmagicHeight}m`);
}

/**
 * Procedural Red Bouncy Ball visual mesh generation using Three.js
 */
export function createBitmagicBlockCharacter(characterGroup: THREE.Group) {
  characterGroup.name = 'BlockCharacter_BounceRedBall';

  // 🔴 Iconic Candy-Apple Red Nokia Bounce 3D Ball
  const ballRadius = 0.5;
  const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);
  const ballMaterial = new THREE.MeshStandardMaterial({
    color: 0xEF4444, // Vibrant candy-apple red
    roughness: 0.15, // High-gloss shiny finish
    metalness: 0.15, // Specular highlights
  });

  const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
  ballMesh.name = 'bounce_ball_main';
  ballMesh.castShadow = true;
  ballMesh.receiveShadow = true;
  ballMesh.position.set(0, 0, 0);

  // Add glossy white specular highlight reflection spot
  const shineGeo = new THREE.SphereGeometry(0.09, 16, 16);
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
  const shineMesh = new THREE.Mesh(shineGeo, shineMat);
  shineMesh.position.set(0.18, 0.25, 0.35);
  ballMesh.add(shineMesh);

  // Add secondary subtle rim shine
  const rimShineGeo = new THREE.SphereGeometry(0.04, 12, 12);
  const rimShineMat = new THREE.MeshBasicMaterial({ color: 0xFFD1D1 });
  const rimShineMesh = new THREE.Mesh(rimShineGeo, rimShineMat);
  rimShineMesh.position.set(-0.25, -0.1, 0.35);
  ballMesh.add(rimShineMesh);

  // Attach to torso group (captured as STANDARD_PART_NAME by BlockCharacterRenderer)
  const torsoGroup = characterGroup.getObjectByName('torso') as THREE.Group;
  if (torsoGroup) {
    torsoGroup.add(ballMesh);
  } else {
    characterGroup.add(ballMesh);
  }

  // Ensure shadows are enabled
  characterGroup.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

export function updateBitmagicEyeBlink(_deltaTime: number) {
  // Pure sphere doesn't require eye blinking
}

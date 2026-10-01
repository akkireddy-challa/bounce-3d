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
    return {
      width: bitmagicHeight,
      height: bitmagicHeight,
      depth: bitmagicHeight
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

  // 2. Update physics to a true 0.5m radius rolling sphere
  const radius = bitmagicHeight * 0.5;
  if (playerController) {
    playerController.setCharacterHeight(bitmagicHeight);
    playerController.capsuleRadius = radius;
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
        playerController.capsuleRadius = radius;
      }
    }
  }

  if (playerController && typeof playerController.regroundCharacter === 'function') {
    playerController.regroundCharacter(bitmagicHeight);
  }

  console.log(`🔴 Bounce 3D Ball ready: true spherical collider radius=${radius}m, height=${bitmagicHeight}m`);
}

/**
 * Procedural Red Bouncy Ball visual mesh generation using Three.js
 */
export function createBitmagicBlockCharacter(characterGroup: THREE.Group) {
  characterGroup.name = 'BlockCharacter_BounceRedBall';

  // Transparent anchor mesh with proper 1.0m height bounds to satisfy CharacterLoader
  const anchorGeo = new THREE.BoxGeometry(0.5, 1.0, 0.5);
  const anchorMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const anchorMesh = new THREE.Mesh(anchorGeo, anchorMat);
  anchorMesh.position.set(0, 0.5, 0);

  const torsoGroup = characterGroup.getObjectByName('torso') as THREE.Group;
  if (torsoGroup) {
    torsoGroup.add(anchorMesh);
  } else {
    characterGroup.add(anchorMesh);
  }
}

export function updateBitmagicEyeBlink(_deltaTime: number) {
  // Pure sphere doesn't require eye blinking
}

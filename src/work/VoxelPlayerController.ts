// AI editor note: the sidescroller template subclasses this controller via
// `SidescrollerPlayerController` (in templates/sidescroller/source/) to add
// X-axis-only input + disable Rapier gravity. Renaming exports here, changing
// the constructor signature, or making `calculateMoveDirection` (inherited
// from engine PlayerController) less accessible can break that subclass.
// pnpm run check does NOT type-check templates — drift lands silently.
// See ../../../../templates/README.md for the contract.
import * as THREE from 'three';
import { PlayerController, type CameraController } from 'engine/PlayerController.js';
import type { EngineLike, CameraControllerLike } from 'types/game.js';
import type { WorldGenerator } from './WorldGenerator.js';
import { TerrainTypeRegistry } from 'engine/TerrainTypes.js';
import type { GameConstants } from 'engine/Constants.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from 'engine/physics/PhysicsWorld.js';

import { DEFAULT_PHYSICS, type PhysicsConstants } from './PhysicsConfig.js';

export class VoxelPlayerController extends PlayerController {
    private terrainRegistry: TerrainTypeRegistry;
    private damageAccumulator: number = 0;

    constructor(
        player: THREE.Object3D,
        playerBody: RAPIER.RigidBody,
        physicsWorld: PhysicsWorld,
        cameraController: CameraController,
        engine: EngineLike | null = null,
        physicsConfig: PhysicsConstants = DEFAULT_PHYSICS,
        worldGenerator: WorldGenerator | null = null,
        movementSystem?: any,
        constants?: Partial<GameConstants>
    ) {
        super(player, playerBody, physicsWorld, cameraController, engine, physicsConfig, worldGenerator, movementSystem, constants);

        this.terrainRegistry = new TerrainTypeRegistry();

        // Combat is disabled by default
        // To enable combat, initialize an attack system (e.g., ProjectileShootSystem) and call setAttackSystem()

        // Disable ThirdPersonCamera's built-in touch controls when using MobileControls
        const cameraLike = cameraController as CameraControllerLike;
        if (this.mobileControls.isEnabled() && cameraLike.disableBuiltInTouchControls !== undefined) {
            cameraLike.disableBuiltInTouchControls = true;
        }

        // Clean up mobile controls for pure Bounce arcade experience
        this.setupMobileControlsLayout();
    }

    /**
     * Clean up touch screen layout: keep Joystick, Jump/Bounce, and Retry only.
     */
    public setupMobileControlsLayout(): void {
        if (!this.mobileControls) return;

        try {
            // Hide non-essential buttons (crouch, interact, act, alt, exit)
            const hideActions = ['descend', 'action', 'secondaryAction', 'interact', 'exit'];
            hideActions.forEach(action => {
                const btn = this.mobileControls.getButton(action);
                if (btn) {
                    btn.style.display = 'none';
                    btn.style.pointerEvents = 'none';
                }
            });

            // Customize Jump button
            const jumpBtn = this.mobileControls.getButton('ascend');
            if (jumpBtn) {
                jumpBtn.style.display = 'flex';
            }

            // Register clean RETRY button in top-right
            this.mobileControls.registerAction({
                action: 'retry',
                label: 'RETRY',
                behavior: 'tap'
            }, {
                top: '18px',
                right: '18px',
                bottom: 'auto',
                width: 'auto',
                height: 'auto',
                borderRadius: '12px',
                fontSize: '14px'
            });
        } catch (e) {
            console.warn('Failed to customize mobile controls:', e);
        }
    }

    /**
     * Guarded mobile haptic vibration
     */
    public triggerHaptic(pattern: number | number[]): void {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try {
                navigator.vibrate(pattern);
            } catch (_) {}
        }
    }

    /**
     * Strongly-typed public velocity API for Bounce course manager
     */
    public getHorizontalVelocity(): { x: number; z: number } {
        const ms = this.getMovementSystem() as any;
        if (ms && typeof ms.horizVelX === 'number' && typeof ms.horizVelZ === 'number') {
            return { x: ms.horizVelX, z: ms.horizVelZ };
        }
        if (this.playerBody) {
            const vel = this.playerBody.linvel();
            return { x: vel.x, z: vel.z };
        }
        return { x: 0, z: 0 };
    }

    public launch(velocity: { x: number; y: number; z: number }): void {
        const cur = this.getHorizontalVelocity();
        const deltaX = velocity.x - cur.x;
        const deltaZ = velocity.z - cur.z;
        this.applyKnockback(deltaX, deltaZ, velocity.y);
    }

    public applyHorizontalDamping(maxSpeed: number): void {
        const ms = this.getMovementSystem() as any;
        if (ms && typeof ms.horizVelX === 'number' && typeof ms.horizVelZ === 'number') {
            const speed = Math.hypot(ms.horizVelX, ms.horizVelZ);
            if (speed > maxSpeed && speed > 0.001) {
                const factor = maxSpeed / speed;
                ms.horizVelX *= factor;
                ms.horizVelZ *= factor;
            }
        }
    }

    public resetMotion(): void {
        const ms = this.getMovementSystem() as any;
        if (ms && typeof ms.reset === 'function') {
            ms.reset();
        } else if (ms) {
            ms.horizVelX = 0;
            ms.horizVelZ = 0;
            ms.verticalVelocity = 0;
        }
        if (this.playerBody) {
            this.playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
    }

    override update(deltaTime: number): void {
        if (!this.playerBody) return;

        // Apply terrain-based effects (genre-specific pre-processing)
        if (!this.isPlayerInVehicle() && this.isGrounded) {
            this.applyTerrainEffects(deltaTime);
        }

        // Base class handles mobile + desktop input via applyMobileInput()
        super.update(deltaTime);
    }

    private applyTerrainEffects(deltaTime: number): void {
        const worldGen = this.getWorldGenerator() as WorldGenerator | null;
        if (!worldGen) return;

        const playerPos = this.player.position;
        const terrainType = worldGen.getTerrainTypeAt(playerPos.x, playerPos.z);
        const terrainProps = this.terrainRegistry.getType(terrainType);

        if (!terrainProps) return;

        // Note: Terrain friction is now handled automatically by the base PlayerController
        // if the WorldGenerator implements getTerrainFriction()

        // Apply damage from terrain (e.g., lava)
        if (terrainProps.damagePerSecond !== undefined && terrainProps.damagePerSecond > 0) {
            this.damageAccumulator += terrainProps.damagePerSecond * deltaTime;

            if (this.damageAccumulator >= 1.0) {
                const damage = Math.floor(this.damageAccumulator);
                this.damageAccumulator -= damage;

                console.warn(`Player taking ${damage} damage from ${terrainProps.name} terrain!`);

                // TODO: Integrate with health system when available
                // if (this.healthSystem) {
                //     this.healthSystem.takeDamage(damage);
                // }
            }
        } else {
            this.damageAccumulator = 0;
        }
    }

    override onInteract(): boolean {
        const handled = super.onInteract();
        if (handled) return true;

        // No interactable nearby, do custom voxel interaction
        console.log('Voxel: Interact button pressed - exploring the world!');
        return false;
    }
}

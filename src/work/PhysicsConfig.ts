/**
 * Physics Configuration Template
 * 
 * This file contains physics constants that can be easily modified by the AI agent
 * to adjust jump height, gravity, and terminal velocity for different game feels.
 * 
 * These values are based on Unity's implementation for consistent game feel.
 */

export interface PhysicsConstants {
    /** 
     * Gravity acceleration (negative value for downward force)
     * Default: -35.0 (Unity equivalent)
     */
    gravity: number;
    
    /**
     * Maximum falling speed
     * Default: 53.0 (Unity equivalent) 
     */
    terminalVelocity: number;
    
    /**
     * Jump height in world units
     * Default: 2.2 (Unity equivalent)
     */
    jumpHeight: number;
    
    /**
     * Air control multiplier (how much the player can move while in air)
     * 1.0 = full control, 0.0 = no control
     * Default: 0.5 (50% air control for good platforming)
     */
    airControlMultiplier: number;
    
    /**
     * Ground friction (how quickly the player stops when not moving)
     * Default: 0.9 (10% velocity retained each frame)
     */
    groundFriction: number;
    
    /**
     * Air friction (drag while in air)
     * Default: 0.98 (2% velocity lost each frame)
     */
    airFriction: number;
}

/**
 * Default physics constants
 * Modify these values to change the game's physics feel
 */
export const DEFAULT_PHYSICS: PhysicsConstants = {
    gravity: -34.0,            // Buoyant bouncy arcade gravity
    terminalVelocity: 55.0,
    jumpHeight: 4.2,           // Satisfying springy arcade jump (~3.15m apex)
    airControlMultiplier: 0.98, // Fluid responsive in-air steering
    groundFriction: 0.94,      // Crisp rolling traction and nimble stopping
    airFriction: 0.99
};

/**
 * Calculate jump velocity based on desired jump height and gravity
 * Exact kinematic formula: v = sqrt(2 * h * |g|)
 */
export function calculateJumpVelocity(jumpHeight: number, gravity: number): number {
    return Math.sqrt(jumpHeight * 2.0 * Math.abs(gravity));
}

/**
 * Preset physics configurations for different game feels
 */
export const PHYSICS_PRESETS = {
    /**
     * Default - Balanced jumping and gravity
     */
    DEFAULT: DEFAULT_PHYSICS,
    
    /**
     * Floaty - Lower gravity, higher jumps
     */
    FLOATY: {
        gravity: -20.0,
        terminalVelocity: 30.0,
        jumpHeight: 3.5,
        airControlMultiplier: 0.5,
        groundFriction: 0.9,
        airFriction: 0.95
    } as PhysicsConstants,
    
    /**
     * Heavy - Higher gravity, lower jumps
     */
    HEAVY: {
        gravity: -50.0,
        terminalVelocity: 70.0,
        jumpHeight: 1.5,
        airControlMultiplier: 0.1,
        groundFriction: 0.8,
        airFriction: 0.99
    } as PhysicsConstants,
    
    /**
     * Moon - Very low gravity, high jumps
     */
    MOON: {
        gravity: -8.0,
        terminalVelocity: 15.0,
        jumpHeight: 6.0,
        airControlMultiplier: 0.8,
        groundFriction: 0.95,
        airFriction: 0.98
    } as PhysicsConstants
};



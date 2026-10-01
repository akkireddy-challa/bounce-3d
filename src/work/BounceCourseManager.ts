import * as THREE from 'three';
import { getRapier } from 'engine/physics/RapierPhysics.js';
import { CollisionGroup, CollisionMask, makeCollisionGroups } from 'engine/CollisionLayers.js';
import { findForgedFeature, forgedFeatures, forgedPathFeature } from 'engine/ForgedLevelData.js';

/**
 * 🔴 BounceCourseManager: Handles Golden Rings, Trampolines, Spikes, Audio Synth,
 * Floating Island World Geometry, Rolling Ball Visual, and Arcade HUD
 */
export class BounceCourseManager {
    private scene: THREE.Scene;
    private player: THREE.Object3D;
    private playerController: any;
    private engine: any;

    // Entities
    private rings: { mesh: THREE.Mesh; collected: boolean; light: THREE.PointLight }[] = [];
    private trampolines: {
        mesh: THREE.Group;
        basePosition: THREE.Vector3;
        springMesh: THREE.Object3D;
        cooldown: number;
        launch: THREE.Vector3;
        isVertical: boolean;
        hasAwardedScore: boolean;
    }[] = [];
    private spikes: { mesh: THREE.Group; position: THREE.Vector3 }[] = [];
    private exitPortal: { group: THREE.Group; unlocked: boolean; light: THREE.PointLight } | null = null;
    private floatingIslands: THREE.Group[] = [];
    private physicsBodies: any[] = [];
    private courseLights: THREE.Light[] = [];
    private sceneryObjects: THREE.Object3D[] = [];
    private animatingRings: { mesh: THREE.Mesh; light?: THREE.PointLight; elapsed: number }[] = [];

    // Rolling Red Ball Visual
    private ballVisual: THREE.Group | null = null;
    private ballInnerMesh: THREE.Mesh | null = null;
    private lastPlayerPos: THREE.Vector3 = new THREE.Vector3();

    // Game State
    public totalRings: number = 5;
    public ringsCollected: number = 0;
    public isWon: boolean = false;
    public gameTime: number = 0;
    public score: number = 0;
    public highScore: number = 0;
    private spawnCheckpoint: THREE.Vector3 = new THREE.Vector3(0, 4.0, 0);
    private initialSpawn: THREE.Vector3 = new THREE.Vector3(0, 4.0, 0);
    private checkpointIndex: number = 0;
    private readonly ballRadius = 0.50;
    private readonly usesForgedLevel: boolean;
    private forgedCheckpoints: THREE.Vector3[] = [];
    private forgedFallY = -Infinity;

    // Ball Squash, Stretch, Shadow, and Particle Animation
    private ballScale: THREE.Vector3 = new THREE.Vector3(1, 1, 1);
    private targetBallScale: THREE.Vector3 = new THREE.Vector3(1, 1, 1);
    private shadowMesh: THREE.Mesh | null = null;
    private squishWobbleTimer: number = 0;
    private wasGrounded: boolean = true;
    private trampolineFlightTimer: number = 0;
    private sparklePool: THREE.Mesh[] = [];
    private activeSparkles: { mesh: THREE.Mesh; life: number; maxLife: number }[] = [];

    // Audio Context (Procedural Web Audio API & Bitmagic Pro SFX)
    private audioCtx: AudioContext | null = null;
    private proBoingAudio: HTMLAudioElement | null = null;
    private proBounceAudio: HTMLAudioElement | null = null;

    // HUD DOM Elements
    private hudContainer: HTMLElement | null = null;
    private ringsDisplay: HTMLElement | null = null;
    private timerDisplay: HTMLElement | null = null;
    private scoreDisplay: HTMLElement | null = null;
    private highScoreDisplay: HTMLElement | null = null;
    private retryButton: HTMLElement | null = null;

    constructor(scene: THREE.Scene, player: THREE.Object3D, playerController: any, engine?: any) {
        this.scene = scene;
        this.player = player;
        this.playerController = playerController;
        this.engine = engine;
        this.usesForgedLevel = Boolean(this.engine?.getGameData?.()?.worldProfileData?.meshLevel);

        // Initialize Bitmagic Pro Studio Audio SFX
        try {
            this.proBoingAudio = new Audio('https://forged-assets.bitmagic.ai/sound-effects/27363f1c-206a-4986-8d90-36f6c85dbcee/sound-effect.opus');
            this.proBoingAudio.volume = 0.75;
            this.proBounceAudio = new Audio('https://forged-assets.bitmagic.ai/sound-effects/bb5c6ace-07e4-4e96-b3db-07962da90b75/sound-effect.opus');
            this.proBounceAudio.volume = 0.65;
        } catch (e) {}

        // A forged mesh level owns the player spawn and collider height. The legacy
        // course keeps its hand-authored start point for backwards compatibility.
        if (this.usesForgedLevel) {
            this.spawnCheckpoint.copy(this.getPhysicsPosition());
            this.lastPlayerPos.copy(this.getBallPosition());
        } else if (player) {
            this.spawnCheckpoint.set(0, 4.0, 0);
            this.lastPlayerPos.set(0, 4.0, 0);
            player.position.set(0, 4.0, 0);
            if (this.playerController?.playerBody) {
                this.playerController.playerBody.setTranslation({ x: 0, y: 4.0, z: 0 }, true);
                this.playerController.playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
            }
        }
        this.initialSpawn.copy(this.spawnCheckpoint);

        // Load persisted high score from local storage
        try {
            const saved = localStorage.getItem('bounce3d_highscore');
            if (saved) {
                this.highScore = parseInt(saved, 10) || 0;
            }
        } catch (e) {
            this.highScore = 0;
        }

        this.initAudio();
        this.initHUD();
        this.createBallVisual();
        if (this.usesForgedLevel) {
            this.buildForgedCourse();
        } else {
            this.buildObstacleCourse();
            this.buildWorldScenery();
        }
    }

    private getPhysicsPosition(): THREE.Vector3 {
        const body = this.playerController?.playerBody;
        if (body && typeof body.translation === 'function') {
            const position = body.translation();
            return new THREE.Vector3(position.x, position.y, position.z);
        }
        return this.player.position.clone();
    }

    /**
     * Align the visual ball to the physics capsule's contact point. This avoids
     * copying the character group's origin, which is above the collider floor
     * and makes the ball appear to clip into a forged mesh level.
     */
    private getBallPosition(): THREE.Vector3 {
        // On a surface, use the controller's collision-backed ground query. It
        // gives the visual ball an exact tangent contact with forged terrain.
        if (this.playerController?.isGrounded && typeof this.playerController.getGroundPosition === 'function') {
            const ground = this.playerController.getGroundPosition();
            return new THREE.Vector3(ground.x, ground.y + this.ballRadius, ground.z);
        }
        const body = this.playerController?.playerBody;
        if (body && typeof body.translation === 'function') {
            const position = body.translation();
            const capsuleHeight = this.playerController?.getCapsuleHeight?.() ?? 1.5;
            return new THREE.Vector3(
                position.x,
                position.y - capsuleHeight * 0.5 + this.ballRadius,
                position.z
            );
        }
        return this.player.position.clone();
    }

    private initAudio(): void {
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
                this.audioCtx = new AudioContextClass();
            }
        } catch (e) {
            console.warn('AudioContext not available:', e);
        }
    }

    private resumeAudio(): void {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    public playChime(): void {
        this.resumeAudio();
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;

        // Two-tone harmonic chime
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
            const osc = this.audioCtx!.createOscillator();
            const gain = this.audioCtx!.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.06);

            gain.gain.setValueAtTime(0.3, now + idx * 0.06);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.5);

            osc.connect(gain);
            gain.connect(this.audioCtx!.destination);

            osc.start(now + idx * 0.06);
            osc.stop(now + idx * 0.06 + 0.5);
        });
    }

    public playBoing(): void {
        this.resumeAudio();
        if (this.proBoingAudio) {
            try {
                this.proBoingAudio.currentTime = 0;
                this.proBoingAudio.play().catch(() => this.playSynthBoing());
                return;
            } catch (e) {}
        }
        this.playSynthBoing();
    }

    private playSynthBoing(): void {
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(820, now + 0.22);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.35);
    }

    public playPop(): void {
        this.resumeAudio();
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.18);

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.2);
    }

    public playVictory(): void {
        this.resumeAudio();
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;

        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
            const osc = this.audioCtx!.createOscillator();
            const gain = this.audioCtx!.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.12);

            gain.gain.setValueAtTime(0.4, now + idx * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.12 + 0.6);

            osc.connect(gain);
            gain.connect(this.audioCtx!.destination);

            osc.start(now + idx * 0.12);
            osc.stop(now + idx * 0.12 + 0.6);
        });
    }

    public playBounceThud(impactSpeed: number = 1.0): void {
        this.resumeAudio();
        if (this.proBounceAudio && impactSpeed > 2.0) {
            try {
                this.proBounceAudio.currentTime = 0;
                this.proBounceAudio.volume = Math.min(0.85, 0.35 + impactSpeed * 0.04);
                this.proBounceAudio.play().catch(() => this.playSynthBounceThud(impactSpeed));
                return;
            } catch (e) {}
        }
        this.playSynthBounceThud(impactSpeed);
    }

    private playSynthBounceThud(impactSpeed: number = 1.0): void {
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        const baseFreq = Math.min(130, 85 + impactSpeed * 3.5);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(32, now + 0.12);

        const vol = Math.min(0.35, 0.12 + impactSpeed * 0.02);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.13);
    }

    private initHUD(): void {
        // Hide generic debug control scheme overlay so only our polished arcade HUD shows
        const style = document.createElement('style');
        style.id = 'bounce3d-hide-debug-controls';
        style.textContent = `
            .hud-controls, #hud-controls, .hud-controls__title, .hud-controls__row {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
            }
        `;
        document.head.appendChild(style);

        // Create stylish floating Arcade HUD
        this.hudContainer = document.createElement('div');
        this.hudContainer.id = 'bounce3d-hud';
        this.hudContainer.style.position = 'fixed';
        this.hudContainer.style.top = '16px';
        this.hudContainer.style.left = '16px';
        this.hudContainer.style.zIndex = '9999';
        this.hudContainer.style.display = 'flex';
        this.hudContainer.style.flexWrap = 'wrap';
        this.hudContainer.style.gap = '10px';
        this.hudContainer.style.alignItems = 'center';
        this.hudContainer.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        this.hudContainer.style.fontWeight = 'bold';
        this.hudContainer.style.pointerEvents = 'none';

        // Rings counter card
        this.ringsDisplay = document.createElement('div');
        this.ringsDisplay.style.background = 'rgba(15, 23, 42, 0.9)';
        this.ringsDisplay.style.backdropFilter = 'blur(8px)';
        this.ringsDisplay.style.border = '2px solid #FBBF24';
        this.ringsDisplay.style.borderRadius = '500px';
        this.ringsDisplay.style.padding = '7px 16px';
        this.ringsDisplay.style.color = '#FBBF24';
        this.ringsDisplay.style.fontSize = '16px';
        this.ringsDisplay.style.boxShadow = '0 4px 14px rgba(251, 191, 36, 0.35)';
        this.ringsDisplay.innerText = `🟡 Rings: 0 / ${this.totalRings}`;

        // Score card
        this.scoreDisplay = document.createElement('div');
        this.scoreDisplay.style.background = 'rgba(15, 23, 42, 0.9)';
        this.scoreDisplay.style.backdropFilter = 'blur(8px)';
        this.scoreDisplay.style.border = '2px solid #10B981';
        this.scoreDisplay.style.borderRadius = '500px';
        this.scoreDisplay.style.padding = '7px 16px';
        this.scoreDisplay.style.color = '#10B981';
        this.scoreDisplay.style.fontSize = '16px';
        this.scoreDisplay.style.boxShadow = '0 4px 14px rgba(16, 185, 129, 0.35)';
        this.scoreDisplay.innerText = '⭐ Score: 0';

        // Speedrun timer card
        this.timerDisplay = document.createElement('div');
        this.timerDisplay.style.background = 'rgba(15, 23, 42, 0.9)';
        this.timerDisplay.style.backdropFilter = 'blur(8px)';
        this.timerDisplay.style.border = '2px solid #38BDF8';
        this.timerDisplay.style.borderRadius = '500px';
        this.timerDisplay.style.padding = '7px 16px';
        this.timerDisplay.style.color = '#38BDF8';
        this.timerDisplay.style.fontSize = '16px';
        this.timerDisplay.style.boxShadow = '0 4px 14px rgba(56, 189, 248, 0.35)';
        this.timerDisplay.innerText = '⏱️ 00:00.0';

        // High Score card
        this.highScoreDisplay = document.createElement('div');
        this.highScoreDisplay.style.background = 'rgba(15, 23, 42, 0.9)';
        this.highScoreDisplay.style.backdropFilter = 'blur(8px)';
        this.highScoreDisplay.style.border = '2px solid #A855F7';
        this.highScoreDisplay.style.borderRadius = '500px';
        this.highScoreDisplay.style.padding = '7px 16px';
        this.highScoreDisplay.style.color = '#C084FC';
        this.highScoreDisplay.style.fontSize = '16px';
        this.highScoreDisplay.style.boxShadow = '0 4px 14px rgba(168, 85, 247, 0.35)';
        this.highScoreDisplay.innerText = `🏆 Best: ${this.highScore.toLocaleString()}`;

        // Retry Button (Interactive click + Key: R)
        this.retryButton = document.createElement('button');
        this.retryButton.style.background = 'linear-gradient(135deg, #EF4444, #B91C1C)';
        this.retryButton.style.border = '2px solid #FCA5A5';
        this.retryButton.style.borderRadius = '500px';
        this.retryButton.style.padding = '7px 18px';
        this.retryButton.style.color = '#FFFFFF';
        this.retryButton.style.fontSize = '15px';
        this.retryButton.style.fontWeight = 'bold';
        this.retryButton.style.cursor = 'pointer';
        this.retryButton.style.pointerEvents = 'auto';
        this.retryButton.style.boxShadow = '0 4px 14px rgba(239, 68, 68, 0.4)';
        this.retryButton.style.transition = 'transform 0.15s ease, background 0.15s ease';
        this.retryButton.innerText = '🔄 Retry (R)';
        this.retryButton.title = 'Restart Run from Start (Key: R)';
        this.retryButton.onclick = () => { this.restartRun(); };
        this.retryButton.onmouseenter = () => { if (this.retryButton) this.retryButton.style.transform = 'scale(1.06)'; };
        this.retryButton.onmouseleave = () => { if (this.retryButton) this.retryButton.style.transform = 'scale(1.0)'; };

        // Controls hint badge (Responsive touch vs desktop)
        const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0));
        const controlsCard = document.createElement('div');
        controlsCard.style.background = 'rgba(15, 23, 42, 0.9)';
        controlsCard.style.backdropFilter = 'blur(8px)';
        controlsCard.style.border = '2px solid #64748B';
        controlsCard.style.borderRadius = '500px';
        controlsCard.style.padding = '7px 16px';
        controlsCard.style.color = '#E2E8F0';
        controlsCard.style.fontSize = '14px';
        controlsCard.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.35)';
        controlsCard.innerText = isTouch
            ? '📱 Joystick: Roll · JUMP: Bounce'
            : '🎮 WASD / Arrows: Roll · Space: Bounce Jump · R: Retry';

        this.hudContainer.appendChild(this.ringsDisplay);
        this.hudContainer.appendChild(this.scoreDisplay);
        this.hudContainer.appendChild(this.timerDisplay);
        this.hudContainer.appendChild(this.highScoreDisplay);
        this.hudContainer.appendChild(this.retryButton);
        this.hudContainer.appendChild(controlsCard);
        document.body.appendChild(this.hudContainer);
    }

    public addScore(points: number, label?: string): void {
        this.score += points;
        if (this.score > this.highScore) {
            this.highScore = this.score;
            try {
                localStorage.setItem('bounce3d_highscore', String(this.highScore));
            } catch (e) {}
        }
        this.updateScoreDisplay();
        if (label) {
            this.showScorePopup(label, points);
        }
    }

    private showScorePopup(label: string, points: number): void {
        const popup = document.createElement('div');
        popup.style.position = 'fixed';
        popup.style.top = '78px';
        popup.style.left = '50%';
        popup.style.transform = 'translateX(-50%)';
        popup.style.color = points >= 500 ? '#FBBF24' : '#10B981';
        popup.style.fontSize = '24px';
        popup.style.fontWeight = '900';
        popup.style.textShadow = '0 0 14px rgba(251, 191, 36, 0.8), 0 2px 4px rgba(0,0,0,0.9)';
        popup.style.pointerEvents = 'none';
        popup.style.zIndex = '99999';
        popup.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        popup.style.transition = 'all 0.75s ease-out';
        popup.style.opacity = '1';
        popup.innerText = label;
        document.body.appendChild(popup);

        requestAnimationFrame(() => {
            popup.style.transform = 'translate(-50%, -40px) scale(1.18)';
            popup.style.opacity = '0';
        });

        setTimeout(() => popup.remove(), 750);
    }

    private updateScoreDisplay(): void {
        if (this.scoreDisplay) {
            this.scoreDisplay.innerText = `⭐ Score: ${this.score.toLocaleString()}`;
        }
        if (this.highScoreDisplay) {
            this.highScoreDisplay.innerText = `🏆 Best: ${this.highScore.toLocaleString()}`;
        }
    }

    public restartRun(): void {
        this.isWon = false;
        this.gameTime = 0;
        this.score = 0;
        this.checkpointIndex = 0;
        this.spawnCheckpoint.copy(this.initialSpawn);

        // Re-enable all rings
        this.ringsCollected = 0;
        this.rings.forEach(r => {
            r.collected = false;
            r.mesh.visible = true;
            r.mesh.scale.set(1, 1, 1);
            if (r.light) r.light.intensity = 2.5;
        });

        // Relock portal
        if (this.exitPortal) {
            this.exitPortal.unlocked = false;
            const diskMesh = this.exitPortal.group.getObjectByName('portal_energy_disk') as THREE.Mesh;
            if (diskMesh && diskMesh.material) {
                (diskMesh.material as THREE.MeshBasicMaterial).color.setHex(0x06B6D4);
            }
            if (this.exitPortal.light) {
                this.exitPortal.light.color.setHex(0x00FFFF);
                this.exitPortal.light.intensity = 6.0;
            }
        }

        // Remove victory modal if present
        const modal = document.getElementById('bounce-victory-modal');
        if (modal) modal.remove();

        // Clear any in-flight ring animations
        this.animatingRings = [];

        // Reset kinematic motor velocity and teleport player back to Spawn Island
        const ms = this.playerController?.getMovementSystem?.() as any;
        if (ms && typeof ms.reset === 'function') {
            ms.reset();
        }
        this.trampolineFlightTimer = 0;
        if (this.playerController && typeof this.playerController.teleportTo === 'function') {
            this.playerController.teleportTo(this.spawnCheckpoint.x, this.spawnCheckpoint.y, this.spawnCheckpoint.z);
        } else if (this.playerController?.playerBody) {
            const body = this.playerController.playerBody;
            if (typeof body.setTranslation === 'function') {
                body.setTranslation({
                    x: this.spawnCheckpoint.x,
                    y: this.spawnCheckpoint.y,
                    z: this.spawnCheckpoint.z
                }, true);
            }
            if (typeof body.setLinvel === 'function') {
                body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            }
        }
        if (!this.usesForgedLevel) {
            this.player.position.copy(this.spawnCheckpoint);
        }
        if (this.ballVisual) {
            this.ballVisual.position.copy(this.getBallPosition());
        }
        this.ballScale.set(1, 1, 1);
        this.targetBallScale.set(1, 1, 1);
        this.wasGrounded = true;
        this.squishWobbleTimer = 0;
        this.activeSparkles.forEach(s => { s.mesh.visible = false; });
        this.activeSparkles = [];
        this.trampolines.forEach(t => {
            t.cooldown = 0;
            t.hasAwardedScore = false;
            t.springMesh.scale.set(1.0, 1.0, 1.0);
        });

        this.updateRingsDisplay();
        this.updateTimerDisplay();
        this.updateScoreDisplay();
        this.playChime();
        this.showToast('🔄 RUN RESTARTED FROM SPAWN', '#38BDF8');
    }

    /**
     * Creates a guaranteed-visible high-gloss Nokia red bouncing sphere
     */
    private createBallVisual(): void {
        this.ballVisual = new THREE.Group();
        this.ballVisual.name = 'Bounce3D_BallVisualGroup';

        const radius = this.ballRadius;
        // Faceted low-poly diamond ruby sphere with fine geodesic facets matching reference artwork
        const sphereGeo = new THREE.IcosahedronGeometry(radius, 3);
        const sphereMat = new THREE.MeshStandardMaterial({
            color: 0xDC2626, // Saturated, rich candy-apple crimson red
            roughness: 0.22, // Soft specular shine without washing out diffuse color
            metalness: 0.08, // Dielectric rubber/gem
            flatShading: true, // Crisp gem-cut facets catching light from all angles!
            emissive: 0x450A0A, // Deep warm shadow
            emissiveIntensity: 0.15
        });

        this.ballInnerMesh = new THREE.Mesh(sphereGeo, sphereMat);
        this.ballInnerMesh.castShadow = true;
        this.ballInnerMesh.receiveShadow = true;
        this.ballVisual.add(this.ballInnerMesh);

        // Radiant arcade point light illuminating the grass beneath the ball
        const ballLight = new THREE.PointLight(0xEF4444, 2.0, 5);
        ballLight.position.set(0, 0.2, 0);
        this.ballVisual.add(ballLight);

        this.ballVisual.position.copy(this.getBallPosition());
        this.scene.add(this.ballVisual);

        // Ground Drop Shadow Decal (Grounded projection circle)
        const shadowGeo = new THREE.CircleGeometry(0.65, 32);
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x090D16,
            transparent: true,
            opacity: 0.45,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
        this.shadowMesh.rotation.x = -Math.PI / 2;
        const initialBallPosition = this.getBallPosition();
        this.shadowMesh.position.set(initialBallPosition.x, initialBallPosition.y - this.ballRadius + 0.02, initialBallPosition.z);
        this.scene.add(this.shadowMesh);

        // Initialize reusable pool of speed sparkle particles
        const sparkleGeo = new THREE.OctahedronGeometry(0.08, 0);
        const sparkleMat = new THREE.MeshBasicMaterial({ color: 0xFBBF24, transparent: true, opacity: 0.9 });
        for (let i = 0; i < 16; i++) {
            const sparkle = new THREE.Mesh(sparkleGeo, sparkleMat.clone());
            sparkle.visible = false;
            this.scene.add(sparkle);
            this.sparklePool.push(sparkle);
        }

        console.log('🔴 Bounce 3D Ball Visual attached to scene!');
    }

    private spawnSpeedSparkle(pos: THREE.Vector3): void {
        const available = this.sparklePool.find(p => !p.visible);
        if (!available) return;

        available.visible = true;
        available.position.set(
            pos.x + (Math.random() - 0.5) * 0.4,
            pos.y + 0.3 + (Math.random() - 0.5) * 0.3,
            pos.z + (Math.random() - 0.5) * 0.4
        );
        available.scale.set(1.0, 1.0, 1.0);
        (available.material as THREE.MeshBasicMaterial).opacity = 0.9;
        this.activeSparkles.push({ mesh: available, life: 0, maxLife: 0.35 });
    }

    private updateSpeedSparkles(deltaTime: number): void {
        for (let i = this.activeSparkles.length - 1; i >= 0; i--) {
            const item = this.activeSparkles[i];
            if (!item) continue;
            item.life += deltaTime;
            if (item.life >= item.maxLife) {
                item.mesh.visible = false;
                this.activeSparkles.splice(i, 1);
            } else {
                const progress = item.life / item.maxLife;
                const scale = 1.0 - progress * 0.7;
                item.mesh.scale.set(scale, scale, scale);
                item.mesh.position.y += deltaTime * 0.8;
                (item.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1.0 - progress);
            }
        }
    }

    /**
     * Builds floating islands, rolling low-poly mounds, cobblestone pathways, faceted trees,
     * boulders, flower patches, distant horizon mountains, and clouds matching wallpaper reference
     */
    private buildWorldScenery(): void {
        const RAPIER = getRapier();

        const sunLight = new THREE.DirectionalLight(0xFFFBEB, 1.4);
        sunLight.position.set(25, 45, 20);
        sunLight.castShadow = true;
        this.scene.add(sunLight);
        this.courseLights.push(sunLight);

        const skyAmbient = new THREE.AmbientLight(0xBAE6FD, 0.75);
        this.scene.add(skyAmbient);
        this.courseLights.push(skyAmbient);

        // 1. Elevated Floating Islands in a Wide Platformer Vista
        const islandConfigs = [
            { pos: new THREE.Vector3(0, 3.5, -1.0), radius: 6.5, color: 0x10B981, rimColor: 0xFBBF24 },       // Tier 1: Emerald Spawn Island
            { pos: new THREE.Vector3(10.5, 4.6, -17.0), radius: 5.2, color: 0x0284C7, rimColor: 0x38BDF8 },  // Tier 2: Azure Sky Terrace
            { pos: new THREE.Vector3(-10.5, 6.2, -29.0), radius: 5.2, color: 0x7C3AED, rimColor: 0xC084FC }, // Tier 3: Amethyst Pinnacle
            { pos: new THREE.Vector3(0, 8.0, -42.0), radius: 7.2, color: 0xD97706, rimColor: 0xF59E0B },     // Tier 4: Golden Victory Citadel
        ];

        islandConfigs.forEach((cfg) => {
            const island = new THREE.Group();
            island.position.copy(cfg.pos);

            // Island top (lush grass disc)
            const topGeo = new THREE.CylinderGeometry(cfg.radius, cfg.radius * 0.96, 0.5, 28);
            const topMat = new THREE.MeshStandardMaterial({
                color: cfg.color,
                roughness: 0.4,
                metalness: 0.1,
                flatShading: true
            });
            const topMesh = new THREE.Mesh(topGeo, topMat);
            topMesh.position.y = 0.25;
            topMesh.receiveShadow = true;
            island.add(topMesh);

            // Decorative checkered grass border
            const innerGrassGeo = new THREE.CylinderGeometry(cfg.radius * 0.92, cfg.radius * 0.92, 0.52, 28);
            const innerGrassMat = new THREE.MeshStandardMaterial({
                color: 0x047857,
                roughness: 0.5,
                flatShading: true
            });
            const innerGrassMesh = new THREE.Mesh(innerGrassGeo, innerGrassMat);
            innerGrassMesh.position.y = 0.25;
            island.add(innerGrassMesh);

            // Beveled faceted stone cliff rim
            const cliffGeo = new THREE.CylinderGeometry(cfg.radius * 0.98, cfg.radius * 0.85, 0.8, 14);
            const cliffMat = new THREE.MeshStandardMaterial({
                color: 0x64748B, // Slate stone
                roughness: 0.8,
                metalness: 0.2,
                flatShading: true
            });
            const cliffMesh = new THREE.Mesh(cliffGeo, cliffMat);
            cliffMesh.position.y = -0.3;
            island.add(cliffMesh);

            // Deep inverted tapered rock stalactite keel hanging below the island (Reference Artwork)
            const keelHeight = cfg.radius * 1.5;
            const keelGeo = new THREE.CylinderGeometry(cfg.radius * 0.85, 0.35, keelHeight, 7);
            const keelMat = new THREE.MeshStandardMaterial({
                color: 0x475569, // Dark slate bedrock
                roughness: 0.88,
                metalness: 0.15,
                flatShading: true
            });
            const keelMesh = new THREE.Mesh(keelGeo, keelMat);
            keelMesh.position.y = - (keelHeight * 0.5) - 0.7;
            island.add(keelMesh);

            // Island boundary ring matching tier theme
            const rimGeo = new THREE.TorusGeometry(cfg.radius, 0.14, 8, 28);
            const rimMat = new THREE.MeshStandardMaterial({
                color: cfg.rimColor || 0xFBBF24,
                metalness: 0.85,
                roughness: 0.15,
                emissive: (cfg.rimColor || 0xFBBF24),
                emissiveIntensity: 0.3
            });
            const rimMesh = new THREE.Mesh(rimGeo, rimMat);
            rimMesh.rotation.x = Math.PI * 0.5;
            rimMesh.position.y = 0.5;
            island.add(rimMesh);

            this.scene.add(island);
            this.floatingIslands.push(island);

            // Solid Rapier physics collider for island surface
            if (this.engine?.physicsWorld && RAPIER) {
                try {
                    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(cfg.pos.x, cfg.pos.y + 0.25, cfg.pos.z);
                    const body = this.engine.physicsWorld.createRigidBody(bodyDesc);
                    const colDesc = RAPIER.ColliderDesc.cylinder(0.3, cfg.radius)
                        .setFriction(0.9)
                        .setCollisionGroups(makeCollisionGroups(CollisionGroup.ENVIRONMENT, CollisionMask.ENVIRONMENT));
                    this.engine.physicsWorld.createCollider(colDesc, body);
                    this.physicsBodies.push(body);
                } catch (e) {
                    console.warn('Physics collider creation warning:', e);
                }
            }
        });

        // 1b. Seamless Connecting Stone Bridges / Raised Pathways (Wallpaper Reference Artwork)
        const bridgeSegments = [
            // Bridge 1: Emerald Spawn Island to Azure Sky Terrace
            {
                points: [
                    new THREE.Vector3(1.5, 4.0, -6.5),
                    new THREE.Vector3(4.2, 4.3, -9.8),
                    new THREE.Vector3(6.8, 4.7, -13.0),
                    new THREE.Vector3(9.2, 5.1, -15.5)
                ],
                width: 3.6,
                deckColor: 0x10B981,
                curbColor: 0xFBBF24
            },
            // Bridge 2: Azure Sky Terrace to Amethyst Pinnacle (Sweeping Mid-Sky Arch beneath Hoop 4)
            {
                points: [
                    new THREE.Vector3(8.0, 5.1, -21.0),
                    new THREE.Vector3(3.5, 5.6, -23.5),
                    new THREE.Vector3(-1.8, 6.1, -25.2),
                    new THREE.Vector3(-7.2, 6.7, -27.5)
                ],
                width: 3.6,
                deckColor: 0x0284C7,
                curbColor: 0x38BDF8
            },
            // Bridge 3: Amethyst Pinnacle to Golden Citadel Base Promenade
            {
                points: [
                    new THREE.Vector3(-7.5, 6.7, -33.0),
                    new THREE.Vector3(-4.5, 7.3, -36.2),
                    new THREE.Vector3(-1.8, 8.0, -39.0),
                    new THREE.Vector3(0.0, 8.5, -40.5)
                ],
                width: 4.0,
                deckColor: 0x7C3AED,
                curbColor: 0xC084FC
            }
        ];

        bridgeSegments.forEach(bridge => {
            for (let i = 0; i < bridge.points.length - 1; i++) {
                const pA = bridge.points[i];
                const pB = bridge.points[i + 1];
                if (!pA || !pB) continue;
                const mid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
                const delta = new THREE.Vector3().subVectors(pB, pA);
                const segLen = delta.length();
                const dir = delta.clone().normalize();

                const segGroup = new THREE.Group();
                segGroup.position.copy(mid);

                // Calculate orientation quaternion aligning Z with direction
                const segQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
                segGroup.quaternion.copy(segQuat);

                // 1. Grassy bridge surface deck
                const deckGeo = new THREE.BoxGeometry(bridge.width, 0.35, segLen * 1.04);
                const deckMat = new THREE.MeshStandardMaterial({
                    color: bridge.deckColor,
                    roughness: 0.45,
                    metalness: 0.1,
                    flatShading: true
                });
                const deckMesh = new THREE.Mesh(deckGeo, deckMat);
                deckMesh.position.y = 0.12;
                deckMesh.receiveShadow = true;
                segGroup.add(deckMesh);

                // 2. Beveled stone bedrock keel underneath
                const keelGeo = new THREE.BoxGeometry(bridge.width * 0.92, 1.2, segLen * 1.04);
                const keelMat = new THREE.MeshStandardMaterial({
                    color: 0x475569,
                    roughness: 0.85,
                    metalness: 0.2,
                    flatShading: true
                });
                const keelMesh = new THREE.Mesh(keelGeo, keelMat);
                keelMesh.position.y = -0.6;
                segGroup.add(keelMesh);

                // 3. Tactile stone safety curbs on left and right sides
                const curbGeo = new THREE.BoxGeometry(0.35, 0.38, segLen * 1.04);
                const curbMat = new THREE.MeshStandardMaterial({
                    color: bridge.curbColor || 0xFBBF24,
                    roughness: 0.3,
                    metalness: 0.6,
                    flatShading: true
                });
                const leftCurb = new THREE.Mesh(curbGeo, curbMat);
                leftCurb.position.set(-bridge.width * 0.5 + 0.17, 0.35, 0);
                segGroup.add(leftCurb);

                const rightCurb = new THREE.Mesh(curbGeo, curbMat);
                rightCurb.position.set(bridge.width * 0.5 - 0.17, 0.35, 0);
                segGroup.add(rightCurb);

                this.scene.add(segGroup);
                this.sceneryObjects.push(segGroup);

                // Rapier physics collider for bridge segment
                if (this.engine?.physicsWorld && RAPIER) {
                    try {
                        const bodyDesc = RAPIER.RigidBodyDesc.fixed()
                            .setTranslation(mid.x, mid.y + 0.12, mid.z)
                            .setRotation({ x: segQuat.x, y: segQuat.y, z: segQuat.z, w: segQuat.w });
                        const body = this.engine.physicsWorld.createRigidBody(bodyDesc);
                        const colDesc = RAPIER.ColliderDesc.cuboid(bridge.width * 0.5, 0.25, (segLen * 1.04) * 0.5)
                            .setFriction(0.9)
                            .setCollisionGroups(makeCollisionGroups(CollisionGroup.ENVIRONMENT, CollisionMask.ENVIRONMENT));
                        this.engine.physicsWorld.createCollider(colDesc, body);
                        this.physicsBodies.push(body);
                    } catch (e) {
                        console.warn('Bridge physics collider warning:', e);
                    }
                }
            }
        });

        // 1c. Floating Satellite Rock Chunks Drifting around Islands (Reference Artwork)
        const satelliteRockConfigs = [
            { pos: new THREE.Vector3(-7.5, 4.8, 2.0), scale: new THREE.Vector3(1.1, 0.8, 0.9), color: 0x64748B },
            { pos: new THREE.Vector3(7.2, 5.2, -4.5), scale: new THREE.Vector3(0.9, 1.2, 0.8), color: 0x475569 },
            { pos: new THREE.Vector3(4.5, 3.2, -10.0), scale: new THREE.Vector3(1.0, 0.7, 1.1), color: 0x94A3B8 },
            { pos: new THREE.Vector3(16.0, 6.0, -18.5), scale: new THREE.Vector3(1.3, 0.9, 1.0), color: 0x64748B },
            { pos: new THREE.Vector3(6.5, 7.0, -23.5), scale: new THREE.Vector3(1.0, 1.1, 0.8), color: 0x475569 },
            { pos: new THREE.Vector3(-15.5, 7.8, -31.0), scale: new THREE.Vector3(1.2, 0.9, 1.1), color: 0x64748B },
            { pos: new THREE.Vector3(-6.0, 9.2, -35.5), scale: new THREE.Vector3(0.9, 1.0, 0.8), color: 0x94A3B8 },
            { pos: new THREE.Vector3(6.8, 10.0, -43.0), scale: new THREE.Vector3(1.4, 1.1, 1.2), color: 0x475569 },
            { pos: new THREE.Vector3(-6.8, 10.5, -45.0), scale: new THREE.Vector3(1.2, 1.3, 1.0), color: 0x64748B },
            { pos: new THREE.Vector3(0, 12.0, -49.0), scale: new THREE.Vector3(1.5, 1.0, 1.3), color: 0x334155 },
        ];

        satelliteRockConfigs.forEach(src => {
            const satGeo = new THREE.DodecahedronGeometry(0.8, 0);
            const satMat = new THREE.MeshStandardMaterial({
                color: src.color,
                roughness: 0.85,
                metalness: 0.15,
                flatShading: true
            });
            const satMesh = new THREE.Mesh(satGeo, satMat);
            satMesh.position.copy(src.pos);
            satMesh.scale.copy(src.scale);
            satMesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            satMesh.castShadow = true;
            this.scene.add(satMesh);
        });

        // 2. Rolling Low-Poly Grassy Mounds on Islands (Wallpaper Contour)
        const moundConfigs = [
            // Spawn Island mounds
            { pos: new THREE.Vector3(-3.8, 3.8, 3.2), scale: new THREE.Vector3(2.2, 0.8, 2.0), color: 0x22C55E },
            { pos: new THREE.Vector3(3.8, 3.8, 3.0), scale: new THREE.Vector3(2.0, 0.7, 1.8), color: 0x16A34A },
            { pos: new THREE.Vector3(-4.6, 3.8, -1.0), scale: new THREE.Vector3(1.8, 0.6, 1.8), color: 0x4ADE80 },
            // Azure Terrace mounds
            { pos: new THREE.Vector3(14.0, 4.9, -17.5), scale: new THREE.Vector3(1.8, 0.7, 1.8), color: 0x0284C7 },
            { pos: new THREE.Vector3(12.0, 4.9, -13.0), scale: new THREE.Vector3(1.6, 0.6, 1.6), color: 0x38BDF8 },
            // Amethyst Pinnacle mounds
            { pos: new THREE.Vector3(-14.0, 6.5, -29.5), scale: new THREE.Vector3(1.8, 0.7, 1.8), color: 0x7C3AED },
            { pos: new THREE.Vector3(-12.5, 6.5, -26.0), scale: new THREE.Vector3(1.6, 0.6, 1.6), color: 0xA855F7 },
            // Golden Citadel mounds
            { pos: new THREE.Vector3(-5.2, 8.3, -43.0), scale: new THREE.Vector3(2.4, 0.9, 2.2), color: 0xD97706 },
            { pos: new THREE.Vector3(5.2, 8.3, -43.0), scale: new THREE.Vector3(2.4, 0.9, 2.2), color: 0xF59E0B },
        ];

        moundConfigs.forEach(mc => {
            const moundGeo = new THREE.DodecahedronGeometry(1.0, 1);
            const moundMat = new THREE.MeshStandardMaterial({
                color: mc.color,
                roughness: 0.5,
                flatShading: true
            });
            const mound = new THREE.Mesh(moundGeo, moundMat);
            mound.position.copy(mc.pos);
            mound.scale.copy(mc.scale);
            mound.receiveShadow = true;
            this.scene.add(mound);
        });

        // 3. Faceted Low-Poly Trees (Pine Cones & Round Geometric Canopies)
        const treeConfigs = [
            // Spawn Island Trees (rim positions framing the cinematic course)
            { pos: new THREE.Vector3(-4.6, 4.0, 3.2), type: 'pine' as const, scale: 1.1 },
            { pos: new THREE.Vector3(4.4, 4.0, 3.2), type: 'round' as const, scale: 1.05 },
            { pos: new THREE.Vector3(-5.5, 4.0, 0.0), type: 'round' as const, scale: 1.0 },
            { pos: new THREE.Vector3(5.5, 4.0, -1.2), type: 'pine' as const, scale: 1.15 },
            { pos: new THREE.Vector3(5.0, 4.0, -4.2), type: 'round' as const, scale: 0.95 },
            { pos: new THREE.Vector3(-4.8, 4.0, -3.5), type: 'pine' as const, scale: 1.0 },

            // Azure Terrace Trees
            { pos: new THREE.Vector3(14.5, 5.1, -17.0), type: 'pine' as const, scale: 1.2 },
            { pos: new THREE.Vector3(13.8, 5.1, -20.5), type: 'round' as const, scale: 1.1 },
            { pos: new THREE.Vector3(13.2, 5.1, -13.0), type: 'pine' as const, scale: 1.05 },

            // Amethyst Pinnacle Trees
            { pos: new THREE.Vector3(-14.8, 6.7, -29.0), type: 'pine' as const, scale: 1.25 },
            { pos: new THREE.Vector3(-14.0, 6.7, -32.5), type: 'round' as const, scale: 1.15 },
            { pos: new THREE.Vector3(-13.2, 6.7, -25.5), type: 'pine' as const, scale: 1.1 },

            // Golden Citadel Portal Guardian Trees
            { pos: new THREE.Vector3(-5.8, 8.5, -40.0), type: 'pine' as const, scale: 1.4 },
            { pos: new THREE.Vector3(5.8, 8.5, -40.0), type: 'pine' as const, scale: 1.4 },
            { pos: new THREE.Vector3(-5.2, 8.5, -45.5), type: 'round' as const, scale: 1.3 },
            { pos: new THREE.Vector3(5.2, 8.5, -45.5), type: 'round' as const, scale: 1.3 },
        ];

        treeConfigs.forEach(tc => {
            const tree = this.createLowPolyTree(tc.type, tc.scale);
            tree.position.copy(tc.pos);
            this.scene.add(tree);
        });

        // 4. Low-Poly Boulders & Rocks (voxelRock2 Wallpaper Style)
        const rockConfigs = [
            // Spawn Island boulders
            { pos: new THREE.Vector3(-3.2, 4.0, 2.2), scale: new THREE.Vector3(0.7, 0.5, 0.6), color: 0x94A3B8 },
            { pos: new THREE.Vector3(4.2, 4.0, 1.8), scale: new THREE.Vector3(0.9, 0.6, 0.7), color: 0x64748B },
            { pos: new THREE.Vector3(-4.0, 4.0, -2.8), scale: new THREE.Vector3(0.8, 0.5, 0.8), color: 0x475569 },
            { pos: new THREE.Vector3(3.5, 4.0, -4.5), scale: new THREE.Vector3(0.6, 0.4, 0.5), color: 0x94A3B8 },

            // Azure Terrace boulders (accompanying hazard spikes)
            { pos: new THREE.Vector3(13.8, 5.1, -15.5), scale: new THREE.Vector3(0.8, 0.5, 0.7), color: 0x64748B },
            { pos: new THREE.Vector3(11.5, 5.1, -14.0), scale: new THREE.Vector3(0.7, 0.5, 0.6), color: 0x475569 },

            // Amethyst Pinnacle boulders
            { pos: new THREE.Vector3(-13.8, 6.7, -27.0), scale: new THREE.Vector3(0.8, 0.6, 0.7), color: 0x64748B },
            { pos: new THREE.Vector3(-11.5, 6.7, -25.5), scale: new THREE.Vector3(0.6, 0.4, 0.5), color: 0x94A3B8 },

            // Golden Citadel boulders
            { pos: new THREE.Vector3(-4.0, 8.5, -39.0), scale: new THREE.Vector3(1.0, 0.7, 0.8), color: 0x64748B },
            { pos: new THREE.Vector3(4.0, 8.5, -39.0), scale: new THREE.Vector3(1.0, 0.7, 0.8), color: 0x64748B },
            { pos: new THREE.Vector3(0, 8.5, -46.5), scale: new THREE.Vector3(1.2, 0.8, 0.9), color: 0x475569 },
        ];

        rockConfigs.forEach(rc => {
            const rock = this.createLowPolyRock(rc.scale, rc.color);
            rock.position.copy(rc.pos);
            this.scene.add(rock);
        });

        // 5. Stylized Dirt/Stone Pathway Tiles Winding Through Islands
        const pathConfigs = [
            // Spawn island pathway
            new THREE.Vector3(0, 3.8, 1.2),
            new THREE.Vector3(0.2, 3.8, 0.0),
            new THREE.Vector3(0.8, 3.8, -1.5),
            new THREE.Vector3(1.6, 3.8, -3.2),
            new THREE.Vector3(2.2, 3.8, -4.6),

            // Azure Terrace pathway
            new THREE.Vector3(9.2, 4.9, -15.2),
            new THREE.Vector3(10.0, 4.9, -16.8),
            new THREE.Vector3(10.0, 4.9, -18.4),

            // Amethyst Pinnacle pathway
            new THREE.Vector3(-9.2, 6.5, -27.2),
            new THREE.Vector3(-10.0, 6.5, -28.8),
            new THREE.Vector3(-9.8, 6.5, -30.4),

            // Golden Citadel grand promenade
            new THREE.Vector3(0, 8.3, -37.5),
            new THREE.Vector3(0, 8.3, -39.2),
            new THREE.Vector3(0, 8.3, -41.0),
        ];

        const pathMat = new THREE.MeshStandardMaterial({
            color: 0xE2E8F0, // Warm cobblestone / sandstone
            roughness: 0.8,
            metalness: 0.1,
            flatShading: true
        });

        pathConfigs.forEach(p => {
            const stepGeo = new THREE.CylinderGeometry(0.55, 0.65, 0.08, 7);
            const step = new THREE.Mesh(stepGeo, pathMat);
            step.position.copy(p);
            step.rotation.y = Math.random() * Math.PI;
            step.receiveShadow = true;
            this.scene.add(step);
        });

        // 6. Vibrant Flower Patches on Grass
        const flowerConfigs = [
            new THREE.Vector3(-1.8, 3.8, 2.0),
            new THREE.Vector3(2.2, 3.8, 1.5),
            new THREE.Vector3(-3.2, 3.8, 0.0),
            new THREE.Vector3(12.0, 4.9, -18.0),
            new THREE.Vector3(-12.0, 6.5, -30.0),
            new THREE.Vector3(-2.5, 8.3, -39.0),
            new THREE.Vector3(2.5, 8.3, -39.0),
        ];

        flowerConfigs.forEach(fp => {
            const patch = this.createFlowerPatch();
            patch.position.copy(fp);
            this.scene.add(patch);
        });

        // 7. Distant Horizon Mountain Ranges Ringing the World (Wallpaper Horizon)
        const mountainConfigs = [
            { pos: new THREE.Vector3(0, -10, -95), r: 35, h: 42, color: 0x334155, snow: true },
            { pos: new THREE.Vector3(-55, -12, -85), r: 30, h: 36, color: 0x1E293B, snow: true },
            { pos: new THREE.Vector3(55, -12, -85), r: 32, h: 38, color: 0x334155, snow: true },
            { pos: new THREE.Vector3(-90, -14, -45), r: 28, h: 34, color: 0x166534, snow: false },
            { pos: new THREE.Vector3(90, -14, -45), r: 30, h: 35, color: 0x15803D, snow: false },
            { pos: new THREE.Vector3(-85, -15, 10), r: 26, h: 30, color: 0x166534, snow: false },
            { pos: new THREE.Vector3(85, -15, 10), r: 26, h: 30, color: 0x15803D, snow: false },
            { pos: new THREE.Vector3(0, -15, 80), r: 32, h: 36, color: 0x475569, snow: true },
            { pos: new THREE.Vector3(-55, -15, 65), r: 28, h: 32, color: 0x334155, snow: false },
            { pos: new THREE.Vector3(55, -15, 65), r: 28, h: 32, color: 0x334155, snow: false },
        ];

        mountainConfigs.forEach(mc => {
            const mountain = this.createDistantMountain(mc.r, mc.h, mc.color, mc.snow);
            mountain.position.copy(mc.pos);
            this.scene.add(mountain);
        });

        // 8. Stylized Low-Poly Fluffy Clouds in the Azure Sky
        const cloudPositions = [
            new THREE.Vector3(-18, 22, -15),
            new THREE.Vector3(20, 24, -28),
            new THREE.Vector3(-22, 26, -45),
            new THREE.Vector3(18, 23, -55),
            new THREE.Vector3(0, 28, -35),
            new THREE.Vector3(-30, 20, 10),
            new THREE.Vector3(30, 21, 15),
        ];

        cloudPositions.forEach(cPos => {
            const cloudGroup = new THREE.Group();
            cloudGroup.position.copy(cPos);

            const cloudMat = new THREE.MeshStandardMaterial({
                color: 0xFFFFFF,
                roughness: 0.35,
                metalness: 0.0,
                flatShading: true
            });

            // Cluster of low-poly icosahedron spheres
            const puffs = [
                { r: 2.8, x: 0, y: 0, z: 0 },
                { r: 2.0, x: 2.2, y: -0.2, z: 0.4 },
                { r: 2.1, x: -2.1, y: -0.1, z: -0.3 },
                { r: 1.8, x: 0.3, y: 1.1, z: -0.5 },
                { r: 1.5, x: 1.4, y: 0.9, z: 0.2 },
            ];

            puffs.forEach(p => {
                const geo = new THREE.IcosahedronGeometry(p.r, 1);
                const puff = new THREE.Mesh(geo, cloudMat);
                puff.position.set(p.x, p.y, p.z);
                cloudGroup.add(puff);
            });

            this.scene.add(cloudGroup);
        });
    }

    private createLowPolyTree(type: 'pine' | 'round', scale: number = 1.0): THREE.Group {
        const treeGroup = new THREE.Group();

        // Wooden Trunk
        const trunkGeo = new THREE.CylinderGeometry(0.12 * scale, 0.2 * scale, 1.2 * scale, 6);
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x78350F, // Warm bark brown
            roughness: 0.9,
            flatShading: true
        });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 0.6 * scale;
        trunk.castShadow = true;
        treeGroup.add(trunk);

        if (type === 'pine') {
            // 3 Stacked Cones in Pine Greens
            const cones = [
                { r: 0.95 * scale, h: 1.2 * scale, y: 1.1 * scale, color: 0x15803D },
                { r: 0.75 * scale, h: 1.0 * scale, y: 1.7 * scale, color: 0x16A34A },
                { r: 0.52 * scale, h: 0.85 * scale, y: 2.2 * scale, color: 0x22C55E },
            ];
            cones.forEach(c => {
                const coneGeo = new THREE.ConeGeometry(c.r, c.h, 5);
                const coneMat = new THREE.MeshStandardMaterial({
                    color: c.color,
                    roughness: 0.6,
                    flatShading: true
                });
                const cone = new THREE.Mesh(coneGeo, coneMat);
                cone.position.y = c.y;
                cone.castShadow = true;
                treeGroup.add(cone);
            });
        } else {
            // Round Faceted Foliage Canopy
            const leafGeo = new THREE.DodecahedronGeometry(0.9 * scale, 0);
            const leafMat = new THREE.MeshStandardMaterial({
                color: 0x22C55E, // Lush meadow green
                roughness: 0.5,
                flatShading: true
            });
            const foliage = new THREE.Mesh(leafGeo, leafMat);
            foliage.position.y = 1.5 * scale;
            foliage.castShadow = true;
            treeGroup.add(foliage);

            // Secondary accent foliage puff
            const leafGeo2 = new THREE.DodecahedronGeometry(0.65 * scale, 0);
            const leafMat2 = new THREE.MeshStandardMaterial({
                color: 0x4ADE80, // Lime accent
                roughness: 0.5,
                flatShading: true
            });
            const foliage2 = new THREE.Mesh(leafGeo2, leafMat2);
            foliage2.position.set(0.25 * scale, 1.85 * scale, 0.15 * scale);
            foliage2.castShadow = true;
            treeGroup.add(foliage2);
        }

        return treeGroup;
    }

    private createLowPolyRock(scale: THREE.Vector3, color: number = 0x64748B): THREE.Mesh {
        const rockGeo = new THREE.DodecahedronGeometry(1.0, 0);
        const rockMat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.85,
            metalness: 0.15,
            flatShading: true
        });
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.scale.copy(scale);
        rock.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
        rock.castShadow = true;
        rock.receiveShadow = true;
        return rock;
    }

    private createFlowerPatch(): THREE.Group {
        const group = new THREE.Group();
        const colors = [0xFACC15, 0xEF4444, 0xF97316, 0x38BDF8, 0xA855F7];

        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const dist = 0.2 + Math.random() * 0.4;
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;

            // Green stem
            const stemGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.15, 4);
            const stemMat = new THREE.MeshBasicMaterial({ color: 0x16A34A });
            const stem = new THREE.Mesh(stemGeo, stemMat);
            stem.position.set(x, 0.075, z);
            group.add(stem);

            // Flower blossom
            const petalGeo = new THREE.OctahedronGeometry(0.06, 0);
            const petalMat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length] });
            const petal = new THREE.Mesh(petalGeo, petalMat);
            petal.position.set(x, 0.15, z);
            group.add(petal);
        }

        return group;
    }

    private createDistantMountain(radius: number, height: number, color: number, snow: boolean): THREE.Group {
        const group = new THREE.Group();

        // Main mountain cone
        const mountainGeo = new THREE.ConeGeometry(radius, height, 7);
        const mountainMat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.9,
            metalness: 0.1,
            flatShading: true
        });
        const mountain = new THREE.Mesh(mountainGeo, mountainMat);
        mountain.position.y = height * 0.5;
        group.add(mountain);

        // Snow-capped peak
        if (snow) {
            const snowGeo = new THREE.ConeGeometry(radius * 0.38, height * 0.38, 7);
            const snowMat = new THREE.MeshStandardMaterial({
                color: 0xF8FAFC, // Snow white
                roughness: 0.4,
                flatShading: true
            });
            const snowPeak = new THREE.Mesh(snowGeo, snowMat);
            snowPeak.position.y = height * 0.81;
            group.add(snowPeak);
        }

        return group;
    }

    /**
     * Builds the 5 Golden Rings, 4 Trampolines, Grounded Faceted Crystal Spikes, and Cyan-Magenta Exit Portal
     * Elevated to match the floating islands above the water
     */
    private buildObstacleCourse(): void {
        console.log('🔴 Building Bounce 3D Course elevated on floating islands...');

        // 1. Five Golden Hoops spatially separated across the course matching launch trajectories & bridges
        const hoopPositions = [
            new THREE.Vector3(0, 4.8, -4.2),        // Hoop 1: foreground center on spawn island path
            new THREE.Vector3(7.5, 9.8, -12.0),     // Hoop 2: exact parabolic apex of Trampoline 2 launch to Azure Terrace
            new THREE.Vector3(10.5, 6.4, -17.0),    // Hoop 3: soaring over Azure Terrace center
            new THREE.Vector3(-1.75, 12.2, -24.8),  // Hoop 4: soaring arc of Trampoline 3 / above Bridge 2
            new THREE.Vector3(0, 9.8, -38.5),       // Hoop 5: gateway arch before ancient Citadel stairs
        ];

        hoopPositions.forEach((pos, idx) => {
            // Faceted diamond-cut polygonal gold rings matching reference artwork
            const torusGeo = new THREE.TorusGeometry(1.4, 0.22, 6, 16);
            const torusMat = new THREE.MeshStandardMaterial({
                color: 0xFBBF24, // Gleaming gold
                metalness: 0.9,
                roughness: 0.16,
                flatShading: true, // Diamond-cut polygonal gold facets!
                emissive: 0xB45309,
                emissiveIntensity: 0.65
            });

            const ringMesh = new THREE.Mesh(torusGeo, torusMat);
            ringMesh.position.copy(pos);
            ringMesh.name = `GoldenHoop_${idx}`;

            // Add shimmering point light
            const ringLight = new THREE.PointLight(0xFBBF24, 2.0, 7);
            ringLight.position.copy(pos);

            this.scene.add(ringMesh);
            this.scene.add(ringLight);

            this.rings.push({ mesh: ringMesh, collected: false, light: ringLight });
        });

        // 2. Coiled Steel Spring Trampolines with Beveled Yellow Collar & Dark Rubber Pad (Reference Artwork)
        const trampolineConfigs = [
            { pos: new THREE.Vector3(-2.4, 4.0, -1.8), launch: new THREE.Vector3(0, 21.0, 0), isVertical: true },     // Trampoline 1: Foreground vertical super leap
            { pos: new THREE.Vector3(2.5, 4.0, -5.5), launch: new THREE.Vector3(8.5, 20.0, -11.0), isVertical: false }, // Trampoline 2: Launch to Azure Terrace through Hoop 2
            { pos: new THREE.Vector3(9.5, 5.1, -19.5), launch: new THREE.Vector3(-16.0, 22.0, -8.0), isVertical: false }, // Trampoline 3: Launch to Amethyst Pinnacle through Hoop 4
            { pos: new THREE.Vector3(-9.5, 6.7, -31.5), launch: new THREE.Vector3(8.5, 21.0, -9.5), isVertical: false },  // Trampoline 4: Launch to Golden Citadel
        ];

        trampolineConfigs.forEach((cfg) => {
            this.spawnTrampoline(cfg.pos, cfg.launch, cfg.isVertical);
        });

        // 3. Red Geometric Crystal Spikes (Faceted Ruby Octahedrons with Bedrock Socket)
        const spikePositions = [
            new THREE.Vector3(2.4, 4.0, -1.8),   // Spikes 1: foreground right on Spawn Island (surface = 4.0)
            new THREE.Vector3(10.5, 5.1, -14.5), // Spikes 2: Azure Terrace perimeter hazard (surface = 5.1)
            new THREE.Vector3(-10.5, 6.7, -26.5),// Spikes 3: Amethyst Pinnacle perimeter hazard (surface = 6.7)
        ];

        spikePositions.forEach((pos) => {
            this.spawnSpikeCluster(pos);
        });

        // 4. Ancient Faceted Stone Archway Portal with Twin Purple Brazier Pillars & Stone Steps (Reference Artwork)
        const portalGroup = new THREE.Group();
        portalGroup.position.set(0, 11.2, -42.0);

        // Ancient Faceted Stone Block Arch
        const stoneArchGeo = new THREE.TorusGeometry(4.6, 0.65, 6, 16);
        const stoneArchMat = new THREE.MeshStandardMaterial({
            color: 0x94A3B8, // Ancient slate stone
            roughness: 0.85,
            metalness: 0.15,
            flatShading: true
        });
        const stoneArch = new THREE.Mesh(stoneArchGeo, stoneArchMat);
        stoneArch.castShadow = true;
        portalGroup.add(stoneArch);

        // Stone pillar vertical foundation columns
        const pillarGeo = new THREE.CylinderGeometry(0.85, 1.1, 4.8, 6);
        [-4.2, 4.2].forEach(px => {
            const pillar = new THREE.Mesh(pillarGeo, stoneArchMat);
            pillar.position.set(px, -2.4, 0);
            pillar.castShadow = true;
            portalGroup.add(pillar);
        });

        // Twin Ceremonial Stone Brazier Pillars with Mystical Purple Flame Lanterns (Reference Artwork)
        const brazierPedestalGeo = new THREE.CylinderGeometry(0.55, 0.75, 2.6, 6);
        const brazierBowlGeo = new THREE.CylinderGeometry(0.85, 0.5, 0.65, 6);
        const brazierFlameGeo = new THREE.OctahedronGeometry(0.48, 0);
        const brazierFlameMat = new THREE.MeshStandardMaterial({
            color: 0xC084FC, // Mystical violet crystal flame
            metalness: 0.2,
            roughness: 0.1,
            flatShading: true,
            emissive: 0x9333EA,
            emissiveIntensity: 2.2
        });

        [-6.4, 6.4].forEach(bx => {
            const brazierGroup = new THREE.Group();
            brazierGroup.position.set(bx, -2.2, 0.6);

            const pedestal = new THREE.Mesh(brazierPedestalGeo, stoneArchMat);
            pedestal.position.y = 1.3;
            brazierGroup.add(pedestal);

            const bowl = new THREE.Mesh(brazierBowlGeo, stoneArchMat);
            bowl.position.y = 2.8;
            brazierGroup.add(bowl);

            const flame = new THREE.Mesh(brazierFlameGeo, brazierFlameMat);
            flame.position.y = 3.35;
            brazierGroup.add(flame);

            const brazierLight = new THREE.PointLight(0xA855F7, 3.5, 9);
            brazierLight.position.y = 3.5;
            brazierGroup.add(brazierLight);

            portalGroup.add(brazierGroup);
        });

        // Stone Staircase leading from Citadel path up to Portal Threshold
        const stepMat = new THREE.MeshStandardMaterial({
            color: 0x64748B,
            roughness: 0.85,
            metalness: 0.15,
            flatShading: true
        });
        [
            { y: -2.8, z: 2.4, w: 4.8, h: 0.35, d: 0.9 },
            { y: -2.45, z: 1.5, w: 4.5, h: 0.35, d: 0.9 },
            { y: -2.1, z: 0.6, w: 4.2, h: 0.35, d: 0.9 },
        ].forEach(st => {
            const stepGeo = new THREE.BoxGeometry(st.w, st.h, st.d);
            const stepMesh = new THREE.Mesh(stepGeo, stepMat);
            stepMesh.position.set(0, st.y, st.z);
            stepMesh.receiveShadow = true;
            portalGroup.add(stepMesh);
        });

        // Concentric Swirling Vortex Disk 1: Outer Electric Cyan Spiral
        const outerVortexGeo = new THREE.RingGeometry(2.3, 4.1, 32);
        const outerVortexMat = new THREE.MeshBasicMaterial({
            color: 0x06B6D4, // Electric Cyan
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9
        });
        const outerVortex = new THREE.Mesh(outerVortexGeo, outerVortexMat);
        outerVortex.name = 'portal_energy_disk';
        portalGroup.add(outerVortex);

        // Concentric Swirling Vortex Disk 2: Vivid Neon Magenta Spiral Core
        const innerVortexGeo = new THREE.CircleGeometry(2.4, 32);
        const innerVortexMat = new THREE.MeshBasicMaterial({
            color: 0xFF00FF, // Pure Neon Magenta
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.95
        });
        const innerVortex = new THREE.Mesh(innerVortexGeo, innerVortexMat);
        innerVortex.position.z = 0.05;
        portalGroup.add(innerVortex);

        // Floating Brilliant Golden Star at Portal Crest
        const starGeo = new THREE.OctahedronGeometry(1.2, 0);
        const starMat = new THREE.MeshStandardMaterial({
            color: 0xFBBF24,
            metalness: 0.9,
            roughness: 0.1,
            flatShading: true,
            emissive: 0xF59E0B,
            emissiveIntensity: 1.0
        });
        const starMesh = new THREE.Mesh(starGeo, starMat);
        starMesh.position.set(0, 5.5, 0);
        portalGroup.add(starMesh);

        // 60-meter Celestial Cyan Sky Beacon shooting straight into the clouds!
        const beaconGeo = new THREE.CylinderGeometry(0.8, 0.8, 60, 16);
        const beaconMat = new THREE.MeshBasicMaterial({
            color: 0x00FFFF,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.set(0, 30, 0);
        portalGroup.add(beacon);

        const portalLight = new THREE.PointLight(0x00FFFF, 6.0, 30);
        portalGroup.add(portalLight);

        this.scene.add(portalGroup);
        this.exitPortal = { group: portalGroup, unlocked: false, light: portalLight };
    }

    private spawnTrampoline(pos: THREE.Vector3, launch: THREE.Vector3, isVertical: boolean): void {
        const trampGroup = new THREE.Group();
        trampGroup.position.copy(pos);

        // Sturdy faceted dark steel base plate
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, metalness: 0.85, roughness: 0.3, flatShading: true });
        const basePlateGeo = new THREE.CylinderGeometry(1.2, 1.35, 0.15, 12);
        const basePlate = new THREE.Mesh(basePlateGeo, baseMat);
        basePlate.position.y = 0.08;
        trampGroup.add(basePlate);

        // Heavy coiled steel industrial compression spring column
        const springGroup = new THREE.Group();
        const coilMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.92, roughness: 0.18, flatShading: true });
        [0.18, 0.32, 0.46, 0.60].forEach(cy => {
            const coil = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.11, 8, 20), coilMat);
            coil.rotation.x = Math.PI / 2;
            coil.position.y = cy;
            springGroup.add(coil);
        });
        trampGroup.add(springGroup);

        // Faceted beveled sunflower-yellow rim collar (Reference Artwork)
        const collarGeo = new THREE.CylinderGeometry(1.48, 1.32, 0.34, 14);
        const collarMat = new THREE.MeshStandardMaterial({
            color: 0xFACC15, // Bright sun yellow
            roughness: 0.22,
            metalness: 0.18,
            flatShading: true,
            emissive: 0x854D0E,
            emissiveIntensity: 0.45
        });
        const collarMesh = new THREE.Mesh(collarGeo, collarMat);
        collarMesh.position.y = 0.72;
        collarMesh.castShadow = true;
        trampGroup.add(collarMesh);

        // Dark recessed rubber trampoline bounce pad
        const padGeo = new THREE.CylinderGeometry(1.26, 1.26, 0.12, 20);
        const padMat = new THREE.MeshStandardMaterial({
            color: 0x0F172A, // Dark graphite rubber
            roughness: 0.75,
            metalness: 0.1,
            flatShading: true
        });
        const padMesh = new THREE.Mesh(padGeo, padMat);
        padMesh.position.y = 0.82;
        padMesh.castShadow = true;
        trampGroup.add(padMesh);

        // Bold yellow bullseye ring
        const bullseyeGeo = new THREE.RingGeometry(0.55, 0.88, 20);
        const bullseyeMat = new THREE.MeshBasicMaterial({ color: 0xFACC15, side: THREE.DoubleSide });
        const bullseye = new THREE.Mesh(bullseyeGeo, bullseyeMat);
        bullseye.rotation.x = -Math.PI / 2;
        bullseye.position.y = 0.89;
        trampGroup.add(bullseye);

        // Red center target star
        const starGeo = new THREE.CircleGeometry(0.32, 16);
        const starMat = new THREE.MeshBasicMaterial({ color: 0xEF4444, side: THREE.DoubleSide });
        const star = new THREE.Mesh(starGeo, starMat);
        star.rotation.x = -Math.PI / 2;
        star.position.y = 0.90;
        trampGroup.add(star);

        // Upward bounce chevrons (^ ^ ^) in bright white
        const chevronMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide });
        [-0.2, 0.0, 0.2].forEach((cz) => {
            const arm1 = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.06), chevronMat);
            arm1.rotation.x = -Math.PI / 2;
            arm1.rotation.z = Math.PI / 4;
            arm1.position.set(-0.07, 0.91, cz);
            trampGroup.add(arm1);

            const arm2 = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.06), chevronMat);
            arm2.rotation.x = -Math.PI / 2;
            arm2.rotation.z = -Math.PI / 4;
            arm2.position.set(0.07, 0.91, cz);
            trampGroup.add(arm2);
        });

        this.scene.add(trampGroup);
        this.trampolines.push({
            mesh: trampGroup,
            basePosition: pos.clone(),
            springMesh: springGroup,
            cooldown: 0,
            launch,
            isVertical,
            hasAwardedScore: false
        });
    }

    private spawnSpikeCluster(pos: THREE.Vector3): void {
        const spikeGroup = new THREE.Group();
        spikeGroup.position.copy(pos);

        // Dark bedrock crystal socket embedded flush into platform
        const socketGeo = new THREE.CylinderGeometry(1.2, 1.3, 0.16, 12);
        const socketMat = new THREE.MeshStandardMaterial({
            color: 0x1E293B, // Dark slate bedrock
            roughness: 0.85,
            metalness: 0.3,
            flatShading: true
        });
        const socketMesh = new THREE.Mesh(socketGeo, socketMat);
        socketMesh.position.y = 0.05;
        socketMesh.receiveShadow = true;
        spikeGroup.add(socketMesh);

        // Jagged faceted red geometric crystal shards
        const crystalConfigs = [
            { x: 0, z: 0, sx: 0.85, sy: 3.2, sz: 0.85, y: 0.9, rx: 0.05, rz: -0.05 },
            { x: -0.42, z: -0.32, sx: 0.65, sy: 2.5, sz: 0.65, y: 0.7, rx: -0.2, rz: 0.15 },
            { x: 0.42, z: -0.32, sx: 0.7, sy: 2.6, sz: 0.7, y: 0.75, rx: -0.15, rz: -0.2 },
            { x: -0.32, z: 0.42, sx: 0.6, sy: 2.0, sz: 0.6, y: 0.6, rx: 0.2, rz: 0.12 },
            { x: 0.35, z: 0.38, sx: 0.62, sy: 2.2, sz: 0.62, y: 0.65, rx: 0.18, rz: -0.15 },
        ];

        const crystalMat = new THREE.MeshStandardMaterial({
            color: 0xDC2626,
            roughness: 0.08,
            metalness: 0.4,
            emissive: 0x991B1B,
            emissiveIntensity: 0.7,
            flatShading: true
        });

        crystalConfigs.forEach(cc => {
            const octGeo = new THREE.OctahedronGeometry(0.35, 0);
            const shard = new THREE.Mesh(octGeo, crystalMat);
            shard.scale.set(cc.sx, cc.sy, cc.sz);
            shard.position.set(cc.x, cc.y, cc.z);
            shard.rotation.x = cc.rx;
            shard.rotation.z = cc.rz;
            shard.castShadow = true;
            spikeGroup.add(shard);
        });

        this.scene.add(spikeGroup);
        this.spikes.push({ mesh: spikeGroup, position: pos.clone() });
    }

    /** Wire the gameplay layer to the world-forger's authored route. */
    private buildForgedCourse(): void {
        const gameData = this.engine?.getGameData?.();
        const route = forgedPathFeature(gameData);
        let routePoints = route?.points ?? [];

        // Guaranteed fallback route coordinates if features array was omitted
        if (routePoints.length === 0) {
            routePoints = [
                { x: 50.0, y: 66.5, z: 50.0 },
                { x: 82.2, y: 3.0, z: 81.4 },
                { x: 115.4, y: 58.3, z: 64.4 },
                { x: 136.6, y: 67.3, z: 88.2 },
                { x: 172.1, y: 12.1, z: 117.0 },
                { x: 203.4, y: 70.0, z: 144.5 },
                { x: 182.8, y: 75.0, z: 147.8 },
                { x: 134.8, y: 63.0, z: 172.6 },
                { x: 138.4, y: 64.4, z: 220.9 },
                { x: 109.2, y: 75.3, z: 226.9 },
                { x: 156.2, y: 3.0, z: 214.1 },
                { x: 194.0, y: 36.3, z: 217.4 },
                { x: 208.3, y: 76.0, z: 245.6 },
                { x: 239.6, y: 3.1, z: 275.3 },
                { x: 278.2, y: 75.8, z: 264.0 },
                { x: 272.4, y: 83.9, z: 283.2 }
            ];
        }

        // 1. Build 12 Golden Hoops along the full 1,079m continuous trail
        const totalHoops = 12;
        this.rings = [];
        for (let i = 1; i <= totalHoops; i++) {
            const frac = i / (totalHoops + 0.5);
            const idx = Math.min(routePoints.length - 1, Math.max(1, Math.floor(frac * routePoints.length)));
            const pt = routePoints[idx]!;
            const prevPt = routePoints[Math.max(0, idx - 1)]!;
            const nextPt = routePoints[Math.min(routePoints.length - 1, idx + 1)]!;

            const ringPos = new THREE.Vector3(pt.x, pt.y + 1.8, pt.z);
            const dir = new THREE.Vector3(nextPt.x - prevPt.x, 0, nextPt.z - prevPt.z).normalize();
            if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);

            const ringMesh = new THREE.Mesh(
                new THREE.TorusGeometry(1.4, 0.22, 8, 24),
                new THREE.MeshStandardMaterial({
                    color: 0xFBBF24,
                    metalness: 0.92,
                    roughness: 0.16,
                    flatShading: true,
                    emissive: 0xB45309,
                    emissiveIntensity: 0.75
                })
            );
            ringMesh.position.copy(ringPos);
            ringMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
            ringMesh.name = `ForgedGoldenHoop_${i}`;

            const ringLight = new THREE.PointLight(0xFBBF24, 2.5, 9);
            ringLight.position.copy(ringPos);
            this.scene.add(ringMesh, ringLight);
            this.rings.push({ mesh: ringMesh, collected: false, light: ringLight });
        }
        this.totalRings = this.rings.length;

        // 2. Build 4 Spring Trampolines across key elevation jumps
        const trampConfigs = [
            { pos: new THREE.Vector3(82.0, 3.0, 78.0), launch: new THREE.Vector3(14.0, 36.0, -8.0), isVertical: false },
            { pos: new THREE.Vector3(165.0, 12.0, 115.0), launch: new THREE.Vector3(16.0, 38.0, 16.0), isVertical: false },
            { pos: new THREE.Vector3(148.0, 8.0, 212.0), launch: new THREE.Vector3(18.0, 39.0, 12.0), isVertical: false },
            { pos: new THREE.Vector3(236.0, 3.5, 272.0), launch: new THREE.Vector3(16.0, 42.0, 5.0), isVertical: false },
        ];
        trampConfigs.forEach(cfg => {
            this.spawnTrampoline(cfg.pos, cfg.launch, cfg.isVertical);
        });

        // 3. Build Ruby Crystal Spike Hazards guarding treacherous turns
        const hazardConfigs = [
            new THREE.Vector3(124.0, 68.0, 86.0),
            new THREE.Vector3(142.0, 64.0, 178.0),
            new THREE.Vector3(204.0, 77.0, 244.0),
        ];
        hazardConfigs.forEach(pos => {
            this.spawnSpikeCluster(pos);
        });

        // 4. Build Checkpoints with glowing cyan rings & vertical light beacons
        this.forgedCheckpoints = [
            new THREE.Vector3(185.0, 75.0, 145.0), // Checkpoint 1: Terrace Isle
            new THREE.Vector3(200.0, 81.0, 240.0), // Checkpoint 2: Crystal Ridge
        ];
        this.forgedCheckpoints.forEach((cpPos) => {
            const cpGroup = new THREE.Group();
            cpGroup.position.copy(cpPos);

            const ringGeo = new THREE.RingGeometry(2.0, 2.5, 24);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x38BDF8, side: THREE.DoubleSide });
            const groundRing = new THREE.Mesh(ringGeo, ringMat);
            groundRing.rotation.x = -Math.PI / 2;
            groundRing.position.y = 0.05;
            cpGroup.add(groundRing);

            const beaconLight = new THREE.PointLight(0x38BDF8, 3.0, 15);
            beaconLight.position.y = 2.0;
            cpGroup.add(beaconLight);

            this.scene.add(cpGroup);
        });

        // 5. Build Summit Sky Portal
        const portalPos = new THREE.Vector3(272.0, 84.0, 284.0);
        const portalGroup = new THREE.Group();
        portalGroup.name = 'ForgedPortalGoalTrigger';
        portalGroup.position.copy(portalPos);

        const archGeo = new THREE.TorusGeometry(3.5, 0.45, 12, 28, Math.PI);
        const archMat = new THREE.MeshStandardMaterial({
            color: 0x1E293B,
            metalness: 0.8,
            roughness: 0.35,
            flatShading: true
        });
        const archMesh = new THREE.Mesh(archGeo, archMat);
        archMesh.rotation.z = 0;
        archMesh.position.y = 0;
        portalGroup.add(archMesh);

        const diskGeo = new THREE.CircleGeometry(2.8, 32);
        const diskMat = new THREE.MeshBasicMaterial({
            color: 0xEF4444, // Locked red until all 12 hoops are collected
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.75
        });
        const diskMesh = new THREE.Mesh(diskGeo, diskMat);
        diskMesh.name = 'portal_energy_disk';
        portalGroup.add(diskMesh);

        const portalLight = new THREE.PointLight(0xEF4444, 4.0, 30);
        portalGroup.add(portalLight);
        this.scene.add(portalGroup);
        this.exitPortal = { group: portalGroup, unlocked: false, light: portalLight };

        this.forgedFallY = -15.0; // Abyss below lowest island
        this.updateRingsDisplay();
        console.log(`🔴 Forged course ready: ${this.totalRings} hoops, ${this.trampolines.length} trampolines, ${this.spikes.length} hazards, ${this.forgedCheckpoints.length} checkpoints!`);
    }

    public update(deltaTime: number): void {
        if (!this.player) return;

        // `retry` is declared by VoxelGame, so R and the mobile RETRY button
        // trigger the same one-frame action with guaranteed platform parity.
        if (this.playerController?.keys?.retry) {
            this.playerController.keys.retry = false;
            this.restartRun();
            return;
        }

        if (!this.isWon) {
            this.gameTime += deltaTime;
            this.updateTimerDisplay();
        }

        const playerPos = this.getBallPosition();

        // Calculate ground elevation beneath the player (actual top grass surface of islands & bridges)
        let groundY = 0.5; // Water base
        if (this.playerController?.isGrounded && typeof this.playerController.getGroundPosition === 'function') {
            const gp = this.playerController.getGroundPosition();
            groundY = gp.y;
        } else {
            // Continuous ground surface query based on islands & bridges
            if (Math.hypot(playerPos.x - 0, playerPos.z - (-1.0)) < 7.0) groundY = 4.0;
            else if (Math.hypot(playerPos.x - 10.5, playerPos.z - (-17.0)) < 5.8) groundY = 5.1;
            else if (Math.hypot(playerPos.x - (-10.5), playerPos.z - (-29.0)) < 5.8) groundY = 6.7;
            else if (Math.hypot(playerPos.x - 0, playerPos.z - (-42.0)) < 8.0) groundY = 8.5;
            // Bridge 1 (z between -6.0 and -14.5)
            else if (playerPos.z >= -15.0 && playerPos.z <= -6.0 && playerPos.x >= 0.5 && playerPos.x <= 10.5) {
                const t = Math.max(0, Math.min(1, (playerPos.z - (-6.0)) / (-14.5 - (-6.0))));
                groundY = 4.0 + (5.1 - 4.0) * t;
            }
            // Bridge 2 (z between -20.5 and -27.5)
            else if (playerPos.z >= -28.0 && playerPos.z <= -20.5 && playerPos.x >= -8.0 && playerPos.x <= 8.5) {
                const t = Math.max(0, Math.min(1, (playerPos.z - (-20.5)) / (-27.5 - (-20.5))));
                groundY = 5.1 + (6.7 - 5.1) * t;
            }
            // Bridge 3 (z between -32.5 and -40.5)
            else if (playerPos.z >= -41.0 && playerPos.z <= -32.5 && playerPos.x >= -8.0 && playerPos.x <= 1.0) {
                const t = Math.max(0, Math.min(1, (playerPos.z - (-32.5)) / (-40.5 - (-32.5))));
                groundY = 6.7 + (8.5 - 6.7) * t;
            }
        }

        // Dynamic Drop Shadow Projection right on top of the grass surface
        if (this.shadowMesh) {
            this.shadowMesh.position.set(playerPos.x, groundY + 0.02, playerPos.z);
            const ballBottom = playerPos.y - this.ballRadius;
            const heightAboveGround = Math.max(0, ballBottom - groundY);
            if (heightAboveGround < 3.5) {
                this.shadowMesh.visible = true;
                const shadowScale = Math.max(0.35, 1.0 - heightAboveGround * 0.12);
                this.shadowMesh.scale.set(shadowScale, shadowScale, shadowScale);
                (this.shadowMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.52 - heightAboveGround * 0.12);
            } else {
                this.shadowMesh.visible = false;
            }
        }

        // 0. Update Red Ball Visual: Sync position, true 3D rolling rotation, squish/stretch, and idle breathing
        if (this.ballVisual) {
            // Anchor ball bottom firmly to the ground surface even during squash & stretch
            const squashGroundAnchor = this.ballRadius * (1.0 - this.ballScale.y);
            this.ballVisual.position.copy(playerPos);
            this.ballVisual.position.y -= squashGroundAnchor;

            if (this.ballInnerMesh && this.lastPlayerPos) {
                const dx = playerPos.x - this.lastPlayerPos.x;
                const dz = playerPos.z - this.lastPlayerPos.z;
                const moveDist = Math.hypot(dx, dz);
                if (moveDist > 0.0008) {
                    // Physical rolling axis perpendicular to displacement
                    const rollAxis = new THREE.Vector3(-dz, 0, dx).normalize();
                    const rollAngle = moveDist / this.ballRadius;
                    const deltaQuat = new THREE.Quaternion().setFromAxisAngle(rollAxis, rollAngle);
                    this.ballInnerMesh.quaternion.premultiply(deltaQuat);
                }
            }
            this.lastPlayerPos.copy(playerPos);

            // Dynamic squash, stretch, and landing impact physics
            if (this.playerController?.playerBody && this.ballInnerMesh) {
                const body = this.playerController.playerBody;
                if (typeof body.linvel === 'function') {
                    const linvel = body.linvel();
                    const vy = linvel.y;
                    const horizSpeed = Math.hypot(linvel.x, linvel.z);
                    const heightAboveGround = Math.max(0, playerPos.y - groundY);
                    const isGroundedNow = Boolean(this.playerController?.isGrounded) || (heightAboveGround < 0.60);

                    // Safe Landing Touchdown after Trampoline launch
                    if (this.trampolineFlightTimer > 0) {
                        this.trampolineFlightTimer -= deltaTime;
                        if (isGroundedNow && vy <= 0.5 && this.trampolineFlightTimer < 1.4) {
                            if (this.playerController && typeof this.playerController.applyHorizontalDamping === 'function') {
                                this.playerController.applyHorizontalDamping(8.0);
                            }
                            this.trampolineFlightTimer = 0;
                            this.ballScale.set(1.4, 0.55, 1.4); // Satisfying rubber landing compression
                            this.playBounceThud(10.0);
                        }
                    }

                    // Landing impact detection: trigger rubber thud, elastic rebound bounce, and squash wobble
                    if (!this.wasGrounded && isGroundedNow && vy <= -1.8) {
                        const impactSpeed = Math.abs(vy);
                        this.squishWobbleTimer = 0.35;
                        this.playBounceThud(impactSpeed);

                        // Elastic Rubber Ball Restitution: natural rebound bounce ONLY when holding jump
                        const isJumpHeld = Boolean(this.playerController?.keys?.ascend);
                        if (isJumpHeld && impactSpeed > 3.0) {
                            const reboundY = Math.min(13.0, impactSpeed * 0.55);
                            if (this.playerController && typeof this.playerController.applyKnockback === 'function') {
                                this.playerController.applyKnockback(0, 0, reboundY);
                            }
                            this.ballScale.set(1.35, 0.60, 1.35);
                        } else {
                            // Controlled precision landing: solid rubber compression without unwanted bouncing chain
                            this.ballScale.set(1.25, 0.72, 1.25);
                        }
                    }
                    this.wasGrounded = isGroundedNow;

                    // Clamped, framerate-independent exponential smoothing (prevents lerp overshoot on hitch)
                    const smoothDt = Math.min(deltaTime, 0.1);
                    const lerpAir = 1.0 - Math.exp(-12.0 * smoothDt);
                    const lerpIdle = 1.0 - Math.exp(-8.0 * smoothDt);
                    const lerpRoll = 1.0 - Math.exp(-14.0 * smoothDt);

                    // Squash & stretch physics behavior
                    if (this.squishWobbleTimer > 0) {
                        this.squishWobbleTimer -= deltaTime;
                        const progress = Math.max(0, this.squishWobbleTimer / 0.35);
                        const wobble = Math.sin((1.0 - progress) * Math.PI * 4) * progress;
                        this.ballScale.y = 1.0 - wobble * 0.42;
                        this.ballScale.x = 1.0 + wobble * 0.22;
                        this.ballScale.z = 1.0 + wobble * 0.22;
                    } else if (vy > 3.5) {
                        // Rising fast in the air
                        this.targetBallScale.set(0.85, 1.25, 0.85);
                        this.ballScale.lerp(this.targetBallScale, lerpAir);
                    } else if (vy < -4.5) {
                        // Falling fast
                        this.targetBallScale.set(0.9, 1.18, 0.9);
                        this.ballScale.lerp(this.targetBallScale, lerpAir);
                    } else if (horizSpeed < 0.25) {
                        // Idle breathing hover bob (alive character feel)
                        const breath = Math.sin(this.gameTime * 4.0);
                        this.targetBallScale.set(1.0 + breath * 0.03, 1.0 - breath * 0.04, 1.0 + breath * 0.03);
                        this.ballScale.lerp(this.targetBallScale, lerpIdle);
                    } else {
                        // Normal ground rolling
                        this.targetBallScale.set(1.0, 1.0, 1.0);
                        this.ballScale.lerp(this.targetBallScale, lerpRoll);
                    }

                    // Speed sparkle particle trail
                    if (horizSpeed > 4.2 || Math.abs(vy) > 5.5) {
                        this.spawnSpeedSparkle(playerPos);
                    }
                }
                this.ballInnerMesh.scale.copy(this.ballScale);
            }
        }
        this.updateSpeedSparkles(deltaTime);

        // 1. Golden Hoops: rotate & check pass-through
        this.rings.forEach(ring => {
            if (!ring.collected) {
                ring.mesh.rotation.y += deltaTime * 2.2;

                // Check distance (1.85m collection radius)
                if (playerPos.distanceTo(ring.mesh.position) < 1.85) {
                    ring.collected = true;
                    this.ringsCollected++;
                    this.playChime();
                    this.playerController?.triggerHaptic?.([40, 30, 60]);
                    this.addScore(500, '+500 GOLDEN HOOP!');
                    this.updateRingsDisplay();

                    if (ring.light) ring.light.intensity = 4.5;
                    this.animatingRings.push({ mesh: ring.mesh, light: ring.light, elapsed: 0 });

                    // Check if all hoops collected to unlock portal
                    if (this.ringsCollected >= this.totalRings) {
                        this.unlockExitPortal();
                    }
                }
            }
        });

        // Advance ring collect flash/shrink animations cleanly without setInterval
        for (let i = this.animatingRings.length - 1; i >= 0; i--) {
            const anim = this.animatingRings[i];
            if (!anim) continue;
            anim.elapsed += deltaTime;
            if (anim.elapsed >= 0.3) {
                anim.mesh.visible = false;
                if (anim.light) anim.light.intensity = 0;
                this.animatingRings.splice(i, 1);
            } else {
                const scale = Math.max(0, 1.0 - anim.elapsed / 0.3);
                anim.mesh.scale.set(scale, scale, scale);
                if (anim.light) anim.light.intensity = 4.0 * (1.0 - anim.elapsed / 0.3);
            }
        }

        // 2. Yellow Trampolines: downward contact, anti-farming, and trajectory impulse
        this.trampolines.forEach(tramp => {
            if (tramp.cooldown > 0) {
                tramp.cooldown -= deltaTime;
            }

            const horizDist = Math.hypot(playerPos.x - tramp.basePosition.x, playerPos.z - tramp.basePosition.z);
            const vertOffset = playerPos.y - tramp.basePosition.y;

            const body = this.playerController?.playerBody;
            const curVel = body?.linvel ? body.linvel() : { x: 0, y: 0, z: 0 };

            // Pad radius is 1.26m; requires downward landing/contact directly on pad surface
            if (horizDist <= 1.40 && vertOffset >= 0.35 && vertOffset <= 1.6 && curVel.y <= 1.5 && tramp.cooldown <= 0) {
                tramp.cooldown = 0.40;
                this.trampolineFlightTimer = 1.8; // Engage safe landing absorption on touchdown
                this.playBoing();
                this.playerController?.triggerHaptic?.(60);
                this.ballScale.set(1.45, 0.52, 1.45); // Juicy impact squash

                // Anti-farming: award score on initial launch
                if (!tramp.hasAwardedScore) {
                    tramp.hasAwardedScore = true;
                    this.addScore(250, '+250 MEGA BOUNCE!');
                }

                // Compress spring visually
                tramp.springMesh.scale.set(1.3, 0.3, 1.3);
                setTimeout(() => {
                    tramp.springMesh.scale.set(1.0, 1.0, 1.0);
                }, 160);

                // Apply trajectory launch impulse via clean public API
                const targetVx = tramp.isVertical ? 0 : tramp.launch.x;
                const targetVz = tramp.isVertical ? 0 : tramp.launch.z;
                const targetVy = tramp.launch.y;

                if (this.playerController && typeof this.playerController.launch === 'function') {
                    this.playerController.launch({ x: targetVx, y: targetVy, z: targetVz });
                } else if (this.playerController && typeof this.playerController.applyKnockback === 'function') {
                    this.playerController.applyKnockback(targetVx, targetVz, targetVy);
                }
            }
        });

        // 2b. Checkpoints. Forged levels supply multiple terrace locations
        if (this.usesForgedLevel) {
            for (let cpIdx = 0; cpIdx < this.forgedCheckpoints.length; cpIdx++) {
                if (this.checkpointIndex <= cpIdx) {
                    const cp = this.forgedCheckpoints[cpIdx];
                    if (cp && playerPos.distanceTo(cp) < 5.0) {
                        this.checkpointIndex = cpIdx + 1;
                        this.spawnCheckpoint.copy(this.getPhysicsPosition());
                        this.playChime();
                        this.playerController?.triggerHaptic?.(80);
                        this.addScore(1000, `+1,000 CHECKPOINT ${this.checkpointIndex}!`);
                        this.showToast(`🏁 CHECKPOINT ${this.checkpointIndex} REACHED!`, '#38BDF8');
                    }
                }
            }
        } else if (this.checkpointIndex < 1) {
            const distIsland2 = Math.hypot(playerPos.x - 10.5, playerPos.z - (-17.0));
            if (distIsland2 < 4.5 && playerPos.y >= 3.5) {
                this.checkpointIndex = 1;
                this.spawnCheckpoint.set(10.5, 5.6, -17.0);
                this.playChime();
                this.addScore(1000, '+1,000 CHECKPOINT 1!');
                this.showToast('🏁 CHECKPOINT 1: AZURE TERRACE!', '#38BDF8');
            }
        }
        if (this.checkpointIndex < 2) {
            const distIsland3 = Math.hypot(playerPos.x - (-10.5), playerPos.z - (-29.0));
            if (distIsland3 < 4.5 && playerPos.y >= 5.0) {
                this.checkpointIndex = 2;
                this.spawnCheckpoint.set(-10.5, 7.2, -29.0);
                this.playChime();
                this.addScore(1000, '+1,000 CHECKPOINT 2!');
                this.showToast('🏁 CHECKPOINT 2: AMETHYST PINNACLE!', '#A855F7');
            }
        }
        if (this.checkpointIndex < 3) {
            const distIsland4 = Math.hypot(playerPos.x - 0, playerPos.z - (-42.0));
            if (distIsland4 < 5.5 && playerPos.y >= 6.5) {
                this.checkpointIndex = 3;
                this.spawnCheckpoint.set(0, 9.0, -42.0);
                this.playChime();
                this.addScore(1500, '+1,500 CITADEL REACHED!');
                this.showToast('🏁 FINAL CHECKPOINT: GOLDEN CITADEL!', '#F59E0B');
            }
        }

        // 3. Red Hazard Spikes: damage & pop (cylindrical trigger volume)
        this.spikes.forEach(spike => {
            const horizDist = Math.hypot(playerPos.x - spike.position.x, playerPos.z - spike.position.z);
            const vertGap = playerPos.y - spike.position.y;
            // Pad socket + crystal shards: 1.25m horizontal radius, -0.2 to 1.8m vertical height
            if (horizDist < 1.25 && vertGap >= -0.2 && vertGap <= 1.8) {
                this.handlePlayerPop();
            }
        });

        // 4. Fall boundary check (drop into water)
        if (playerPos.y < (this.usesForgedLevel ? this.forgedFallY : 1.0)) {
            this.handlePlayerPop();
        }

        // 5. Exit Portal Check
        if (this.exitPortal && this.exitPortal.unlocked && !this.isWon) {
            const diskMesh = this.exitPortal.group.getObjectByName('portal_energy_disk');
            if (diskMesh) {
                diskMesh.rotation.z += deltaTime * 3.0;
            }

            const distToPortal = playerPos.distanceTo(this.exitPortal.group.position);
            if (distToPortal < 4.5) {
                this.triggerVictory();
            }
        }
    }

    private unlockExitPortal(): void {
        if (!this.exitPortal || this.exitPortal.unlocked) return;
        this.exitPortal.unlocked = true;

        const diskMesh = this.exitPortal.group.getObjectByName('portal_energy_disk') as THREE.Mesh;
        if (diskMesh && diskMesh.material) {
            (diskMesh.material as THREE.MeshBasicMaterial).color.setHex(0x10B981); // Emerald Green
        }
        if (this.exitPortal.light) {
            this.exitPortal.light.color.setHex(0x10B981);
            this.exitPortal.light.intensity = 4.0;
        }

        this.showToast('🌟 ALL HOOPS COLLECTED! EXIT PORTAL UNLOCKED! 🌟', '#10B981');
    }

    private handlePlayerPop(): void {
        this.playPop();
        this.playerController?.triggerHaptic?.([100, 50, 100]);
        // Popping penalty to introduce real stakes (score floors at 0)
        this.score = Math.max(0, this.score - 250);
        this.updateScoreDisplay();
        this.showToast('💥 POPPED! -250 PTS · RESPAWNING...', '#EF4444');

        if (this.playerController && typeof this.playerController.resetMotion === 'function') {
            this.playerController.resetMotion();
        } else {
            const ms = this.playerController?.getMovementSystem?.() as any;
            if (ms && typeof ms.reset === 'function') {
                ms.reset();
            }
        }
        this.trampolineFlightTimer = 0;
        if (this.playerController && typeof this.playerController.teleportTo === 'function') {
            this.playerController.teleportTo(this.spawnCheckpoint.x, this.spawnCheckpoint.y, this.spawnCheckpoint.z);
        } else if (this.playerController?.playerBody) {
            const body = this.playerController.playerBody;
            if (typeof body.setTranslation === 'function') {
                body.setTranslation({
                    x: this.spawnCheckpoint.x,
                    y: this.spawnCheckpoint.y,
                    z: this.spawnCheckpoint.z
                }, true);
            }
            if (typeof body.setLinvel === 'function') {
                body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            }
        }
        this.player.position.copy(this.spawnCheckpoint);
        if (this.ballVisual) {
            this.ballVisual.position.copy(this.getBallPosition());
        }
        this.ballScale.set(1, 1, 1);
        this.targetBallScale.set(1, 1, 1);
        this.wasGrounded = true;
        this.squishWobbleTimer = 0;
        this.trampolines.forEach(t => { t.cooldown = 0; });
    }

    private triggerVictory(): void {
        this.isWon = true;
        this.playVictory();
        this.playerController?.triggerHaptic?.([80, 40, 80, 40, 160]);

        // Speedrun time bonus (up to 10,000 points)
        const timeBonus = Math.max(500, Math.floor(10000 - this.gameTime * 50));
        this.addScore(timeBonus, `+${timeBonus.toLocaleString()} SPEEDRUN BONUS!`);

        const timeStr = this.formatTime(this.gameTime);
        const victoryCard = document.createElement('div');
        victoryCard.id = 'bounce-victory-modal';
        victoryCard.style.position = 'fixed';
        victoryCard.style.top = '50%';
        victoryCard.style.left = '50%';
        victoryCard.style.transform = 'translate(-50%, -50%)';
        victoryCard.style.background = 'rgba(15, 23, 42, 0.95)';
        victoryCard.style.backdropFilter = 'blur(12px)';
        victoryCard.style.border = '4px solid #10B981';
        victoryCard.style.borderRadius = '24px';
        victoryCard.style.padding = '36px 48px';
        victoryCard.style.color = '#FFFFFF';
        victoryCard.style.textAlign = 'center';
        victoryCard.style.zIndex = '100000';
        victoryCard.style.boxShadow = '0 0 50px rgba(16, 185, 129, 0.65)';
        victoryCard.style.fontFamily = 'system-ui, -apple-system, sans-serif';

        victoryCard.innerHTML = `
            <div style="font-size: 40px; margin-bottom: 6px;">🏆 STAGE CLEAR! 🏆</div>
            <div style="font-size: 20px; color: #FBBF24; margin-bottom: 18px;">Nokia Bounce 3D Champion</div>
            <div style="font-size: 32px; color: #10B981; font-weight: 900; margin-bottom: 8px;">Score: ${this.score.toLocaleString()}</div>
            <div style="font-size: 18px; color: #C084FC; font-weight: bold; margin-bottom: 8px;">High Score: ${this.highScore.toLocaleString()}</div>
            <div style="font-size: 22px; color: #38BDF8; font-weight: bold; margin-bottom: 24px;">Time: ${timeStr}</div>
            <button id="bounce-restart-btn" style="
                background: linear-gradient(135deg, #10B981, #059669);
                border: none;
                border-radius: 500px;
                padding: 12px 36px;
                color: #FFFFFF;
                font-size: 18px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);
                transition: transform 0.15s ease;
            ">Play Again (R)</button>
        `;

        document.body.appendChild(victoryCard);

        const restartBtn = document.getElementById('bounce-restart-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                this.restartRun();
            });
        }
    }

    private updateRingsDisplay(): void {
        if (this.ringsDisplay) {
            this.ringsDisplay.innerText = `🟡 Rings: ${this.ringsCollected} / ${this.totalRings}`;
        }
    }

    private updateTimerDisplay(): void {
        if (this.timerDisplay) {
            this.timerDisplay.innerText = `⏱️ ${this.formatTime(this.gameTime)}`;
        }
    }

    private formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const tenths = Math.floor((seconds * 10) % 10);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
    }

    private showToast(message: string, color: string): void {
        const toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.bottom = '32px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.background = 'rgba(15, 23, 42, 0.9)';
        toast.style.border = `2px solid ${color}`;
        toast.style.borderRadius = '500px';
        toast.style.padding = '10px 28px';
        toast.style.color = color;
        toast.style.fontSize = '18px';
        toast.style.fontWeight = 'bold';
        toast.style.zIndex = '99999';
        toast.style.boxShadow = `0 4px 20px ${color}44`;
        toast.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        toast.innerText = message;

        document.body.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 2500);
    }

    public dispose(): void {
        console.log('🧹 Disposing BounceCourseManager and cleaning up resources...');

        // 1. Clean up DOM elements and injected styles
        if (this.hudContainer) {
            this.hudContainer.remove();
            this.hudContainer = null;
        }
        const styleEl = document.getElementById('bounce3d-hide-debug-controls');
        if (styleEl) styleEl.remove();
        const victoryModal = document.getElementById('bounce-victory-modal');
        if (victoryModal) victoryModal.remove();

        // 2. Clear all animation state
        this.animatingRings = [];

        // 3. Remove scene meshes and course objects
        if (this.ballVisual) {
            this.scene.remove(this.ballVisual);
            this.ballVisual = null;
        }
        if (this.shadowMesh) {
            this.scene.remove(this.shadowMesh);
            this.shadowMesh = null;
        }
        for (const ring of this.rings) {
            this.scene.remove(ring.mesh);
            if (ring.light) this.scene.remove(ring.light);
        }
        this.rings = [];

        for (const tramp of this.trampolines) {
            this.scene.remove(tramp.mesh);
        }
        this.trampolines = [];

        for (const spike of this.spikes) {
            this.scene.remove(spike.mesh);
        }
        this.spikes = [];

        if (this.exitPortal) {
            this.scene.remove(this.exitPortal.group);
            this.exitPortal = null;
        }

        for (const island of this.floatingIslands) {
            this.scene.remove(island);
        }
        this.floatingIslands = [];

        for (const sc of this.sceneryObjects) {
            this.scene.remove(sc);
        }
        this.sceneryObjects = [];

        for (const l of this.courseLights) {
            this.scene.remove(l);
        }
        this.courseLights = [];

        for (const sp of this.sparklePool) {
            this.scene.remove(sp);
        }
        this.sparklePool = [];
        this.activeSparkles = [];

        // 4. Remove physics bodies from Rapier world
        if (this.engine?.physicsWorld) {
            for (const body of this.physicsBodies) {
                try {
                    this.engine.physicsWorld.removeRigidBody(body);
                } catch (e) {}
            }
            this.physicsBodies = [];
        }

        // 5. Release audio resources
        if (this.audioCtx) {
            try {
                this.audioCtx.close();
            } catch (e) {}
            this.audioCtx = null;
        }
        if (this.proBoingAudio) {
            this.proBoingAudio.pause();
            this.proBoingAudio = null;
        }
        if (this.proBounceAudio) {
            this.proBounceAudio.pause();
            this.proBounceAudio = null;
        }
    }
}

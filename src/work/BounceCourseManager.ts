import * as THREE from 'three';
import { getRapier } from 'engine/physics/RapierPhysics.js';
import { CollisionGroup, CollisionMask, makeCollisionGroups } from 'engine/CollisionLayers.js';

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
    }[] = [];
    private spikes: { mesh: THREE.Group; position: THREE.Vector3 }[] = [];
    private exitPortal: { group: THREE.Group; unlocked: boolean; light: THREE.PointLight } | null = null;
    private floatingIslands: THREE.Group[] = [];

    // Rolling Red Ball Visual
    private ballVisual: THREE.Group | null = null;
    private ballInnerMesh: THREE.Mesh | null = null;
    private lastPlayerPos: THREE.Vector3 = new THREE.Vector3();

    // Game State
    public totalRings: number = 5;
    public ringsCollected: number = 0;
    public isWon: boolean = false;
    public gameTime: number = 0;
    private spawnCheckpoint: THREE.Vector3 = new THREE.Vector3(0, 4.6, 0);
    private checkpointIndex: number = 0;

    // Audio Context (Procedural Web Audio API)
    private audioCtx: AudioContext | null = null;

    // HUD DOM Elements
    private hudContainer: HTMLElement | null = null;
    private ringsDisplay: HTMLElement | null = null;
    private timerDisplay: HTMLElement | null = null;

    constructor(scene: THREE.Scene, player: THREE.Object3D, playerController: any, engine?: any) {
        this.scene = scene;
        this.player = player;
        this.playerController = playerController;
        this.engine = engine;

        // Position player on the elevated spawn island
        this.spawnCheckpoint.set(0, 4.6, 0);
        this.lastPlayerPos.set(0, 4.6, 0);
        if (player) {
            player.position.set(0, 4.6, 0);
            if (this.playerController?.playerBody) {
                this.playerController.playerBody.setTranslation({ x: 0, y: 4.6, z: 0 }, true);
                this.playerController.playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
            }
        }

        this.initAudio();
        this.initHUD();
        this.createBallVisual();
        this.buildObstacleCourse();
        this.buildWorldScenery();
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
        this.hudContainer.style.gap = '14px';
        this.hudContainer.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        this.hudContainer.style.fontWeight = 'bold';
        this.hudContainer.style.pointerEvents = 'none';

        // Rings counter card
        this.ringsDisplay = document.createElement('div');
        this.ringsDisplay.style.background = 'rgba(15, 23, 42, 0.9)';
        this.ringsDisplay.style.backdropFilter = 'blur(8px)';
        this.ringsDisplay.style.border = '2px solid #FBBF24';
        this.ringsDisplay.style.borderRadius = '500px';
        this.ringsDisplay.style.padding = '8px 20px';
        this.ringsDisplay.style.color = '#FBBF24';
        this.ringsDisplay.style.fontSize = '18px';
        this.ringsDisplay.style.boxShadow = '0 4px 16px rgba(251, 191, 36, 0.4)';
        this.ringsDisplay.innerText = '🟡 Rings: 0 / 5';

        // Speedrun timer card
        this.timerDisplay = document.createElement('div');
        this.timerDisplay.style.background = 'rgba(15, 23, 42, 0.9)';
        this.timerDisplay.style.backdropFilter = 'blur(8px)';
        this.timerDisplay.style.border = '2px solid #38BDF8';
        this.timerDisplay.style.borderRadius = '500px';
        this.timerDisplay.style.padding = '8px 20px';
        this.timerDisplay.style.color = '#38BDF8';
        this.timerDisplay.style.fontSize = '18px';
        this.timerDisplay.style.boxShadow = '0 4px 16px rgba(56, 189, 248, 0.4)';
        this.timerDisplay.innerText = '⏱️ 00:00.0';

        this.hudContainer.appendChild(this.ringsDisplay);
        this.hudContainer.appendChild(this.timerDisplay);
        document.body.appendChild(this.hudContainer);
    }

    /**
     * Creates a guaranteed-visible high-gloss Nokia red bouncing sphere
     */
    private createBallVisual(): void {
        this.ballVisual = new THREE.Group();
        this.ballVisual.name = 'Bounce3D_BallVisualGroup';

        const radius = 0.55;
        const sphereGeo = new THREE.SphereGeometry(radius, 32, 32);
        const sphereMat = new THREE.MeshStandardMaterial({
            color: 0xEF4444, // Candy-apple red
            roughness: 0.12, // High-gloss sheen
            metalness: 0.25, // Specular bounce
            emissive: 0x660000,
            emissiveIntensity: 0.25
        });

        this.ballInnerMesh = new THREE.Mesh(sphereGeo, sphereMat);
        this.ballInnerMesh.castShadow = true;
        this.ballInnerMesh.receiveShadow = true;

        // Shiny white specular highlight
        const shineGeo = new THREE.SphereGeometry(0.12, 16, 16);
        const shineMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        const shineMesh = new THREE.Mesh(shineGeo, shineMat);
        shineMesh.position.set(0.2, 0.3, 0.4);
        this.ballInnerMesh.add(shineMesh);

        // Secondary rim highlight
        const rimGeo = new THREE.SphereGeometry(0.06, 12, 12);
        const rimMat = new THREE.MeshBasicMaterial({ color: 0xFECACA });
        const rimMesh = new THREE.Mesh(rimGeo, rimMat);
        rimMesh.position.set(-0.28, -0.15, 0.38);
        this.ballInnerMesh.add(rimMesh);

        this.ballVisual.add(this.ballInnerMesh);

        // Point light on the ball for radiant glow
        const ballLight = new THREE.PointLight(0xEF4444, 1.8, 4);
        this.ballVisual.add(ballLight);

        this.ballVisual.position.copy(this.spawnCheckpoint);
        this.scene.add(this.ballVisual);
        console.log('🔴 Bounce 3D Ball Visual attached to scene!');
    }

    /**
     * Builds floating islands, clouds, and environment props with solid Rapier physics colliders
     */
    private buildWorldScenery(): void {
        const RAPIER = getRapier();

        // 1. Elevated Floating Islands in a Wide Platformer Vista
        // Tier 1 (Spawn Center) -> Tier 2 (Azure Wide Right: X=+10.5) -> Tier 3 (Amethyst Wide Left: X=-10.5) -> Tier 4 (Golden Citadel Center: Z=-42)
        // Broad lateral spacing ensures 100% depth separation with ZERO overlapping platforms
        const islandConfigs = [
            { pos: new THREE.Vector3(0, 3.5, -1.0), radius: 6.5, color: 0x10B981, rimColor: 0xFBBF24 },       // Tier 1: Emerald Spawn Island
            { pos: new THREE.Vector3(10.5, 4.6, -17.0), radius: 5.2, color: 0x0284C7, rimColor: 0x38BDF8 },  // Tier 2: Azure Sky Terrace (wide right)
            { pos: new THREE.Vector3(-10.5, 6.2, -29.0), radius: 5.2, color: 0x7C3AED, rimColor: 0xC084FC }, // Tier 3: Amethyst Pinnacle (wide left)
            { pos: new THREE.Vector3(0, 8.0, -42.0), radius: 7.2, color: 0xD97706, rimColor: 0xF59E0B },     // Tier 4: Golden Victory Citadel (distant center)
        ];

        islandConfigs.forEach((cfg) => {
            const island = new THREE.Group();
            island.position.copy(cfg.pos);

            // Island top (lush grass disc)
            const topGeo = new THREE.CylinderGeometry(cfg.radius, cfg.radius * 0.96, 0.5, 28);
            const topMat = new THREE.MeshStandardMaterial({
                color: cfg.color,
                roughness: 0.4,
                metalness: 0.1
            });
            const topMesh = new THREE.Mesh(topGeo, topMat);
            topMesh.position.y = 0.25;
            topMesh.receiveShadow = true;
            island.add(topMesh);

            // Decorative checkered grass border
            const innerGrassGeo = new THREE.CylinderGeometry(cfg.radius * 0.92, cfg.radius * 0.92, 0.52, 28);
            const innerGrassMat = new THREE.MeshStandardMaterial({
                color: 0x047857,
                roughness: 0.5
            });
            const innerGrassMesh = new THREE.Mesh(innerGrassGeo, innerGrassMat);
            innerGrassMesh.position.y = 0.25;
            island.add(innerGrassMesh);

            // Beveled stone cliff rim
            const cliffGeo = new THREE.CylinderGeometry(cfg.radius * 0.98, cfg.radius * 0.85, 0.6, 24);
            const cliffMat = new THREE.MeshStandardMaterial({
                color: 0x64748B, // Slate stone
                roughness: 0.8,
                metalness: 0.2,
                flatShading: true
            });
            const cliffMesh = new THREE.Mesh(cliffGeo, cliffMat);
            cliffMesh.position.y = -0.25;
            island.add(cliffMesh);

            // Shallow stone underside disc (replaces dark giant cone, keeping sky bright & clear!)
            const baseGeo = new THREE.CylinderGeometry(cfg.radius * 0.85, cfg.radius * 0.5, 0.8, 16);
            const baseMat = new THREE.MeshStandardMaterial({
                color: 0x475569, // Slate stone
                roughness: 0.85,
                metalness: 0.15,
                flatShading: true
            });
            const baseMesh = new THREE.Mesh(baseGeo, baseMat);
            baseMesh.position.y = -0.9;
            island.add(baseMesh);

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

            // Add solid Rapier physics collider for this floating island
            if (this.engine?.physicsWorld && RAPIER) {
                try {
                    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(cfg.pos.x, cfg.pos.y + 0.25, cfg.pos.z);
                    const body = this.engine.physicsWorld.createRigidBody(bodyDesc);
                    const colDesc = RAPIER.ColliderDesc.cylinder(0.3, cfg.radius)
                        .setFriction(0.9)
                        .setCollisionGroups(makeCollisionGroups(CollisionGroup.ENVIRONMENT, CollisionMask.ENVIRONMENT));
                    this.engine.physicsWorld.createCollider(colDesc, body);
                } catch (e) {
                    console.warn('Physics collider creation warning:', e);
                }
            }
        });

        // 2. Stylized Low-Poly Fluffy Clouds in the Azure Sky
        const cloudPositions = [
            new THREE.Vector3(-16, 18, -10),
            new THREE.Vector3(18, 20, -25),
            new THREE.Vector3(-20, 22, -40),
            new THREE.Vector3(16, 19, -50),
            new THREE.Vector3(0, 24, -30),
        ];

        cloudPositions.forEach(cPos => {
            const cloudGroup = new THREE.Group();
            cloudGroup.position.copy(cPos);

            const cloudMat = new THREE.MeshStandardMaterial({
                color: 0xFFFFFF,
                roughness: 0.4,
                metalness: 0.0,
                flatShading: true
            });

            // Cluster of 4 low-poly spheres
            const puffs = [
                { r: 2.2, x: 0, y: 0, z: 0 },
                { r: 1.6, x: 1.8, y: -0.2, z: 0.3 },
                { r: 1.7, x: -1.7, y: -0.1, z: -0.2 },
                { r: 1.4, x: 0.2, y: 0.9, z: -0.4 },
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

    /**
     * Builds the 5 Golden Rings, 4 Trampolines, Grounded Faceted Crystal Spikes, and Cyan-Magenta Exit Portal
     * Elevated to match the floating islands above the water
     */
    private buildObstacleCourse(): void {
        console.log('🔴 Building Bounce 3D Course elevated on floating islands...');

        // 1. Five Golden Hoops spatially separated across the course without 2D overlap
        const hoopPositions = [
            new THREE.Vector3(0, 5.0, -4.5),       // Hoop 1: foreground center on spawn island
            new THREE.Vector3(5.5, 5.8, -10.5),    // Hoop 2: mid-air arc jumping onto Azure Terrace (right)
            new THREE.Vector3(10.5, 6.6, -17.0),   // Hoop 3: soaring over Azure Terrace (far right)
            new THREE.Vector3(-10.5, 8.0, -29.0),  // Hoop 4: high arc over Amethyst Pinnacle (far left)
            new THREE.Vector3(0, 10.4, -38.5),     // Hoop 5: gateway before Citadel Exit Portal (high center)
        ];

        hoopPositions.forEach((pos, idx) => {
            const torusGeo = new THREE.TorusGeometry(1.4, 0.18, 16, 36);
            const torusMat = new THREE.MeshStandardMaterial({
                color: 0xFBBF24, // Gold
                metalness: 0.85,
                roughness: 0.15,
                emissive: 0x92400E,
                emissiveIntensity: 0.7
            });

            const ringMesh = new THREE.Mesh(torusGeo, torusMat);
            ringMesh.position.copy(pos);
            ringMesh.name = `GoldenHoop_${idx}`;

            // Add shimmering point light
            const ringLight = new THREE.PointLight(0xFBBF24, 2.5, 8);
            ringLight.position.copy(pos);

            this.scene.add(ringMesh);
            this.scene.add(ringLight);

            this.rings.push({ mesh: ringMesh, collected: false, light: ringLight });
        });

        // 2. Yellow Rubber Trampolines with Visible Heavy Steel Springs & Bullseye
        const trampolineConfigs = [
            { pos: new THREE.Vector3(-2.4, 4.0, -1.8), launch: new THREE.Vector3(0, 21.0, 0), isVertical: true },   // Trampoline 1: Foreground vertical super leap
            { pos: new THREE.Vector3(2.5, 4.0, -5.5), launch: new THREE.Vector3(8.5, 20.0, -11.0), isVertical: false }, // Trampoline 2: Launch to Azure Terrace
            { pos: new THREE.Vector3(9.5, 5.1, -19.5), launch: new THREE.Vector3(-17.0, 22.5, -8.0), isVertical: false }, // Trampoline 3: Launch to Amethyst Pinnacle
            { pos: new THREE.Vector3(-9.5, 6.7, -31.5), launch: new THREE.Vector3(8.5, 21.0, -9.5), isVertical: false }, // Trampoline 4: Launch to Golden Citadel
        ];

        trampolineConfigs.forEach((cfg) => {
            const pos = cfg.pos;
            const trampGroup = new THREE.Group();
            trampGroup.position.copy(pos);

            // Sturdy tubular steel frame & legs
            const frameMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9, roughness: 0.2 });
            const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8);
            [
                { x: -1.2, z: -1.2 }, { x: 1.2, z: -1.2 },
                { x: -1.2, z: 1.2 }, { x: 1.2, z: 1.2 }
            ].forEach(lp => {
                const leg = new THREE.Mesh(legGeo, frameMat);
                leg.position.set(lp.x, 0.25, lp.z);
                trampGroup.add(leg);
            });

            // Circular frame ring
            const frameRingGeo = new THREE.TorusGeometry(1.5, 0.12, 12, 28);
            const frameRing = new THREE.Mesh(frameRingGeo, frameMat);
            frameRing.rotation.x = Math.PI / 2;
            frameRing.position.y = 0.52;
            trampGroup.add(frameRing);

            // Large visible central chrome accordion compression spring
            const springGroup = new THREE.Group();
            const coilMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, metalness: 0.95, roughness: 0.1 });
            [0.12, 0.24, 0.36, 0.48].forEach(cy => {
                const coil = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.08, 8, 20), coilMat);
                coil.rotation.x = Math.PI / 2;
                coil.position.y = cy;
                springGroup.add(coil);
            });
            trampGroup.add(springGroup);

            // Vibrant yellow rubber trampoline bounce pad
            const padGeo = new THREE.CylinderGeometry(1.3, 1.35, 0.18, 24);
            const padMat = new THREE.MeshStandardMaterial({
                color: 0xFACC15, // Bright sun yellow
                roughness: 0.15,
                metalness: 0.1,
                emissive: 0x854D0E,
                emissiveIntensity: 0.5
            });
            const padMesh = new THREE.Mesh(padGeo, padMat);
            padMesh.position.y = 0.58;
            padMesh.castShadow = true;
            trampGroup.add(padMesh);

            // Bold white bullseye ring
            const bullseyeGeo = new THREE.RingGeometry(0.55, 0.9, 24);
            const bullseyeMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide });
            const bullseye = new THREE.Mesh(bullseyeGeo, bullseyeMat);
            bullseye.rotation.x = -Math.PI / 2;
            bullseye.position.y = 0.68;
            trampGroup.add(bullseye);

            // Red center target star
            const starGeo = new THREE.CircleGeometry(0.35, 16);
            const starMat = new THREE.MeshBasicMaterial({ color: 0xEF4444, side: THREE.DoubleSide });
            const star = new THREE.Mesh(starGeo, starMat);
            star.rotation.x = -Math.PI / 2;
            star.position.y = 0.69;
            trampGroup.add(star);

            // Upward bounce chevrons (^ ^ ^)
            const chevronMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide });
            [-0.2, 0.0, 0.2].forEach((cz) => {
                const arm1 = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.06), chevronMat);
                arm1.rotation.x = -Math.PI / 2;
                arm1.rotation.z = Math.PI / 4;
                arm1.position.set(-0.07, 0.70, cz);
                trampGroup.add(arm1);

                const arm2 = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.06), chevronMat);
                arm2.rotation.x = -Math.PI / 2;
                arm2.rotation.z = -Math.PI / 4;
                arm2.position.set(0.07, 0.70, cz);
                trampGroup.add(arm2);
            });

            // Upward bouncing light aura
            const trampLight = new THREE.PointLight(0xFACC15, 2.5, 6);
            trampLight.position.y = 1.0;
            trampGroup.add(trampLight);

            this.scene.add(trampGroup);
            this.trampolines.push({
                mesh: trampGroup,
                basePosition: pos.clone(),
                springMesh: springGroup,
                cooldown: 0,
                launch: cfg.launch,
                isVertical: cfg.isVertical
            });
        });

        // 3. Red Geometric Crystal Spikes (Faceted Ruby Octahedrons with Bedrock Socket)
        const spikePositions = [
            new THREE.Vector3(2.4, 4.0, -1.8),   // Spikes 1: foreground right on Spawn Island
            new THREE.Vector3(10.5, 4.8, -14.5), // Spikes 2: Azure Terrace perimeter hazard
            new THREE.Vector3(-10.5, 6.3, -26.5),// Spikes 3: Amethyst Pinnacle perimeter hazard
        ];

        spikePositions.forEach((pos) => {
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

            // Jagged faceted red geometric crystal shards (Elongated Octahedrons with sharp diamond facets)
            const crystalConfigs = [
                { x: 0, z: 0, sx: 0.85, sy: 3.2, sz: 0.85, y: 0.9, rx: 0.05, rz: -0.05 },          // Center primary crystal spire
                { x: -0.42, z: -0.32, sx: 0.65, sy: 2.5, sz: 0.65, y: 0.7, rx: -0.2, rz: 0.15 },  // Front-left crystal shard
                { x: 0.42, z: -0.32, sx: 0.7, sy: 2.6, sz: 0.7, y: 0.75, rx: -0.15, rz: -0.2 },   // Front-right crystal shard
                { x: -0.32, z: 0.42, sx: 0.6, sy: 2.0, sz: 0.6, y: 0.6, rx: 0.2, rz: 0.12 },     // Rear-left crystal shard
                { x: 0.35, z: 0.38, sx: 0.62, sy: 2.2, sz: 0.62, y: 0.65, rx: 0.18, rz: -0.15 },  // Rear-right crystal shard
            ];

            const crystalMat = new THREE.MeshStandardMaterial({
                color: 0xDC2626, // Crimson ruby crystal
                roughness: 0.08,
                metalness: 0.4,
                emissive: 0x991B1B,
                emissiveIntensity: 0.7,
                flatShading: true // Faceted diamond crystal polygon look!
            });

            crystalConfigs.forEach(cc => {
                // Octahedron: 8 sharp triangular facets meeting at diamond points!
                const octGeo = new THREE.OctahedronGeometry(0.35, 0);
                const shard = new THREE.Mesh(octGeo, crystalMat);
                shard.scale.set(cc.sx, cc.sy, cc.sz);
                shard.position.set(cc.x, cc.y, cc.z);
                shard.rotation.x = cc.rx;
                shard.rotation.z = cc.rz;
                shard.castShadow = true;
                spikeGroup.add(shard);
            });

            // Crystal danger radiance
            const crystalLight = new THREE.PointLight(0xEF4444, 2.5, 5);
            crystalLight.position.y = 0.8;
            spikeGroup.add(crystalLight);

            this.scene.add(spikeGroup);
            this.spikes.push({ mesh: spikeGroup, position: pos });
        });

        // 4. Magical Swirling Cyan-Magenta Exit Portal on Golden Victory Citadel
        const portalGroup = new THREE.Group();
        portalGroup.position.set(0, 11.2, -42.0);

        // Grand Dimensional Archway (Cyan glowing gate)
        const portalRingGeo = new THREE.TorusGeometry(4.8, 0.45, 16, 40);
        const portalRingMat = new THREE.MeshStandardMaterial({
            color: 0x00FFFF, // Neon Cyan
            metalness: 0.9,
            roughness: 0.1,
            emissive: 0x00FFFF,
            emissiveIntensity: 1.2
        });
        const portalRingMesh = new THREE.Mesh(portalRingGeo, portalRingMat);
        portalRingMesh.castShadow = true;
        portalGroup.add(portalRingMesh);

        // Concentric Swirling Vortex Disk 1: Outer Electric Cyan Spiral
        const outerVortexGeo = new THREE.RingGeometry(2.5, 4.5, 32);
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
        const innerVortexGeo = new THREE.CircleGeometry(2.6, 32);
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
        const starGeo = new THREE.OctahedronGeometry(1.2);
        const starMat = new THREE.MeshStandardMaterial({
            color: 0xFBBF24,
            metalness: 0.9,
            roughness: 0.1,
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

    public update(deltaTime: number): void {
        if (!this.player) return;

        if (!this.isWon) {
            this.gameTime += deltaTime;
            this.updateTimerDisplay();
        }

        const playerPos = this.player.position;

        // 0. Update Red Ball Visual: Sync position and realistic roll rotation
        if (this.ballVisual) {
            this.ballVisual.position.copy(playerPos);
            this.ballVisual.position.y += 0.55;

            if (this.ballInnerMesh && this.lastPlayerPos) {
                const dx = playerPos.x - this.lastPlayerPos.x;
                const dz = playerPos.z - this.lastPlayerPos.z;
                // Realistic rolling along movement direction
                this.ballInnerMesh.rotation.z -= dx * 2.0;
                this.ballInnerMesh.rotation.x += dz * 2.0;
            }
            this.lastPlayerPos.copy(playerPos);
        }

        // 1. Golden Hoops: rotate & check pass-through
        this.rings.forEach(ring => {
            if (!ring.collected) {
                ring.mesh.rotation.y += deltaTime * 2.2;

                // Check distance
                if (playerPos.distanceTo(ring.mesh.position) < 1.6) {
                    ring.collected = true;
                    this.ringsCollected++;
                    this.playChime();
                    this.updateRingsDisplay();

                    // Animate ring collect: flash and shrink
                    ring.light.intensity = 5.0;
                    const startTime = performance.now();
                    const animInterval = setInterval(() => {
                        const elapsed = (performance.now() - startTime) / 1000;
                        if (elapsed >= 0.3) {
                            ring.mesh.visible = false;
                            ring.light.intensity = 0;
                            clearInterval(animInterval);
                        } else {
                            const scale = 1.0 - elapsed / 0.3;
                            ring.mesh.scale.set(scale, scale, scale);
                        }
                    }, 16);

                    // Check if all hoops collected to unlock portal
                    if (this.ringsCollected >= this.totalRings) {
                        this.unlockExitPortal();
                    }
                }
            }
        });

        // 2. Yellow Trampolines: super bounce
        this.trampolines.forEach(tramp => {
            if (tramp.cooldown > 0) {
                tramp.cooldown -= deltaTime;
            }

            const dist = playerPos.distanceTo(tramp.basePosition);
            if (dist < 1.8 && playerPos.y >= tramp.basePosition.y && tramp.cooldown <= 0) {
                tramp.cooldown = 0.5;
                this.playBoing();

                // Compress spring visually
                tramp.springMesh.scale.set(1.2, 0.4, 1.2);
                setTimeout(() => {
                    tramp.springMesh.scale.set(1.0, 1.0, 1.0);
                }, 180);

                // Apply trajectory launch impulse
                if (this.playerController?.playerBody) {
                    const body = this.playerController.playerBody;
                    if (typeof body.setLinvel === 'function') {
                        if (tramp.isVertical) {
                            const curVel = body.linvel();
                            body.setLinvel({ x: curVel.x * 1.2, y: tramp.launch.y, z: curVel.z * 1.2 }, true);
                        } else {
                            body.setLinvel({ x: tramp.launch.x, y: tramp.launch.y, z: tramp.launch.z }, true);
                        }
                    }
                }
            }
        });

        // 2b. Dynamic Island Checkpoints
        if (this.checkpointIndex < 1) {
            const distIsland2 = Math.hypot(playerPos.x - 10.5, playerPos.z - (-17.0));
            if (distIsland2 < 4.5 && playerPos.y >= 3.5) {
                this.checkpointIndex = 1;
                this.spawnCheckpoint.set(10.5, 5.6, -17.0);
                this.playChime();
                this.showToast('🏁 CHECKPOINT 1: AZURE TERRACE!', '#38BDF8');
            }
        }
        if (this.checkpointIndex < 2) {
            const distIsland3 = Math.hypot(playerPos.x - (-10.5), playerPos.z - (-29.0));
            if (distIsland3 < 4.5 && playerPos.y >= 5.0) {
                this.checkpointIndex = 2;
                this.spawnCheckpoint.set(-10.5, 7.2, -29.0);
                this.playChime();
                this.showToast('🏁 CHECKPOINT 2: AMETHYST PINNACLE!', '#A855F7');
            }
        }
        if (this.checkpointIndex < 3) {
            const distIsland4 = Math.hypot(playerPos.x - 0, playerPos.z - (-42.0));
            if (distIsland4 < 5.5 && playerPos.y >= 6.5) {
                this.checkpointIndex = 3;
                this.spawnCheckpoint.set(0, 9.0, -42.0);
                this.playChime();
                this.showToast('🏁 FINAL CHECKPOINT: GOLDEN CITADEL!', '#F59E0B');
            }
        }

        // 3. Red Hazard Spikes: damage & pop
        this.spikes.forEach(spike => {
            const dist = playerPos.distanceTo(spike.position);
            if (dist < 1.3 && Math.abs(playerPos.y - spike.position.y) < 1.0) {
                this.handlePlayerPop();
            }
        });

        // 4. Fall boundary check (drop into water)
        if (playerPos.y < 1.0) {
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
        this.showToast('💥 POPPED! RESPAWNING...', '#EF4444');

        if (this.playerController?.playerBody) {
            const body = this.playerController.playerBody;
            if (typeof body.setTranslation === 'function') {
                body.setTranslation({
                    x: this.spawnCheckpoint.x,
                    y: this.spawnCheckpoint.y + 1.0,
                    z: this.spawnCheckpoint.z
                }, true);
            }
            if (typeof body.setLinvel === 'function') {
                body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            }
        }
        this.player.position.copy(this.spawnCheckpoint);
        if (this.ballVisual) {
            this.ballVisual.position.copy(this.spawnCheckpoint);
        }
    }

    private triggerVictory(): void {
        this.isWon = true;
        this.playVictory();

        const timeStr = this.formatTime(this.gameTime);
        const victoryCard = document.createElement('div');
        victoryCard.style.position = 'fixed';
        victoryCard.style.top = '50%';
        victoryCard.style.left = '50%';
        victoryCard.style.transform = 'translate(-50%, -50%)';
        victoryCard.style.background = 'rgba(15, 23, 42, 0.95)';
        victoryCard.style.border = '4px solid #10B981';
        victoryCard.style.borderRadius = '24px';
        victoryCard.style.padding = '32px 48px';
        victoryCard.style.color = '#FFFFFF';
        victoryCard.style.textAlign = 'center';
        victoryCard.style.zIndex = '100000';
        victoryCard.style.boxShadow = '0 0 40px rgba(16, 185, 129, 0.6)';
        victoryCard.style.fontFamily = 'system-ui, -apple-system, sans-serif';

        victoryCard.innerHTML = `
            <div style="font-size: 42px; margin-bottom: 8px;">🏆 STAGE CLEAR! 🏆</div>
            <div style="font-size: 22px; color: #FBBF24; margin-bottom: 16px;">Nokia Bounce 3D Champion</div>
            <div style="font-size: 28px; color: #38BDF8; font-weight: bold; margin-bottom: 24px;">Time: ${timeStr}</div>
            <button id="bounce-restart-btn" style="
                background: linear-gradient(135deg, #10B981, #059669);
                border: none;
                border-radius: 500px;
                padding: 12px 32px;
                color: #FFFFFF;
                font-size: 18px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);
            ">Play Again</button>
        `;

        document.body.appendChild(victoryCard);

        const restartBtn = document.getElementById('bounce-restart-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                window.location.reload();
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
}

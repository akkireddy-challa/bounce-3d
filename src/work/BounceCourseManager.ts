import * as THREE from 'three';

/**
 * 🔴 BounceCourseManager: Handles Golden Rings, Trampolines, Spikes, Audio Synth, and HUD
 */
export class BounceCourseManager {
    private scene: THREE.Scene;
    private player: THREE.Object3D;
    private playerController: any;

    // Entities
    private rings: { mesh: THREE.Mesh; collected: boolean; light: THREE.PointLight }[] = [];
    private trampolines: { mesh: THREE.Group; basePosition: THREE.Vector3; springMesh: THREE.Mesh; cooldown: number }[] = [];
    private spikes: { mesh: THREE.Group; position: THREE.Vector3 }[] = [];
    private exitPortal: { group: THREE.Group; unlocked: boolean; light: THREE.PointLight } | null = null;

    // Game State
    public totalRings: number = 5;
    public ringsCollected: number = 0;
    public isWon: boolean = false;
    public gameTime: number = 0;
    private spawnCheckpoint: THREE.Vector3 = new THREE.Vector3(0, 5, 0);

    // Audio Context (Procedural Web Audio API)
    private audioCtx: AudioContext | null = null;

    // HUD DOM Elements
    private hudContainer: HTMLElement | null = null;
    private ringsDisplay: HTMLElement | null = null;
    private timerDisplay: HTMLElement | null = null;

    constructor(scene: THREE.Scene, player: THREE.Object3D, playerController: any) {
        this.scene = scene;
        this.player = player;
        this.playerController = playerController;

        // Remember initial spawn point
        this.spawnCheckpoint.copy(player.position);

        this.initAudio();
        this.initHUD();
        this.buildObstacleCourse();
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
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.18);
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
        this.ringsDisplay.style.background = 'rgba(15, 23, 42, 0.85)';
        this.ringsDisplay.style.backdropFilter = 'blur(8px)';
        this.ringsDisplay.style.border = '2px solid #FBBF24';
        this.ringsDisplay.style.borderRadius = '12px';
        this.ringsDisplay.style.padding = '8px 16px';
        this.ringsDisplay.style.color = '#FBBF24';
        this.ringsDisplay.style.fontSize = '18px';
        this.ringsDisplay.style.boxShadow = '0 4px 12px rgba(251, 191, 36, 0.3)';
        this.ringsDisplay.innerText = '🟡 Rings: 0 / 5';

        // Speedrun timer card
        this.timerDisplay = document.createElement('div');
        this.timerDisplay.style.background = 'rgba(15, 23, 42, 0.85)';
        this.timerDisplay.style.backdropFilter = 'blur(8px)';
        this.timerDisplay.style.border = '2px solid #38BDF8';
        this.timerDisplay.style.borderRadius = '12px';
        this.timerDisplay.style.padding = '8px 16px';
        this.timerDisplay.style.color = '#38BDF8';
        this.timerDisplay.style.fontSize = '18px';
        this.timerDisplay.style.boxShadow = '0 4px 12px rgba(56, 189, 248, 0.3)';
        this.timerDisplay.innerText = '⏱️ 00:00.0';

        this.hudContainer.appendChild(this.ringsDisplay);
        this.hudContainer.appendChild(this.timerDisplay);
        document.body.appendChild(this.hudContainer);
    }

    private buildObstacleCourse(): void {
        console.log('🔴 Building Bounce 3D Golden Hoops, Trampolines, & Hazards...');

        // 1. Five Golden Hoops placed along the course
        const hoopPositions = [
            new THREE.Vector3(0, 3.2, 10),
            new THREE.Vector3(5, 4.5, 25),
            new THREE.Vector3(-6, 7.0, 42),
            new THREE.Vector3(0, 6.0, 58),
            new THREE.Vector3(4, 5.0, 75),
        ];

        hoopPositions.forEach((pos, idx) => {
            const torusGeo = new THREE.TorusGeometry(1.2, 0.14, 16, 32);
            const torusMat = new THREE.MeshStandardMaterial({
                color: 0xFBBF24, // Gold
                metalness: 0.8,
                roughness: 0.2,
                emissive: 0x886600,
                emissiveIntensity: 0.5
            });

            const ringMesh = new THREE.Mesh(torusGeo, torusMat);
            ringMesh.position.copy(pos);
            ringMesh.name = `GoldenHoop_${idx}`;

            const ringLight = new THREE.PointLight(0xFBBF24, 1.5, 6);
            ringLight.position.copy(pos);

            this.scene.add(ringMesh);
            this.scene.add(ringLight);

            this.rings.push({ mesh: ringMesh, collected: false, light: ringLight });
        });

        // 2. Yellow Rubber Trampolines (Super Bounce Pads)
        const trampolinePositions = [
            new THREE.Vector3(0, 1.2, 18),
            new THREE.Vector3(-6, 2.0, 34),
            new THREE.Vector3(0, 2.0, 66),
        ];

        trampolinePositions.forEach((pos, idx) => {
            const trampGroup = new THREE.Group();
            trampGroup.position.copy(pos);

            // Bouncy Yellow Pad
            const padGeo = new THREE.CylinderGeometry(1.4, 1.4, 0.25, 24);
            const padMat = new THREE.MeshStandardMaterial({
                color: 0xEAB308, // Bright yellow
                roughness: 0.2,
                metalness: 0.1,
                emissive: 0x713F12,
                emissiveIntensity: 0.3
            });
            const padMesh = new THREE.Mesh(padGeo, padMat);
            padMesh.position.y = 0.3;
            trampGroup.add(padMesh);

            // Accordion Spring Base
            const springGeo = new THREE.CylinderGeometry(0.8, 1.0, 0.35, 12);
            const springMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.3 });
            const springMesh = new THREE.Mesh(springGeo, springMat);
            springMesh.position.y = 0.15;
            trampGroup.add(springMesh);

            this.scene.add(trampGroup);
            this.trampolines.push({ mesh: trampGroup, basePosition: pos.clone(), springMesh, cooldown: 0 });
        });

        // 3. Red Hazard Spikes
        const spikePositions = [
            new THREE.Vector3(2.5, 1.5, 30),
            new THREE.Vector3(-2.5, 1.5, 48),
            new THREE.Vector3(0, 2.0, 52),
        ];

        spikePositions.forEach((pos, idx) => {
            const spikeGroup = new THREE.Group();
            spikeGroup.position.copy(pos);

            // Cluster of 4 sharp red cones
            const coneGeo = new THREE.ConeGeometry(0.3, 0.9, 8);
            const coneMat = new THREE.MeshStandardMaterial({
                color: 0xDC2626, // Crimson red
                roughness: 0.3,
                metalness: 0.2,
                emissive: 0x7F1D1D,
                emissiveIntensity: 0.6
            });

            const offsets = [
                { x: -0.3, z: -0.3 },
                { x: 0.3, z: -0.3 },
                { x: -0.3, z: 0.3 },
                { x: 0.3, z: 0.3 }
            ];

            offsets.forEach(off => {
                const cone = new THREE.Mesh(coneGeo, coneMat);
                cone.position.set(off.x, 0.45, off.z);
                spikeGroup.add(cone);
            });

            this.scene.add(spikeGroup);
            this.spikes.push({ mesh: spikeGroup, position: pos });
        });

        // 4. Swirling Green Exit Portal
        const portalGroup = new THREE.Group();
        portalGroup.position.set(0, 3.5, 90);

        const archGeo = new THREE.TorusGeometry(2.0, 0.25, 16, 32, Math.PI);
        const archMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.6 });
        const archMesh = new THREE.Mesh(archGeo, archMat);
        portalGroup.add(archMesh);

        // Swirling Energy Disk
        const portalDiskGeo = new THREE.CircleGeometry(1.8, 32);
        const portalDiskMat = new THREE.MeshBasicMaterial({
            color: 0xEF4444, // Red (locked) initially
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7
        });
        const portalDisk = new THREE.Mesh(portalDiskGeo, portalDiskMat);
        portalDisk.name = 'portal_energy_disk';
        portalGroup.add(portalDisk);

        const portalLight = new THREE.PointLight(0xEF4444, 2, 8);
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

        // 1. Golden Hoops: rotate & check pass-through
        this.rings.forEach(ring => {
            if (!ring.collected) {
                ring.mesh.rotation.y += deltaTime * 2.0;

                // Check distance
                if (playerPos.distanceTo(ring.mesh.position) < 1.4) {
                    ring.collected = true;
                    this.ringsCollected++;
                    this.playChime();

                    // Turn ring glowing emerald green
                    (ring.mesh.material as THREE.MeshStandardMaterial).color.setHex(0x10B981);
                    (ring.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x059669);
                    ring.light.color.setHex(0x10B981);

                    // Update HUD
                    if (this.ringsDisplay) {
                        this.ringsDisplay.innerText = `🟡 Rings: ${this.ringsCollected} / ${this.totalRings}`;
                    }

                    // Check if all rings cleared to unlock portal
                    if (this.ringsCollected >= this.totalRings && this.exitPortal && !this.exitPortal.unlocked) {
                        this.exitPortal.unlocked = true;
                        const disk = this.exitPortal.group.getObjectByName('portal_energy_disk') as THREE.Mesh;
                        if (disk) {
                            (disk.material as THREE.MeshBasicMaterial).color.setHex(0x10B981); // Emerald green
                        }
                        this.exitPortal.light.color.setHex(0x10B981);
                        this.playVictory();
                        if (this.ringsDisplay) {
                            this.ringsDisplay.innerText = `🟢 PORTAL UNLOCKED! Run to Exit!`;
                        }
                    }
                }
            }
        });

        // 2. Trampolines: super bounce
        this.trampolines.forEach(tramp => {
            if (tramp.cooldown > 0) {
                tramp.cooldown -= deltaTime;
            }

            const dist = playerPos.distanceTo(tramp.basePosition);
            if (dist < 1.5 && tramp.cooldown <= 0) {
                tramp.cooldown = 0.5;
                this.playBoing();

                // Apply super vertical launch impulse (+18.0 m/s)
                if (this.playerController?.getMovementSystem) {
                    const moveSys = this.playerController.getMovementSystem();
                    if (typeof moveSys.jump === 'function') {
                        moveSys.jump(18.0);
                    }
                }

                // Bounce spring visual compression
                tramp.mesh.scale.set(1.2, 0.4, 1.2);
                setTimeout(() => {
                    tramp.mesh.scale.set(1.0, 1.0, 1.0);
                }, 120);
            }
        });

        // 3. Spikes: touch detection & respawn
        this.spikes.forEach(spike => {
            const dist = playerPos.distanceTo(spike.position);
            if (dist < 1.2) {
                this.playPop();
                // Checkpoint respawn
                this.player.position.copy(this.spawnCheckpoint);
                if (this.playerController?.regroundCharacter) {
                    this.playerController.regroundCharacter(1.0);
                }
            }
        });

        // 4. Exit Portal: victory trigger
        if (this.exitPortal && this.exitPortal.unlocked && !this.isWon) {
            const dist = playerPos.distanceTo(this.exitPortal.group.position);
            if (dist < 2.0) {
                this.isWon = true;
                this.playVictory();
                this.showVictoryScreen();
            }
        }
    }

    private updateTimerDisplay(): void {
        if (!this.timerDisplay) return;
        const mins = Math.floor(this.gameTime / 60);
        const secs = (this.gameTime % 60).toFixed(1);
        this.timerDisplay.innerText = `⏱️ ${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`;
    }

    private showVictoryScreen(): void {
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '50%';
        modal.style.left = '50%';
        modal.style.transform = 'translate(-50%, -50%)';
        modal.style.background = 'rgba(15, 23, 42, 0.95)';
        modal.style.border = '3px solid #10B981';
        modal.style.borderRadius = '20px';
        modal.style.padding = '32px 48px';
        modal.style.textAlign = 'center';
        modal.style.color = '#FFFFFF';
        modal.style.zIndex = '100000';
        modal.style.boxShadow = '0 0 40px rgba(16, 185, 129, 0.5)';
        modal.style.fontFamily = 'system-ui, sans-serif';

        const mins = Math.floor(this.gameTime / 60);
        const secs = (this.gameTime % 60).toFixed(2);

        modal.innerHTML = `
            <h1 style="font-size: 38px; color: #10B981; margin-bottom: 12px;">🏆 STAGE CLEAR! 🏆</h1>
            <p style="font-size: 20px; color: #94A3B8; margin-bottom: 16px;">Nokia Bounce 3D Reborn</p>
            <p style="font-size: 26px; color: #FBBF24; font-weight: bold; margin-bottom: 24px;">Clear Time: ${mins}m ${secs}s</p>
            <p style="font-size: 16px; color: #38BDF8;">Telia x Strawberry Co-Op Record</p>
        `;
        document.body.appendChild(modal);
    }
}

# 📝 Master Prompt Library: Bounce 3D (AWS & Bitmagic)

Since AWS is providing **unlimited AI credits/tokens**, use these hyper-detailed, pre-tested prompts to instruct Bitmagic and Claude Code with maximum precision.

---

## 0. Web Creator Fast-Track (`bitmagic.ai/creator`)

*As recommended by Ilmari (Bitmagic founder): "Ask for a few things at once and iterate on the design rather than typing your entire game in one prompt."*

### Step 1: Base Scene Selection
- In [bitmagic.ai/creator](https://bitmagic.ai/creator), start with a **3D Platformer / Obstacle / Rolling Ball** scene template.

### Iterative Prompt 1: Player & Ball Physics
```text
Make the player character a glossy candy-apple red sphere with rolling ball physics, realistic angular momentum, and a bouncy grounded jump. Attach a smooth third-person follow camera that tracks behind the ball.
```

### Iterative Prompt 2: Golden Hoops (Objective)
```text
Add 4 floating golden hoop rings (torus shapes) hovering above the track at jump height. When the ball passes through the center of a hoop, play a chime sound, trigger golden sparkle particles, turn the ring emerald green, and increase the score counter.
```

### Iterative Prompt 3: Trampolines & Spikes (Hazards & Mechanics)
```text
Add bright yellow rubber trampolines on springs that launch the red ball high into the air when touched. Add clusters of sharp red tetrahedral spikes that pop the ball and respawn it at the last checkpoint.
```

### Iterative Prompt 4: Exit Portal (Goal)
```text
Add a swirling green exit portal at the end of the course that remains locked until all golden rings are collected. Entering the portal triggers stage victory with confetti particles and shows the completion time.
```

### Iterative Prompt 5: Visual Polish & Atmosphere
```text
Set the environment to a vibrant sunny skybox with floating low-poly cumulus clouds. Make the track a sky-blue and white checkerboard pattern with soft drop shadows and golden ring bloom.
```

---

## 1. World & Level Generation (`bitmagic forge`)

### Level 1: Sunny Foothills (Onboarding & Nostalgia)
```text
bitmagic forge "A vibrant 3D floating obstacle course inspired by Nokia Bounce. Style: low-poly flat-shaded geometric floating tracks in sky-blue and cloud-white checkerboard. In the level, place:
1. A rolling candy-apple red glossy sphere as the player start point.
2. Four large floating golden hoop rings (torus shapes) hovering above the track at jump height.
3. Two bright yellow rubber trampoline pads on accordion springs.
4. Three small clusters of menacing red tetrahedral spike pyramids as hazards.
5. A green swirling energy portal at the finish line that unlocks after hoops are cleared.
Environment: crystal-clear blue sky with fluffy low-poly cumulus clouds and warm sunlight."
```

### Level 2: Cyberpunk Spire (Verticality & High Energy)
```text
bitmagic forge "An advanced vertical 3D platformer course set at twilight. Dark stone floating pathways illuminated by cyan and magenta neon edge strips. The course features:
1. Six floating golden hoop rings placed along narrow curving bridges.
2. Moving red spike obstacles that slide back and forth across pathways.
3. Super-bounce yellow trampolines requiring high-altitude leaps across an energy chasm.
4. An air pump station that inflates the ball into a giant beach ball to float across a glowing liquid pool.
5. Glowing finish portal at the highest tower summit.
Atmosphere: Deep violet and dark blue evening sky with floating glowing embers."
```

---

## 2. Claude Code Instructions (`bitmagic event claude`)

### Prompt A: Physics & Ball Controller
```text
Enhance the player ball controller in src/work/:
1. Ensure the player entity is a glossy red sphere with radius 0.5.
2. Apply rolling torque in the direction of input (WASD or mobile stick) with max speed 12 m/s.
3. Set restitution (bounciness) to 0.65 and dynamic friction to 0.4 on the Rapier rigid body.
4. Enable Continuous Collision Detection (CCD) to prevent the ball from clipping through thin floors at high speeds.
5. Implement jump impulse (+7.5 m/s upward) when the ball is touching the ground.
6. Add subtle squash-and-stretch scale animation upon landing hard impacts.
```

### Prompt B: Golden Hoop Detection & Progress
```text
Implement the Golden Hoop collectible system:
1. Each hoop is a golden torus with a trigger volume sensor inside its inner radius.
2. When the player ball enters the hoop volume from one side and exits the other, trigger HOOP_COLLECTED:
   - Play a bright chime sound effect (pitch: high C).
   - Emit a burst of 15 gold sparkle particles.
   - Change the hoop material from metallic gold to glowing emerald green.
   - Disable further trigger detection on this hoop.
   - Increment the collected hoops counter in the game state.
3. When collected hoops == total hoops in the level, play a gate-unlocked fanfare and turn the exit portal from red (locked) to green (open).
```

### Prompt C: Super Trampolines & Red Spikes
```text
Implement Trampoline and Spike interactions:
1. Yellow Trampolines:
   - When the ball touches the top surface of a trampoline pad, zero out negative Y velocity and apply an immediate upward impulse of +16.0 m/s.
   - Animate the pad compressing down 50% on the Y-axis for 80ms and springing back up.
   - Play a classic spring boing sound.
2. Red Spike Hazards:
   - When the ball makes contact with any spike mesh, trigger BALL_POP:
     - Set ball mesh visibility to false.
     - Spawn 10 red fragment particles bursting outward with gravity.
     - Play a crisp cartoon balloon pop sound.
     - Freeze input for 0.6s, then respawn the ball at the last safe checkpoint platform with zero velocity.
```

### Prompt D: Mobile Touch Controls (Phone Parity)
```text
Ensure full mobile touch parity for smartphone browsers:
1. If touch is detected or on mobile platform:
   - Render a semi-transparent floating virtual analog joystick on the bottom-left half of the screen for rolling direction.
   - Render a large round 'BOUNCE' tap button on the bottom-right for jumping.
2. Clamp camera pitch and ensure touch swipes on the right screen rotate the follow camera smoothly.
```

---

## 3. Visuals & Trailer Generation

### Cover Art Generation (`bitmagic cover`)
```zsh
bitmagic cover
```
*(Bitmagic automatically reads `GAME-DESIGN.md` and generates a stylized 3D Nokia Bounce render with the red ball leaping through a golden hoop over a floating island!)*

### 60-Second Trailer Generation (`bitmagic trailer make`)
```zsh
bitmagic trailer make \
  --music-prompt "classic 2000s Nokia ringtone reimagined as high energy French electro house and retro chiptune beat" \
  --title "Bounce 3D" \
  --publish
```

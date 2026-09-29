# 🚀 Master Agent Prompt: Bounce 3D

Copy and pass this complete instruction set directly to Claude Code (`bitmagic event claude`) once your project is scaffolded at the hackathon:

```text
You are the Lead Systems Architect building Bounce 3D based on GAME-DESIGN.md.

Follow these high-level architectural directives:

1. ENTITY ARCHITECTURE & PLAYER:
   - Configure the player character as a high-gloss candy-apple red sphere with realistic rolling traction and physics momentum.
   - Implement smooth grounded jumping and enable Continuous Collision Detection (CCD) on the rigid body to ensure the ball never tunnels through thin platforms at high velocity.
   - Add responsive follow-camera tracking that smoothly orbits behind the ball's movement vector.

2. OBJECTIVES & INTERACTION SYSTEMS:
   - Create golden hoop triggers: floating golden rings that detect when the player ball passes through their center.
   - When a hoop is cleared, play a bright chime sound effect, trigger a burst of golden sparkle particles, shift the hoop material to radiant emerald green, and advance the level's hoop counter.
   - Place yellow rubber trampoline pads that compress on impact and launch the ball upward with amplified vertical force.
   - Place red pyramid spike clusters that pop the ball on contact, emitting fragment particles and triggering a rapid 0.6s checkpoint respawn.
   - Implement an exit portal gate that remains locked until all hoops in the stage are collected.

3. MOBILE & DESKTOP PARITY:
   - Ensure full input parity: support WASD/Arrow keys on desktop, and automatically render dynamic virtual touch controls (left thumb analog stick, right thumb bounce button) when accessed on mobile browsers.

4. JUICE & POLISH:
   - Add impact audio effects for bounces, spring pads, and ring collections using Web Audio API.
   - Maintain solid 60 FPS performance on WebGL/WebGPU.
```

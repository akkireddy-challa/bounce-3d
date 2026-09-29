# Build plan — Bounce 3D: Skyward Run

## Genre / archetype

Third-person 3D platformer and time trial. The player rolls a red ball through a linear, readable series of floating islands, collecting gold hoops and reaching a portal.

Recipe read: `engine/agent-docs/mechanic-platformer.md`.

## Contract from the recipe

- Third-person follow camera and an embodied ball player.
- A single designed course with checkpoints, hazards, collectables and a clear goal.
- The player respawns instantly at the latest checkpoint after falling or touching spikes.

## Platform

Desktop primary. The retry action is already paired to `R` and a mobile button for future phone parity.

## Production slice

- Core verb: roll, jump and take spring-pad arcs across connected floating islands.
- Win: collect five hoops and enter the glowing portal.
- Lose: touch crystal spikes or fall; respawn at the current checkpoint.
- Feedback: hoop count, score, timer, checkpoint and victory messaging.
- Level: a forged low-poly platformer route based on the accepted reference image: grass-topped stone islands, a continuous readable route, gold hoops, spring pads, red crystals and a prominent cyan-magenta portal.
- Physics: the red ball visual is aligned to the physics body’s grounded contact point; spring pads launch onto the next valid landing surface.

## Deferred after this pass

1. Three-life mode and a formal lives HUD.
2. Optional alternate high-risk routes with bonus hoops.
3. A second forged course and level-select flow.

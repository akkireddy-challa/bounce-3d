# Game design

Written from `bitmagic init --idea`. Keep it current as the game changes — `bitmagic cover` reads this file.

## Pitch

Nokia Bounce 3D is a physics-driven 3D platformer where players guide an iconic high-gloss red rubber sphere across floating island courses, leaping through golden hoop rings, bouncing high on yellow trampolines, dodging deadly hazard spikes, and speeding to the swirling exit portal.

## Core loop

- **Roll & Momentum**: Roll and steer the bouncy red sphere across floating platforms with responsive momentum physics.
- **Collect Golden Hoops**: Navigate jumping arcs and ramps to leap through 5 floating golden hoops, triggering melodic chimes.
- **Rubber Trampoline Launches**: Hit spring-loaded yellow bounce pads to gain massive vertical airtime to reach elevated ledges.
- **Hazard Navigation**: Dodge sharp red crystal spikes; collisions instantly pop the ball and trigger checkpoint respawns.
- **Exit Portal Speedrun**: Unlock the swirling dimensional portal once all 5 hoops are collected, completing the stage with a personal speedrun record.

## World & look

A sunny, cheerful arcade dreamscape of floating green island platforms with stone borders suspended in a bright turquoise sky with fluffy stylized low-poly clouds. Floating golden rings gleam with metallic specular highlights. Vibrant yellow trampolines with visible steel accordion springs. Red geometric crystal spikes warn of peril. A magical swirling cyan-magenta vortex portal marks the victory destination.

## Art direction

Stylized low-poly arcade aesthetic: flat-shaded polygon meshes with clean facets, vibrant saturated color blocking (candy red, sunburst yellow, lustrous gold, emerald green, and sky cyan), and hard faceted edges. Nostalgic early-2000s retro mobile gaming meets modern WebGL 3D physics. Specular highlights and bouncy tactile surfaces evoke polished toy-like charm.

## Win / lose

- **Win**: Collect all 5 floating golden hoop rings and cross into the swirling dimensional exit portal. The victory fanfare sounds and final speedrun time is displayed.
- **Lose / Hazard**: Striking red hazard spikes or falling off the floating platform edges pops the ball with a cartoon sound effect and respawns the player at the beginning of the obstacle course.

## Credits & Team
- **Game Jam**: AWS & Bitmagic Game Hackathon Stockholm 2026
- **Creators**: Akkireddy Challa (Telia) & Nishant Mattupalli (Strawberry)

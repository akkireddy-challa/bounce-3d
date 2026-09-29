# Claude Code Configuration for Bitmagic

@AGENTS.md

## Primary Operational Directives
1. Build clean, modular components inside `src/work/`.
2. Follow the game design guidelines specified in the active `GAME-DESIGN.md`.
3. Never block the main thread; leverage Rapier physics colliders and triggers for all entity interactions.
4. When executing turns, always run `bitmagic reload` after modifying game code so the dev server updates automatically.

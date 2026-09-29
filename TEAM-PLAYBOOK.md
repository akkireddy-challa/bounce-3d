# 👥 2-Person Hackathon Co-Op Playbook: Bounce 3D

**Team**: Akkireddy Challa (Telia) & Co-Engineer (Strawberry)  
**Event**: AWS & Bitmagic Game Jam (17:00 – 21:00) @ AWS Stockholm  
**Target Outcome**: 1st Place Winner (Peer Vote + Judge Selection)  

---

## 🎯 1. Division of Responsibilities (Divide & Conquer)

To maximize your output in 4 hours, do not have both people looking at one terminal screen. Split your focus:

```
┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
│       AKKIREDDY (Systems Lead)       │     │     CO-ENGINEER (Design Lead)        │
│                                      │     │                                      │
│ • Bitmagic CLI & Claude Code Loops   │     │ • Level Choreography & Ring Layout   │
│ • Rapier Physics & Ball Controller   │     │ • Mobile Device Playtesting (iPhone) │
│ • Event Key & AWS Credit Management  │     │ • Sound & Particle Feedback Tuning   │
│ • Trailer Rendering & Web Publishing │     │ • QR Code Station & Live Leaderboard │
└──────────────────────────────────────┘     └──────────────────────────────────────┘
                   │                                            │
                   └────────────────────┬───────────────────────┘
                                        ▼
                     Unified Playable 3D Nokia Game!
```

---

## ⏱️ 2. Hour-by-Hour 4-Hour Execution Timeline

### 🕒 Phase 1: Registration, Key Unlock & Scaffolding (17:00 – 17:30)
- **17:00**: Check in at AWS Stockholm reception (Malmskillnadsgatan 36), grab your visitor badge and pizza.
- **17:10**: Open registered email, find the unique code from Ilmari / Bitmagic.
- **17:15**: In terminal, run:
  ```zsh
  cd /Users/akkireddy/Desktop/xplore/bitmagic-aws-hackathon
  bitmagic event setup --key=<YOUR_EMAIL_CODE>
  bitmagic event status
  ```
- **17:20**: Scaffold project:
  ```zsh
  bitmagic init bounce-3d \
    --name="Bounce 3D" \
    --art-style=low-poly \
    --idea="3D rolling red ball platformer inspired by classic Nokia Bounce with golden hoop triggers, bouncy trampolines, and red spike hazards"
  cd bounce-3d
  ```
- **17:25**: Launch Claude Code and the live web server:
  - Tab 1: `bitmagic event claude`
  - Tab 2: `bitmagic dev` (Opens `http://localhost:3011`)

---

### 🕒 Phase 2: Level 1 & Core Ball Physics (17:30 – 18:30)
- **Akkireddy**:
  - Run `bitmagic forge` for Level 1 ("Sunny Foothills").
  - Use Claude Code to enforce continuous collision detection (CCD), rolling torque, and bounciness restitution (`0.65`).
  - Implement golden hoop collection trigger logic (ring lights up green + chime sound).
- **Co-Engineer**:
  - Test on your laptop / mobile browser.
  - Check: Does the ball roll smoothly? Is the camera follow-angle comfortable?
  - Verify that rolling through a hoop registers 100% of the time.

---

### 🕒 Phase 3: Trampolines, Spikes & Level 2 (18:30 – 19:15)
- **Akkireddy**:
  - Forge Level 2 ("Cyberpunk Spire") with elevated bridges and floating platforms.
  - Implement yellow rubber trampoline pads with upward impulse (`+16 m/s`).
  - Implement red spike hazard collision $\rightarrow$ pop particle explosion + 0.8s checkpoint respawn.
  - Connect exit portal unlock trigger (opens only when all hoops are collected).
- **Co-Engineer**:
  - Playtest Level 2 difficulty: Are the jumps fair? Are checkpoints forgiving?
  - Test mobile touch controls on phone (virtual joystick responsiveness).

---

### 🕒 Phase 4: Audio, Trailer & Polish (19:15 – 19:45)
- **19:15**: Sound effects polish:
  - Golden hoop chime (`ding!`)
  - Trampoline spring sound (`boing!`)
  - Spike pop sound (`pop!`)
  - Victory fanfare on reaching the exit portal.
- **19:30**: Generate official 60-second trailer:
  ```zsh
  bitmagic trailer record --seconds 60
  bitmagic trailer make --music-prompt "retro 8-bit chiptune mixed with modern synthwave driving beat" --title "Bounce 3D" --publish
  ```
- **19:40**: Build & Publish to public URL:
  ```zsh
  bitmagic publish
  ```
  *(Copy the generated public play link, e.g. `https://bitmagic.ai/play/bounce-3d`)*

---

### 🕒 Phase 5: The QR Code Showcase & Peer Voting Blitz (19:45 – 21:00)
- **19:45**: Generate the high-contrast QR code for your laptop screen:
  ```zsh
  npx qrcode "https://bitmagic.ai/play/bounce-3d" -o qr.png
  ```
- **19:50**: Launch the full-screen spectator station on your laptop:
  - Open `QR-SHOWCASE.html` with your QR code displayed in full glory.
  - Display the Live Leaderboard table on screen.
- **20:00 – 21:00 (The Voting Window)**:
  - Walk up to attendees and judges holding your phone or directing them to your laptop screen:
    > *"Hey! Remember playing Bounce on your old Nokia 3310? We brought it back in full 3D! Point your camera at this QR code to play right now on your phone!"*
  - Watch them play, laugh, and compete for the top speedrun time on your leaderboard.
  - When voting opens, remind them: *"Vote for Bounce 3D in the ballot!"* 🏆

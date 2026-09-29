# 🔴 Bounce 3D: Reimagined for the Modern Web & Mobile

[![CI Pipeline](https://github.com/akkireddy-challa/bounce-3d/actions/workflows/ci.yml/badge.svg)](https://github.com/akkireddy-challa/bounce-3d/actions/workflows/ci.yml)
[![Pages Deployment](https://github.com/akkireddy-challa/bounce-3d/actions/workflows/deploy.yml/badge.svg)](https://github.com/akkireddy-challa/bounce-3d/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Powered by Bitmagic](https://img.shields.io/badge/Powered%20by-Bitmagic%20Engine-purple.svg)](https://bitmagic.gg)
[![AWS Hackathon](https://img.shields.io/badge/AWS-Stockholm%20Game%20Jam-FF9900?logo=amazon-aws&logoColor=white)](https://aws.amazon.com)
[![Claude Code](https://img.shields.io/badge/AI%20Agent-Claude%20Code%203.5-blueviolet)](https://claude.ai)

> **"The red ball is back — in full 3D physics, real-time lighting, and mobile-first speed."**  
> An open-source, agentic recreation of the classic Nokia Bounce game, engineered for the **AWS & Bitmagic Game Jam** (Stockholm, Sep 29, 2026).

---

## 🌟 Overview & Nostalgia Hook

In 2001, hundreds of millions of players worldwide were captivated by the red rubber ball navigating labyrinthine brick platforms, dodging deadly triangular spikes, and squeezing through golden hoops on monochrome and early color Nokia phones.

**Bounce 3D** brings that iconic experience into 2026:
- 🌐 **Full 3D Real-Time Physics**: Smooth rolling, momentum preservation, dynamic angular velocity, and arcade bounce impulse.
- 📱 **Zero-Install Mobile Spectator Play**: Scan a QR code from any smartphone (iOS / Android) and immediately jump into the level with responsive on-screen virtual joysticks and haptic cues.
- ⚡ **Autonomous Agent Scaffolding**: Built from the ground up to pair with **Claude Code** and **Bitmagic CLI**, leveraging unlimited AWS credits to iteratively refine levels, shaders, audio synth, and obstacle courses.
- 🏆 **Crowd Voting & Speedrun Arena**: Integrated dual-screen spectator showcase (`QR-SHOWCASE.html`) with real-time leaderboard and live room code routing.

---

## 🎮 Gameplay Mechanics & Features

| Mechanic | Classic Nokia Bounce (2001) | Bounce 3D (2026 Engine) |
| :--- | :--- | :--- |
| **Perspective** | 2D Tilemap Side-scroller | 3D Over-the-shoulder Isometric / Dynamic Chasing Camera |
| **Physics** | Fixed-step 2D velocity | Rigid-body sphere physics with angular damping, gravity scaling, CCD |
| **Golden Hoops** | Static 2D sprites | Rotating 3D toruses with emissive particle bursts upon ring-pass |
| **Rubber Trampolines** | Flat trigger zones | Physical bounce pads transferring dynamic vertical impulse $\vec{J}_y$ |
| **Spikes & Hazards** | Instant static kill | Kinetic obstacle meshes, rotating spiked pendulums, laser barriers |
| **Air Pumps (Scale)** | 2-state sprite swap | Dynamic mesh inflation/deflation altering mass, buoyancy, and friction |
| **Platform Parity** | Symbian OS / J2ME | WebGL / WebGPU (Browser) + Instant iOS / Android PWA or Native App |

---

## 📂 Repository Structure

```tree
bounce-3d/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md          # Structured bug report template
│   │   └── feature_request.md     # Feature submission template
│   ├── workflows/
│   │   ├── ci.yml                 # Automated CLI validation & architecture check
│   │   └── deploy.yml             # GitHub Pages automated spectator showcase deployment
│   └── pull_request_template.md   # Standard PR checklist for game assets and code
├── GAME-DESIGN.md                 # Complete 3D Nokia Bounce mechanics & level flow
├── AGENT-PROMPT.md                # Master prompt for Claude Code + Bitmagic
├── PROMPTS.md                     # Deep prompt library for level generation & physics tuning
├── AGENTS.md                      # Production agent instructions & engineering rules
├── CLAUDE.md                      # Claude Code project entrypoint (@AGENTS.md)
├── SPEC.md                        # Physics formulas, collision matrices, & camera specs
├── TEAM-PLAYBOOK.md               # 2-person co-op role split & 4-hour hackathon execution timeline
├── QR-SHOWCASE.html               # Dual-screen spectator display with animated canvas & QR generator
├── CONTRIBUTING.md                # Open-source contribution guidelines
├── CODE_OF_CONDUCT.md             # Contributor Covenant v2.1
├── SECURITY.md                    # Security vulnerability reporting policy
├── LICENSE                        # Permissive MIT License
└── README.md                      # Project documentation (this file)
```

---

## 🚀 Quickstart & Setup Guide

### 1. Prerequisites
Ensure you have the following installed on macOS / Linux:
```bash
# Verify Node.js (v20+) and Bitmagic CLI
node -v
bitmagic --version

# Verify Claude Code
claude --version
```

If Bitmagic CLI is not installed:
```bash
npm install -g @bitmagic/cli
```

### 2. Hackathon Event Activation (AWS Unlimited Credits)
During the hackathon kick-off at AWS Stockholm, activate your event pass:
```bash
# 1. Setup your event key provided by the organizers
bitmagic event setup --key=<YOUR_EVENT_KEY>

# 2. Launch Claude Code with unlimited AWS credits injected
bitmagic event claude
```

### 3. Launching Game Generation with AI Agents
Feed the master Bounce 3D prompt to Claude Code:
```bash
# In Claude Code session:
claude "Read @AGENT-PROMPT.md and execute Phase 1: Core Physics & Camera"
```

### 4. Running the Spectator Screen & Mobile Play
Open the standalone spectator portal in any browser:
```bash
# Start a lightweight local static server
npx serve . -p 8080
```
- Open `http://localhost:8080/QR-SHOWCASE.html` on your laptop or projector screen.
- Judges and audience members scan the generated QR code from their mobile phones to play live!

---

## 👥 Hackathon Team & Story

Built by two passionate engineers in Stockholm:
- **Akkireddy Challa** ([@akkireddy-challa](https://github.com/akkireddy-challa)) — Data & AI Platform Engineer at **Telia**. Overseeing CLI orchestration, agent directives, physics CCD, and continuous integration.
- **Co-Builder & Friend** — Data & Infrastructure Engineer at **Strawberry Hotels**. Driving level design, game pacing, haptic feedback tuning, and mobile UX testing.

Together, bringing the nostalgia of Nordic mobile gaming history into the agentic AI era.

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details. Built with pride for the global developer and gaming community.

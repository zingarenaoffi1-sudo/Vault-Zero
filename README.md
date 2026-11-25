# VAULT ZERO — Daily 3D Psychological Heist

**VAULT ZERO** is a daily 3D psychological crowd-reading heist game built for **Reddit's Game of the Day Hackathon** (Devvit Web / Interactive Posts).

Every day at **00:00 UTC**, a fresh deterministically seeded 3-round vault chamber unlocks for the entire community. Outsmart the crowd across 3 fast, high-stakes rounds, plant a single bluffing Decoy beacon, dodge the overcrowd detonation, and face a final **Split or Steal** showdown.

---

## Core Daily Loop (3 Rounds · ~60 Seconds)

1. **Round 1 — Overcrowd Fuse (5 Vaults)**
   Pick one of 5 armored vaults (`150g` – `1,500g`). The most crowded vault detonates for `0g`. Quieter safe vaults award a higher scarcity multiplier.
2. **Round 2 — Daily Rotating Twist (5 Vaults)**
   Rotates deterministically each day:
   - **Double or Dead:** One vault pays `2x` gold, tempting the herd into an overcrowd trap.
   - **Reverse Fuse:** The *2nd-most* crowded vault explodes — the biggest crowd survives.
   - **Dual Detonator:** The *top two* most crowded vaults both detonate.
3. **Round 3 — Split or Steal Finale (3 Vaults)**
   The most crowded vault still blows. Inside a surviving vault, choose **SPLIT** for a clean extraction or **STEAL** for `1.85x` bullion — if too many players get greedy in that vault, deadbolts jam for `0g`.
4. **One Decoy Beacon Per Heist**
   Drop 1 holographic decoy on any Round 1 or Round 2 vault to spike live pressure gauges and bluff other players into overloading it.

---

## Reddit-Native Features

- **1 Official Ranked Attempt Per Day:** Official daily runs lock your daily haul, streak, and leaderboard entry (mid-run restarts are disabled during ranked runs). Unranked Replays, 7-Day Past Archive, and Practice Runs let players keep playing without polluting live daily crowd tallies.
- **Spoiler-Safe Comment Share Card:** 1-click copy generates a Reddit markdown summary with vault letters hidden behind native `>!spoiler!<` tags so players can debate outcomes in the post comments without spoiling the day's chamber.
- **Role Flair Archetypes:** Earn daily titles (`Vault King`, `Lone Wolf`, `Cold Bluffer`, `Safe Tactician`, `Chaos Gremlin`, `Crowd Victim`).
- **Live UTC Countdown & Daily Streaks:** Displays a live countdown to the next UTC chamber unlock.
- **Devvit Web CSP Compliant:** All fonts (`Barlow Condensed`, `Plus Jakarta Sans`, `JetBrains Mono`) and textures are 100% self-hosted and procedurally generated with zero external client network requests.
- **Graceful Hardware Fallback:** Full Three.js 3D chamber with automatic 2D architectural fallback if WebGL is unavailable, plus responsive framing for inline Reddit feed posts (`640x512`) and mobile (`390x844`).

---

## Controls

| Action | Mouse / Touch | Keyboard |
| --- | --- | --- |
| Select Vault | Click/Tap 3D vault door or dock card | `1` – `5` |
| Arm / Plant Decoy | Click `Plant Decoy` then vault | `D` |
| Round 3 Split / Steal | Click `SPLIT` / `STEAL` toggle | `S` / `T` |
| Lock In / Next Round | Click `Lock In Vault` / `Next` | `Enter` or `Space` |
| Hide / Show Controls | Click `Hide Controls` tab | `H` |
| Pause / Mute / Restart* | HUD buttons | `P` / `M` / `R` (*unranked only) |

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Three.js (procedural canvas textures, instanced zero-GC particle pool, WebAudio procedural foley), `@fontsource/*` self-hosted fonts
- **Backend / Devvit Ready:** Express + `ws` (standalone preview) with drop-in Devvit Web `redis` + `realtime` adapter guide in [`DEVVIT_DEPLOY.md`](./DEVVIT_DEPLOY.md)
- **Verification:** Deterministic core game engine unit tests via `node:test` (`src/game/heistEngine.test.ts`)

---

## Running Locally

```bash
npm install
npm run dev          # Starts Express + Vite + WS on http://localhost:3000
npm run build        # Production Vite bundle (zero external CDN dependencies)
npx tsx --test src/game/heistEngine.test.ts
```

For zero-local-install deployment to Reddit via GitHub Codespaces & Devvit Web, see [`DEVVIT_DEPLOY.md`](./DEVVIT_DEPLOY.md).

# Deploying VAULT ZERO to Reddit (Devvit Web) via GitHub Codespaces

You do **not** need Node.js 22 installed locally (works from Windows 7 via browser). Follow these exact steps:

---

## 1. Push Project to GitHub & Open Free Codespace

1. Push this repository (including `README.md`, `src/`, `index.html`, `package.json`, `vite.config.ts`) to GitHub.
2. Click **`<> Code`** → **`Codespaces`** → **`Create codespace on main`**.
3. Wait ~30 seconds for the cloud Linux terminal (Node.js 22 pre-installed).

---

## 2. Log In to Reddit Developer Platform

```bash
npx devvit login --copy-paste
```

Open the URL printed in the terminal, approve Reddit access, and paste the verification code back.

---

## 3. Initialize Devvit Web App & Drop In VAULT ZERO

```bash
npm create devvit@latest vault-zero-reddit
# Pick: Web (React + Express / Vite) template
```

1. **Client (`src/client/`)**:
   - Copy `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/game/`, `src/three/`, `src/components/`, and `src/services/heistApi.ts` into the Devvit client folder.
   - Install client dependencies in the Devvit template:
     ```bash
     npm install three lucide-react @fontsource/barlow-condensed @fontsource/jetbrains-mono @fontsource/plus-jakarta-sans
     npm install -D @types/three
     ```
   - Notice `index.html` has **zero external `<link>` CDN tags** (100% compliant with Devvit Web Content Security Policy).
2. **Server (`src/server/`)**:
   - Devvit Web runs serverless endpoints — **do not run raw `ws` WebSockets on Devvit**.
   - Replace the in-memory `dayStates` Map from `server.ts` with Devvit's built-in `redis`, `realtime`, and `reddit` context:

```ts
import { context, redis, realtime, reddit } from '@devvit/web/server';
import {
  DECOY_CROWD_PULL,
  generateBaselineCrowd,
  generateDailyHeist,
  resolveRound,
} from '../shared/heistEngine';

// Example Devvit Web route: POST /api/heist/:date/resolve
app.post('/api/heist/:date/resolve', async (req, res) => {
  const dateStr = req.params.date;
  const username = (await reddit.getCurrentUsername()) ?? 'u/agent';
  const heist = generateDailyHeist(dateStr);
  const { roundNumber, chosenVaultIndex, decoyVaultIndex, pactChoice, ranked } = req.body;
  const round = heist.rounds[roundNumber - 1];
  const key = `heist:${dateStr}:r${roundNumber}:commits`;

  // Initialize deterministic baseline once per day in Redis
  const existing = await redis.hGetAll(key);
  const base = generateBaselineCrowd(dateStr, round);
  const counts = base.commits.map((v, i) => Number(existing[String(i)] ?? v));

  if (ranked !== false) {
    await redis.hIncrBy(key, String(chosenVaultIndex), 1);
    counts[chosenVaultIndex] += 1;
  } else {
    counts[chosenVaultIndex] += 1;
  }

  if (decoyVaultIndex !== null && decoyVaultIndex !== chosenVaultIndex) {
    counts[decoyVaultIndex] += DECOY_CROWD_PULL;
  }

  const resolution = resolveRound({
    round,
    chosenVaultIndex,
    decoyVaultIndex,
    pactChoice,
    crowdCounts: counts,
    stealRates: base.stealRates,
  });

  if (ranked !== false) {
    await realtime.send(`heist_${dateStr}_r${roundNumber}`, { type: 'radar:update', counts });
  }
  res.json({ resolution, username });
});
```

   - For **Daily Leaderboard**: use `redis.zAdd(\`heist:\${dateStr}:lb\`, { member: username, score: totalGold })` and `redis.zRange(..., 0, 7, { by: 'rank', reverse: true })`.
   - For **Reddit Username**: pass `?user=${username}` to the webview URL or return `username` from `GET /api/heist/:date`.

---

## 4. Upload Privately & Create Demo Post (Hackathon Rules!)

```bash
npx devvit upload
npx devvit playtest r/YourTestSubreddit
```

> **CRITICAL HACKATHON RULE:** Do **NOT** submit your app for public Reddit App Review/Publishing before judging ends! Keep it privately uploaded (`devvit upload`) and install it on a **public test subreddit** so judges can play immediately (if your test subreddit is private, install `dr-admin-approve` per official Devpost rules).

---

## 5. Devpost Submission Checklist (Deadline: Dec 8, 2026 · 6:00 PM PST)

- [ ] **Devvit App Link:** `https://developers.reddit.com/apps/{your-app-name}`
- [ ] **Live Demo Post Link:** Direct URL to the interactive post on your public test subreddit
- [ ] **Root `README.md`:** Included in repository root
- [ ] **Text Description:** Summary of the 3-round daily loop, decoy bluffing, and spoiler-free Reddit comment sharing
- [ ] **Short Gameplay Video (< 1 min, optional but strongly recommended)**

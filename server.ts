import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  DECOY_CROWD_PULL,
  generateBaselineCrowd,
  generateDailyHeist,
  getTodayDateStr,
  resolveRound,
} from './src/game/heistEngine';
import type {
  DailyHeist,
  LeaderboardEntry,
  LiveRadarSnapshot,
  PactChoice,
} from './src/game/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

interface DayServerState {
  heist: DailyHeist;
  /** Real authoritative round commit totals (baseline + every real player commit) */
  roundCommits: [number[], number[], number[]];
  /** Real authoritative steal tallies for Round 3 */
  r3StealVotes: number[];
  r3TotalVotes: number[];
  /** Live decoy counters per round */
  roundDecoys: [number[], number[], number[]];
  /** Daily leaderboard entries */
  leaderboard: LeaderboardEntry[];
  /** Rolling live event signals */
  recentSignals: Array<{ id: string; text: string; vaultIndex: number; kind: 'decoy' | 'lock' | 'join' }>;
}

interface ClientPresence {
  id: string;
  username: string;
  dateStr: string;
  roundNumber: 1 | 2 | 3;
  hoveredVault: number | null;
}

const MAX_CACHED_DAYS = 60;
const dayStates = new Map<string, DayServerState>();
const clients = new Map<WebSocket, ClientPresence>();
let signalCounter = 1;

function sanitizeDateStr(raw: unknown): string {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return getTodayDateStr();
  }
  const parts = raw.split('-').map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const d = parts[2] ?? 0;
  if (y < 2020 || y > 2035 || m < 1 || m > 12 || d < 1 || d > 31) {
    return getTodayDateStr();
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return getTodayDateStr();
  }
  return raw;
}

function getOrCreateDayState(dateStr: string): DayServerState {
  const existing = dayStates.get(dateStr);
  if (existing) return existing;

  const heist = generateDailyHeist(dateStr);
  const b1 = generateBaselineCrowd(dateStr, heist.rounds[0]);
  const b2 = generateBaselineCrowd(dateStr, heist.rounds[1]);
  const b3 = generateBaselineCrowd(dateStr, heist.rounds[2]);

  const r3TotalVotes = [...b3.commits];
  const r3StealVotes = b3.commits.map((count, i) => Math.round(count * (b3.stealRates[i] ?? 0.3)));

  const seededLeaders: LeaderboardEntry[] = [
    { username: 'u/brass_tactician', gold: 3420, archetype: 'Vault King' },
    { username: 'u/iron_consensus', gold: 2980, archetype: 'Lone Wolf' },
    { username: 'u/silent_tumbler', gold: 2610, archetype: 'Cold Bluffer' },
    { username: 'u/copper_fox', gold: 2140, archetype: 'Safe Tactician' },
    { username: 'u/velvet_alarm', gold: 1790, archetype: 'Chaos Gremlin' },
  ];

  const state: DayServerState = {
    heist,
    roundCommits: [b1.commits, b2.commits, b3.commits],
    r3StealVotes,
    r3TotalVotes,
    roundDecoys: [
      new Array<number>(heist.rounds[0].vaults.length).fill(0),
      new Array<number>(heist.rounds[1].vaults.length).fill(0),
      new Array<number>(heist.rounds[2].vaults.length).fill(0),
    ],
    leaderboard: seededLeaders,
    recentSignals: [
      {
        id: `sig-${signalCounter++}`,
        text: `${heist.curator} armed ${heist.codename}`,
        vaultIndex: 2,
        kind: 'join',
      },
    ],
  };

  if (dayStates.size >= MAX_CACHED_DAYS) {
    const oldestKey = dayStates.keys().next().value;
    if (oldestKey !== undefined) dayStates.delete(oldestKey);
  }
  dayStates.set(dateStr, state);
  return state;
}

function buildRadarSnapshot(dateStr: string, roundNumber: 1 | 2 | 3): LiveRadarSnapshot {
  const state = getOrCreateDayState(dateStr);
  const idx = (roundNumber - 1) as 0 | 1 | 2;
  const vaultCount = state.heist.rounds[idx].vaults.length;
  const hoverCounts = new Array<number>(vaultCount).fill(0);

  let onlineCount = 0;
  for (const presence of clients.values()) {
    if (presence.dateStr === dateStr) {
      onlineCount++;
      if (
        presence.roundNumber === roundNumber &&
        presence.hoveredVault !== null &&
        presence.hoveredVault >= 0 &&
        presence.hoveredVault < vaultCount
      ) {
        hoverCounts[presence.hoveredVault] = (hoverCounts[presence.hoveredVault] ?? 0) + 1;
      }
    }
  }

  return {
    onlineCount: Math.max(1, onlineCount),
    hoverCounts,
    decoyCounts: [...state.roundDecoys[idx]],
    dailyCommits: [...state.roundCommits[idx]],
    recentSignals: state.recentSignals.slice(-6),
  };
}

function broadcastRadar(dateStr: string, roundNumber: 1 | 2 | 3): void {
  const snapshot = buildRadarSnapshot(dateStr, roundNumber);
  const payload = JSON.stringify({
    type: 'radar:update',
    dateStr,
    roundNumber,
    snapshot,
  });

  for (const [ws, presence] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN && presence.dateStr === dateStr && presence.roundNumber === roundNumber) {
      ws.send(payload);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
    next(err);
  });

  // Suppress /favicon.ico 404 noise (inline SVG icon is embedded in index.html)
  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
  });

  // 1. Get daily heist definition + initial live crowd snapshots for all 3 rounds
  app.get('/api/heist/:date', (req, res) => {
    const rawDate = req.params.date === 'today' ? getTodayDateStr() : req.params.date;
    const validDate = sanitizeDateStr(rawDate);
    const state = getOrCreateDayState(validDate);
    const r1 = buildRadarSnapshot(validDate, 1);
    const r2 = buildRadarSnapshot(validDate, 2);
    const r3 = buildRadarSnapshot(validDate, 3);
    res.json({
      heist: state.heist,
      radar: r1,
      radars: [r1, r2, r3],
      leaderboard: state.leaderboard.slice(0, 8),
    });
  });

  // 2. Plant a Decoy beacon (mutates server state & broadcasts to all live WebSocket clients)
  app.post('/api/heist/:date/decoy', (req, res) => {
    const validDate = sanitizeDateStr(req.params.date);
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      roundNumber?: unknown;
      vaultIndex?: unknown;
      username?: unknown;
      ranked?: unknown;
    };

    const state = getOrCreateDayState(validDate);
    const rawRound = Number(body.roundNumber);
    if (!Number.isInteger(rawRound) || rawRound < 1 || rawRound > 3) {
      res.status(400).json({ error: 'Invalid roundNumber' });
      return;
    }
    const rIdx = (rawRound - 1) as 0 | 1 | 2;
    const round = state.heist.rounds[rIdx];
    const vIdx = typeof body.vaultIndex === 'number' ? body.vaultIndex : Number.NaN;
    if (!Number.isInteger(vIdx) || vIdx < 0 || vIdx >= round.vaults.length) {
      res.status(400).json({ error: 'Invalid vaultIndex' });
      return;
    }

    const roundNum = rawRound as 1 | 2 | 3;
    const isRanked = body.ranked !== false;
    if (isRanked) {
      const decoyArr = state.roundDecoys[rIdx];
      decoyArr[vIdx] = (decoyArr[vIdx] ?? 0) + 1;
      const cleanUser =
        typeof body.username === 'string' && body.username.trim()
          ? body.username.trim().slice(0, 24)
          : 'u/agent';
      const targetVault = round.vaults[vIdx];
      state.recentSignals.push({
        id: `sig-${signalCounter++}`,
        text: `${cleanUser} triggered heat ping near Vault ${targetVault?.code ?? 'A'}`,
        vaultIndex: vIdx,
        kind: 'decoy',
      });
      if (state.recentSignals.length > 20) state.recentSignals.shift();
      broadcastRadar(validDate, roundNum);
    }

    res.json({ ok: true, radar: buildRadarSnapshot(validDate, roundNum) });
  });

  // 3. Authoritative round lock-in & resolution
  app.post('/api/heist/:date/resolve', (req, res) => {
    const validDate = sanitizeDateStr(req.params.date);
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      roundNumber?: unknown;
      chosenVaultIndex?: unknown;
      decoyVaultIndex?: unknown;
      pactChoice?: unknown;
      username?: unknown;
      ranked?: unknown;
    };

    const state = getOrCreateDayState(validDate);
    const rawRound = Number(body.roundNumber);
    if (!Number.isInteger(rawRound) || rawRound < 1 || rawRound > 3) {
      res.status(400).json({ error: 'Invalid roundNumber' });
      return;
    }
    const rIdx = (rawRound - 1) as 0 | 1 | 2;
    const round = state.heist.rounds[rIdx];
    const vIdx = typeof body.chosenVaultIndex === 'number' ? body.chosenVaultIndex : Number.NaN;
    if (!Number.isInteger(vIdx) || vIdx < 0 || vIdx >= round.vaults.length) {
      res.status(400).json({ error: 'Invalid chosenVaultIndex' });
      return;
    }

    const safePact: PactChoice | null =
      body.pactChoice === 'split' || body.pactChoice === 'steal' ? body.pactChoice : null;
    const isRanked = body.ranked !== false;

    // Only ranked official attempts mutate the authoritative daily server tally (prevents replay spam manipulation)
    const commitsArr = state.roundCommits[rIdx];
    const effectiveCounts = [...commitsArr];
    if (isRanked) {
      commitsArr[vIdx] = (commitsArr[vIdx] ?? 0) + 1;
      effectiveCounts[vIdx] = commitsArr[vIdx] ?? 1;
      if (rIdx === 2) {
        state.r3TotalVotes[vIdx] = (state.r3TotalVotes[vIdx] ?? 0) + 1;
        if (safePact === 'steal') {
          state.r3StealVotes[vIdx] = (state.r3StealVotes[vIdx] ?? 0) + 1;
        }
      }
    } else {
      effectiveCounts[vIdx] = (effectiveCounts[vIdx] ?? 0) + 1;
    }

    // Decoy shifts real bluff heat onto the decoyed vault (+DECOY_CROWD_PULL crowd pull)
    const validDecoy =
      typeof body.decoyVaultIndex === 'number' &&
      Number.isInteger(body.decoyVaultIndex) &&
      body.decoyVaultIndex >= 0 &&
      body.decoyVaultIndex < round.vaults.length
        ? body.decoyVaultIndex
        : null;
    if (validDecoy !== null && validDecoy !== vIdx) {
      effectiveCounts[validDecoy] = (effectiveCounts[validDecoy] ?? 0) + DECOY_CROWD_PULL;
    }

    const stealRates = state.r3TotalVotes.map((tot, i) =>
      tot > 0 ? (state.r3StealVotes[i] ?? 0) / tot : 0.3
    );

    const resolution = resolveRound({
      round,
      chosenVaultIndex: vIdx,
      decoyVaultIndex: validDecoy,
      pactChoice: safePact,
      crowdCounts: effectiveCounts,
      stealRates,
    });

    const roundNum = rawRound as 1 | 2 | 3;
    if (isRanked) {
      const cleanUser =
        typeof body.username === 'string' && body.username.trim()
          ? body.username.trim().slice(0, 24)
          : 'u/agent';
      const chosenVault = round.vaults[vIdx];
      state.recentSignals.push({
        id: `sig-${signalCounter++}`,
        text: `${cleanUser} locked Vault ${chosenVault?.code ?? 'A'}`,
        vaultIndex: vIdx,
        kind: 'lock',
      });
      if (state.recentSignals.length > 20) state.recentSignals.shift();
      broadcastRadar(validDate, roundNum);
    }

    res.json({ resolution, radar: buildRadarSnapshot(validDate, roundNum) });
  });

  // 4. Submit final daily haul to server leaderboard
  app.post('/api/heist/:date/leaderboard', (req, res) => {
    const validDate = sanitizeDateStr(req.params.date);
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      username?: unknown;
      gold?: unknown;
      archetype?: unknown;
      ranked?: unknown;
    };
    const state = getOrCreateDayState(validDate);
    if (body.ranked === false) {
      res.json({ leaderboard: state.leaderboard.slice(0, 8) });
      return;
    }

    const cleanUser =
      typeof body.username === 'string' && body.username.trim()
        ? body.username.trim().slice(0, 24)
        : 'u/you';
    const safeGold = Math.max(0, Math.min(20000, Math.round(Number(body.gold) || 0)));
    const safeArch = typeof body.archetype === 'string' ? body.archetype.slice(0, 28) : 'Vault Agent';

    const existingIdx = state.leaderboard.findIndex((e) => e.username === cleanUser);
    const existingEntry = existingIdx >= 0 ? state.leaderboard[existingIdx] : undefined;
    if (!existingEntry) {
      // First official submission per user per day locks their daily leaderboard score
      state.leaderboard.push({ username: cleanUser, gold: safeGold, archetype: safeArch });
    }
    state.leaderboard.sort((a, b) => b.gold - a.gold);
    state.leaderboard = state.leaderboard.slice(0, 12);

    res.json({ leaderboard: state.leaderboard.slice(0, 8) });
  });

  // Catch-all JSON 404 for unknown /api routes
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  // Mount Vite middleware in development or static dist in production
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('error', () => {
    // Prevent unhandled WebSocketServer errors from crashing the process
  });

  wss.on('connection', (ws) => {
    const defaultDate = getTodayDateStr();
    const clientId = `c-${Math.random().toString(36).slice(2, 8)}`;
    clients.set(ws, {
      id: clientId,
      username: `u/agent_${clientId.slice(-3)}`,
      dateStr: defaultDate,
      roundNumber: 1,
      hoveredVault: null,
    });

    ws.on('error', () => {
      // Safely ignore abrupt socket resets
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as {
          type?: string;
          dateStr?: string;
          roundNumber?: 1 | 2 | 3;
          vaultIndex?: number | null;
          username?: string;
        };
        const presence = clients.get(ws);
        if (!presence) return;

        if (msg.type === 'room:join') {
          const prevDate = presence.dateStr;
          const prevRound = presence.roundNumber;
          const d = msg.dateStr ? sanitizeDateStr(msg.dateStr) : defaultDate;
          const r = msg.roundNumber === 2 || msg.roundNumber === 3 ? msg.roundNumber : 1;
          presence.dateStr = d;
          presence.roundNumber = r;
          if (msg.username) presence.username = msg.username.slice(0, 24);
          presence.hoveredVault = null;
          if (prevDate !== d || prevRound !== r) {
            broadcastRadar(prevDate, prevRound);
          }
          broadcastRadar(d, r);
        } else if (msg.type === 'radar:hover') {
          const prev = presence.hoveredVault;
          const next =
            typeof msg.vaultIndex === 'number' &&
            Number.isInteger(msg.vaultIndex) &&
            msg.vaultIndex >= 0 &&
            msg.vaultIndex < 5
              ? msg.vaultIndex
              : null;
          if (prev !== next) {
            presence.hoveredVault = next;
            broadcastRadar(presence.dateStr, presence.roundNumber);
          }
        }
      } catch {
        // ignore malformed frames
      }
    });

    ws.on('close', () => {
      const presence = clients.get(ws);
      clients.delete(ws);
      if (presence) {
        broadcastRadar(presence.dateStr, presence.roundNumber);
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`VAULT ZERO server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

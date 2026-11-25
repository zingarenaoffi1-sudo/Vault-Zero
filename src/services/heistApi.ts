import {
  DECOY_CROWD_PULL,
  generateBaselineCrowd,
  generateDailyHeist,
  getTodayDateStr,
  offsetDateStr,
  resolveRound,
} from '../game/heistEngine';
import type {
  DailyHeist,
  HeistSummary,
  LeaderboardEntry,
  LiveRadarSnapshot,
  PactChoice,
  PlayerProgress,
  RoundResolution,
} from '../game/types';

const STORAGE_KEY = 'vaultzero_progress_v1';
const USER_KEY = 'vaultzero_username_v1';

export type RoundRadarsTuple = [LiveRadarSnapshot, LiveRadarSnapshot, LiveRadarSnapshot];

export function buildFallbackRadars(heist: DailyHeist): RoundRadarsTuple {
  const makeSnapshot = (round: DailyHeist['rounds'][number]): LiveRadarSnapshot => {
    const base = generateBaselineCrowd(heist.dateStr, round);
    return {
      onlineCount: 1,
      hoverCounts: new Array<number>(round.vaults.length).fill(0),
      decoyCounts: new Array<number>(round.vaults.length).fill(0),
      dailyCommits: base.commits,
      recentSignals: [],
    };
  };
  return [
    makeSnapshot(heist.rounds[0]),
    makeSnapshot(heist.rounds[1]),
    makeSnapshot(heist.rounds[2]),
  ];
}

export function getPlayerUsername(): string {
  try {
    // Allow Devvit Web host wrapper to pass the authenticated Reddit username via ?user=
    const params = new URLSearchParams(window.location.search);
    const redditUser = params.get('user')?.trim();
    if (redditUser) {
      const normalized = redditUser.startsWith('u/') ? redditUser : `u/${redditUser}`;
      return normalized.slice(0, 24);
    }
    const saved = window.localStorage.getItem(USER_KEY);
    if (saved) return saved;
    const tag = `u/agent_${Math.floor(100 + Math.random() * 899)}`;
    window.localStorage.setItem(USER_KEY, tag);
    return tag;
  } catch {
    return 'u/agent_001';
  }
}

export function loadProgress(): PlayerProgress {
  const fallback: PlayerProgress = {
    streak: 0,
    bestStreak: 0,
    lastCompletedDate: null,
    bestHaul: 0,
    totalHeists: 0,
    completedDays: {},
  };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>;
    return {
      streak: Number(parsed.streak) || 0,
      bestStreak: Number(parsed.bestStreak) || 0,
      lastCompletedDate: parsed.lastCompletedDate ?? null,
      bestHaul: Number(parsed.bestHaul) || 0,
      totalHeists: Number(parsed.totalHeists) || 0,
      completedDays: parsed.completedDays ?? {},
    };
  } catch {
    return fallback;
  }
}

export function saveCompletedHeist(
  summary: HeistSummary,
  isDailyMode: boolean,
  recordArchive = isDailyMode
): PlayerProgress {
  const prev = loadProgress();
  const next: PlayerProgress = {
    ...prev,
    completedDays: { ...prev.completedDays },
  };

  const prevRecord = next.completedDays[summary.dateStr];
  const alreadyDoneThisDay = Boolean(prevRecord);
  if (isDailyMode && !alreadyDoneThisDay) {
    const yesterday = offsetDateStr(summary.dateStr, -1);
    const continuedStreak = prev.lastCompletedDate === yesterday ? prev.streak + 1 : 1;
    next.streak = continuedStreak;
    next.bestStreak = Math.max(prev.bestStreak, continuedStreak);
    next.lastCompletedDate = summary.dateStr;
    next.totalHeists = prev.totalHeists + 1;
    next.bestHaul = Math.max(prev.bestHaul, summary.totalGold);
    next.completedDays[summary.dateStr] = { ...summary, streak: continuedStreak };
  } else if (recordArchive && !alreadyDoneThisDay) {
    // Past archive day solved for the first time (does not alter today's daily streak)
    next.bestHaul = Math.max(prev.bestHaul, summary.totalGold);
    next.completedDays[summary.dateStr] = {
      ...summary,
      streak: next.streak,
    };
  }
  // Unranked replays and Practice runs never overwrite official locked daily scores or bestHaul

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota issues
  }
  return next;
}

export async function fetchDailyHeistBundle(dateStr: string): Promise<{
  heist: DailyHeist;
  radars: RoundRadarsTuple;
  leaderboard: LeaderboardEntry[];
}> {
  try {
    const res = await fetch(`/api/heist/${encodeURIComponent(dateStr)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      heist: DailyHeist;
      radar?: LiveRadarSnapshot;
      radars?: RoundRadarsTuple;
      leaderboard: LeaderboardEntry[];
    };
    const fallbackRadars = buildFallbackRadars(data.heist);
    const radars: RoundRadarsTuple =
      data.radars && data.radars.length === 3
        ? data.radars
        : [data.radar ?? fallbackRadars[0], fallbackRadars[1], fallbackRadars[2]];
    return {
      heist: data.heist,
      radars,
      leaderboard: data.leaderboard ?? [],
    };
  } catch {
    const heist = generateDailyHeist(dateStr);
    return {
      heist,
      radars: buildFallbackRadars(heist),
      leaderboard: [
        { username: 'u/brass_tactician', gold: 3420, archetype: 'Vault King' },
        { username: 'u/iron_consensus', gold: 2980, archetype: 'Lone Wolf' },
        { username: 'u/silent_tumbler', gold: 2610, archetype: 'Cold Bluffer' },
      ],
    };
  }
}

export async function plantDecoyOnServer(
  dateStr: string,
  roundNumber: 1 | 2 | 3,
  vaultIndex: number,
  username: string,
  ranked = true
): Promise<LiveRadarSnapshot | null> {
  try {
    const res = await fetch(`/api/heist/${encodeURIComponent(dateStr)}/decoy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundNumber, vaultIndex, username, ranked }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { radar: LiveRadarSnapshot };
    return data.radar;
  } catch {
    return null;
  }
}

export async function resolveRoundOnServer(params: {
  heist: DailyHeist;
  roundNumber: 1 | 2 | 3;
  chosenVaultIndex: number;
  decoyVaultIndex: number | null;
  pactChoice: PactChoice | null;
  username: string;
  ranked: boolean;
}): Promise<{ resolution: RoundResolution; radar: LiveRadarSnapshot | null }> {
  try {
    const res = await fetch(`/api/heist/${encodeURIComponent(params.heist.dateStr)}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roundNumber: params.roundNumber,
        chosenVaultIndex: params.chosenVaultIndex,
        decoyVaultIndex: params.decoyVaultIndex,
        pactChoice: params.pactChoice,
        username: params.username,
        ranked: params.ranked,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { resolution: RoundResolution; radar: LiveRadarSnapshot };
  } catch {
    const roundIdx = (params.roundNumber - 1) as 0 | 1 | 2;
    const round = params.heist.rounds[roundIdx];
    const base = generateBaselineCrowd(params.heist.dateStr, round);
    const counts = [...base.commits];
    counts[params.chosenVaultIndex] = (counts[params.chosenVaultIndex] ?? 0) + 1;
    if (params.decoyVaultIndex !== null && params.decoyVaultIndex !== params.chosenVaultIndex) {
      counts[params.decoyVaultIndex] = (counts[params.decoyVaultIndex] ?? 0) + DECOY_CROWD_PULL;
    }
    const resolution = resolveRound({
      round,
      chosenVaultIndex: params.chosenVaultIndex,
      decoyVaultIndex: params.decoyVaultIndex,
      pactChoice: params.pactChoice,
      crowdCounts: counts,
      stealRates: base.stealRates,
    });
    return { resolution, radar: null };
  }
}

export async function submitLeaderboardEntry(
  dateStr: string,
  username: string,
  gold: number,
  archetype: string,
  ranked = true
): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`/api/heist/${encodeURIComponent(dateStr)}/leaderboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, gold, archetype, ranked }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { leaderboard: LeaderboardEntry[] };
    return data.leaderboard;
  } catch {
    return [{ username, gold, archetype, isCurrentPlayer: true }];
  }
}

export class RadarSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private everConnected = false;
  private disposed = false;
  private currentRoom: { dateStr: string; roundNumber: 1 | 2 | 3; username: string } | null = null;
  private onUpdate: (dateStr: string, roundNumber: 1 | 2 | 3, snapshot: LiveRadarSnapshot) => void;

  constructor(
    onUpdate: (dateStr: string, roundNumber: 1 | 2 | 3, snapshot: LiveRadarSnapshot) => void
  ) {
    this.onUpdate = onUpdate;
  }

  public connect(dateStr: string, roundNumber: 1 | 2 | 3, username: string): void {
    this.currentRoom = { dateStr, roundNumber, username };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendJoin();
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return;
    }
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.openSocket();
  }

  private openSocket(): void {
    if (this.disposed || typeof window === 'undefined') return;
    if (this.reconnectAttempts >= 5) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.addEventListener('open', () => {
        this.everConnected = true;
        this.reconnectAttempts = 0;
        this.sendJoin();
      });

      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            type?: string;
            dateStr?: string;
            roundNumber?: 1 | 2 | 3;
            snapshot?: LiveRadarSnapshot;
          };
          if (msg.type === 'radar:update' && msg.snapshot && msg.dateStr && msg.roundNumber) {
            this.onUpdate(msg.dateStr, msg.roundNumber, msg.snapshot);
          }
        } catch {
          // ignore malformed messages
        }
      });

      ws.addEventListener('close', () => {
        if (this.ws === ws) this.ws = null;
        // If initial connection never succeeded (e.g. Devvit serverless host without raw WS), stay quiet instead of retrying
        if (!this.disposed && this.everConnected && this.reconnectAttempts < 5) {
          const delay = Math.min(20000, 2500 * Math.pow(2, this.reconnectAttempts));
          this.reconnectAttempts += 1;
          this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.openSocket();
          }, delay);
        }
      });

      ws.addEventListener('error', () => {
        ws.close();
      });
    } catch {
      // Fallback gracefully when WS cannot initialize
    }
  }

  private sendJoin(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.currentRoom) return;
    this.ws.send(
      JSON.stringify({
        type: 'room:join',
        ...this.currentRoom,
      })
    );
  }

  public sendHover(vaultIndex: number | null): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'radar:hover', vaultIndex }));
  }

  public dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export function getArchiveDates(count = 7): string[] {
  const today = getTodayDateStr();
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    dates.push(offsetDateStr(today, -i));
  }
  return dates;
}

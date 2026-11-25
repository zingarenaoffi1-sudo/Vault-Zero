export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type RoundPhase = 'selecting' | 'locking' | 'revealing';

export type RoundTwistType =
  | 'classic-overcrowd'
  | 'double-or-dead'
  | 'second-most-explodes'
  | 'dual-fuse'
  | 'split-or-steal';

export type PactChoice = 'split' | 'steal';

export interface VaultDef {
  /** 0-based index within the round (0..4 or 0..2) */
  index: number;
  /** Single-letter code: A, B, C, D, E */
  code: string;
  /** Label shown on brass plaque */
  name: string;
  /** Base bullion jackpot in gold */
  jackpot: number;
  /** Multiplier for special twist vaults (1 normally, 2 for Double-or-Dead) */
  multiplier: number;
  /** Accent tint hex for vault ring/signage */
  accentHex: string;
}

export interface RoundConfig {
  roundNumber: 1 | 2 | 3;
  title: string;
  ruleSummary: string;
  twist: RoundTwistType;
  durationSec: number;
  vaults: VaultDef[];
  /** Index of special 2x vault if twist === 'double-or-dead' */
  bonusVaultIndex: number | null;
}

export interface DailyHeist {
  id: string;
  dayNumber: number;
  dateStr: string;
  codename: string;
  curator: string;
  rounds: [RoundConfig, RoundConfig, RoundConfig];
}

export interface VaultCrowdState {
  vaultIndex: number;
  /** Total players committed today (server authoritative) */
  commits: number;
  /** Active live hovers + decoys on radar right now */
  radarHeat: number;
  /** Ratio 0..1 of steal votes in Round 3 */
  stealRate: number;
}

export interface RoundResolution {
  roundNumber: 1 | 2 | 3;
  chosenVaultIndex: number;
  decoyVaultIndex: number | null;
  pactChoice: PactChoice | null;
  explodedVaultIndices: number[];
  /** Percentage (0..100) of crowd in each vault */
  crowdShares: number[];
  /** Total crowd headcount in each vault */
  crowdCounts: number[];
  playerExploded: boolean;
  /** True if Round 3 Steal collided with other thieves */
  stealBusted: boolean;
  /** True if Round 3 Steal succeeded cleanly */
  stealJackpot: boolean;
  goldEarned: number;
  headline: string;
  subline: string;
}

export type ArchetypeId =
  | 'vault-king'
  | 'cold-bluffer'
  | 'lone-wolf'
  | 'chaos-gremlin'
  | 'safe-tactician'
  | 'crowd-victim';

export interface ArchetypeBadge {
  id: ArchetypeId;
  title: string;
  tagline: string;
  flairText: string;
}

export interface HeistSummary {
  heistId: string;
  dayNumber: number;
  dateStr: string;
  codename: string;
  totalGold: number;
  percentile: number;
  rounds: RoundResolution[];
  archetype: ArchetypeBadge;
  decoyUsedOn: { roundNumber: number; vaultCode: string } | null;
  streak: number;
  completedAt: string;
}

export interface PlayerProgress {
  streak: number;
  bestStreak: number;
  lastCompletedDate: string | null;
  bestHaul: number;
  totalHeists: number;
  completedDays: Record<string, HeistSummary>;
}

export interface LiveRadarSnapshot {
  onlineCount: number;
  /** Per-vault live hover counts */
  hoverCounts: number[];
  /** Per-vault active decoy beacons */
  decoyCounts: number[];
  /** Per-vault total daily commits so far */
  dailyCommits: number[];
  /** Recent live feed pulses (e.g. "u/fox_92 dropped a decoy on Vault E") */
  recentSignals: Array<{ id: string; text: string; vaultIndex: number; kind: 'decoy' | 'lock' | 'join' }>;
}

export interface LeaderboardEntry {
  username: string;
  gold: number;
  archetype: string;
  isCurrentPlayer?: boolean;
}

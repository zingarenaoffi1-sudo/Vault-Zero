import type {
  ArchetypeBadge,
  DailyHeist,
  HeistSummary,
  PactChoice,
  RoundConfig,
  RoundResolution,
  RoundTwistType,
  VaultDef,
} from './types';

const CODENAMES = [
  'Operation Glassjaw',
  'The Brass Meridian',
  'Midnight Bullion',
  'Iron Ledger',
  'Silent Combination',
  'Gilded Fuse',
  'Deadbolt Protocol',
  'Velvet Alarm',
  'Copper Syndicate',
  'Zero-Sum Reserve',
  'Redline Treasury',
  'Clockwork Vault',
];

const CURATORS = [
  'u/brass_tactician',
  'u/zero_sum_fox',
  'u/vault_architect',
  'u/midnight_ledger',
  'u/decoy_master',
  'u/iron_consensus',
  'u/gold_bluffer',
  'u/silent_tumbler',
];

const VAULT_CODES = ['A', 'B', 'C', 'D', 'E'] as const;
const VAULT_NAMES_5 = ['Teller', 'Ledger', 'Reserve', 'Bullion', 'Apex'] as const;
const VAULT_NAMES_3 = ['Safe', 'Treasury', 'Sovereign'] as const;
const VAULT_ACCENTS_5 = ['#60a5fa', '#34d399', '#f59e0b', '#fb923c', '#f43f5e'] as const;
const VAULT_ACCENTS_3 = ['#38bdf8', '#f59e0b', '#e63946'] as const;

/** Meaningful decoy crowd pull so planting a decoy can genuinely tip a close vault */
export const DECOY_CROWD_PULL = 12;

export function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getTodayDateStr(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function offsetDateStr(baseDateStr: string, deltaDays: number): string {
  const parts = baseDateStr.split('-').map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function computeDayNumber(dateStr: string): number {
  const epoch = Date.UTC(2026, 9, 1); // Oct 1, 2026 launch epoch
  const parts = dateStr.split('-').map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const current = Date.UTC(y, m - 1, d);
  return Math.max(1, Math.floor((current - epoch) / 86400000) + 1);
}

export function generateDailyHeist(dateStr: string): DailyHeist {
  const seed = hashString(`vault-zero:${dateStr}`);
  const rng = mulberry32(seed);
  const dayNumber = computeDayNumber(dateStr);

  const codename = CODENAMES[Math.floor(rng() * CODENAMES.length)] ?? 'OPERATION ZERO';
  const curator = CURATORS[Math.floor(rng() * CURATORS.length)] ?? 'Reserve Directorate';

  const r1Values = [150, 300, 550, 950, 1500].map(
    (base) => Math.round((base + (rng() - 0.5) * base * 0.14) / 25) * 25
  );

  const r1Vaults: VaultDef[] = r1Values.map((jackpot, index) => ({
    index,
    code: VAULT_CODES[index] ?? 'A',
    name: VAULT_NAMES_5[index] ?? 'Vault',
    jackpot,
    multiplier: 1,
    accentHex: VAULT_ACCENTS_5[index] ?? '#60a5fa',
  }));

  const round1: RoundConfig = {
    roundNumber: 1,
    title: 'Overcrowd Fuse',
    ruleSummary: 'The most crowded vault explodes (0g). Fewer players in your vault = bigger cut.',
    twist: 'classic-overcrowd',
    durationSec: 15,
    vaults: r1Vaults,
    bonusVaultIndex: null,
  };

  const r2Twists: readonly ['double-or-dead', 'second-most-explodes', 'dual-fuse'] = [
    'double-or-dead',
    'second-most-explodes',
    'dual-fuse',
  ];
  const r2Twist = r2Twists[dayNumber % r2Twists.length] ?? 'double-or-dead';
  const bonusIdx = r2Twist === 'double-or-dead' ? 2 + Math.floor(rng() * 3) : null;

  const r2Values = [200, 400, 700, 1100, 1650].map(
    (base) => Math.round((base + (rng() - 0.5) * base * 0.12) / 25) * 25
  );

  const r2Vaults: VaultDef[] = r2Values.map((jackpot, index) => ({
    index,
    code: VAULT_CODES[index] ?? 'A',
    name: VAULT_NAMES_5[index] ?? 'Vault',
    jackpot,
    multiplier: bonusIdx === index ? 2 : 1,
    accentHex: VAULT_ACCENTS_5[index] ?? '#60a5fa',
  }));

  const r2Meta: Record<'double-or-dead' | 'second-most-explodes' | 'dual-fuse', { title: string; ruleSummary: string }> = {
    'double-or-dead': {
      title: 'Double or Dead',
      ruleSummary: `Vault ${bonusIdx !== null ? (VAULT_CODES[bonusIdx] ?? 'D') : 'D'} pays 2x gold — but the most crowded vault still blows.`,
    },
    'second-most-explodes': {
      title: 'Reverse Fuse',
      ruleSummary: 'The 2ND most crowded vault explodes! The biggest crowd actually survives.',
    },
    'dual-fuse': {
      title: 'Dual Detonator',
      ruleSummary: 'The TOP TWO most crowded vaults BOTH explode. Slip into the quiet three.',
    },
  };

  const round2: RoundConfig = {
    roundNumber: 2,
    title: r2Meta[r2Twist].title,
    ruleSummary: r2Meta[r2Twist].ruleSummary,
    twist: r2Twist,
    durationSec: 15,
    vaults: r2Vaults,
    bonusVaultIndex: bonusIdx,
  };

  const r3Values = [650, 1250, 2200].map(
    (base) => Math.round((base + (rng() - 0.5) * base * 0.1) / 50) * 50
  );
  const r3Vaults: VaultDef[] = r3Values.map((jackpot, index) => ({
    index,
    code: VAULT_CODES[index] ?? 'A',
    name: VAULT_NAMES_3[index] ?? 'Safe',
    jackpot,
    multiplier: 1,
    accentHex: VAULT_ACCENTS_3[index] ?? '#38bdf8',
  }));

  const round3: RoundConfig = {
    roundNumber: 3,
    title: 'Split or Steal',
    ruleSummary: 'Most crowded vault blows. Inside a safe vault: SPLIT safely or STEAL for 1.85x (busts if too greedy).',
    twist: 'split-or-steal',
    durationSec: 16,
    vaults: r3Vaults,
    bonusVaultIndex: null,
  };

  return {
    id: `heist-${dateStr}`,
    dayNumber,
    dateStr,
    codename,
    curator,
    rounds: [round1, round2, round3],
  };
}

/**
 * Generates a realistic, deterministic baseline crowd distribution for a daily round
 * so the vault chamber immediately feels tense and alive, while real server commits mutate it.
 */
export function generateBaselineCrowd(
  dateStr: string,
  round: RoundConfig
): { commits: number[]; stealRates: number[] } {
  const rng = mulberry32(hashString(`crowd:${dateStr}:r${round.roundNumber}`));
  const n = round.vaults.length;

  // Build organic behavioral weights (players cluster near middle-high vaults and 2x traps)
  const weights: number[] = [];
  for (let i = 0; i < n; i++) {
    let w = 0.75 + rng() * 1.15;
    if (i === n - 2) w += 0.45; // classic "smart" 2nd-highest crowd pileup
    if (i === n - 1) w += 0.25 + rng() * 0.55; // high-stakes gamble spike
    if (round.bonusVaultIndex === i) w += 0.65;
    if (round.twist === 'second-most-explodes' && i === n - 1) w += 0.5;
    weights.push(w);
  }

  const totalBase = 160 + Math.floor(rng() * 140);
  const sumW = weights.reduce((acc, v) => acc + v, 0);
  const commits = weights.map((w) => Math.max(8, Math.round((w / sumW) * totalBase)));

  const stealRates = round.vaults.map((_, i) => {
    // Higher-value vaults attract slightly more stealers, with daily variance so stealing can win cleanly
    const base = 0.22 + (i / Math.max(1, n - 1)) * 0.22 + (rng() - 0.5) * 0.24;
    return Number(Math.max(0.12, Math.min(0.68, base)).toFixed(2));
  });

  return { commits, stealRates };
}

/**
 * Determines which vault indices explode given the round's twist rule and final crowd counts.
 */
export function determineExplodedVaults(
  twist: RoundTwistType,
  counts: number[]
): number[] {
  if (counts.length === 0) return [];

  const ranked = counts
    .map((count, index) => ({ index, count }))
    .sort((a, b) => b.count - a.count || b.index - a.index);

  const first = ranked[0];
  if (!first) return [];

  if (twist === 'dual-fuse') {
    const second = ranked[1];
    if (!second) return ranked.map((r) => r.index);
    const cutoff = second.count;
    return ranked.filter((r) => r.count >= cutoff).map((r) => r.index);
  }

  if (twist === 'second-most-explodes') {
    const highestCount = first.count;
    const strictlyLower = ranked.filter((r) => r.count < highestCount);
    const runnerUp = strictlyLower[0];
    if (!runnerUp) {
      return [first.index];
    }
    const secondCount = runnerUp.count;
    return strictlyLower.filter((r) => r.count === secondCount).map((r) => r.index);
  }

  // Default: highest crowd explodes (all tied for max explode)
  const maxCount = first.count;
  return ranked.filter((r) => r.count === maxCount).map((r) => r.index);
}

/**
 * Largest-remainder rounding so crowd share percentages always sum to exactly 100%.
 */
function computeNormalizedShares(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (counts.length === 0) return [];
  if (total <= 0) {
    const base = Math.floor(100 / counts.length);
    const shares = counts.map(() => base);
    let rem = 100 - base * counts.length;
    for (let i = 0; i < shares.length && rem > 0; i++, rem--) {
      shares[i] = (shares[i] ?? 0) + 1;
    }
    return shares;
  }

  const exact = counts.map((c, index) => {
    const raw = (c / total) * 100;
    const floor = Math.floor(raw);
    return { index, floor, frac: raw - floor };
  });

  const shares = exact.map((e) => e.floor);
  let remaining = 100 - shares.reduce((a, b) => a + b, 0);
  const byFrac = [...exact].sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (let i = 0; i < byFrac.length && remaining > 0; i++, remaining--) {
    const item = byFrac[i];
    if (item) {
      shares[item.index] = (shares[item.index] ?? 0) + 1;
    }
  }
  return shares;
}

export interface ResolveRoundInput {
  round: RoundConfig;
  chosenVaultIndex: number;
  decoyVaultIndex: number | null;
  pactChoice: PactChoice | null;
  /** Crowd counts INCLUDING the player's commit */
  crowdCounts: number[];
  /** Per-vault steal rate (0..1) for Round 3 */
  stealRates: number[];
}

export function resolveRound(input: ResolveRoundInput): RoundResolution {
  const { round, chosenVaultIndex, decoyVaultIndex, pactChoice, crowdCounts, stealRates } = input;
  const safeCounts = crowdCounts.map((c) => Math.max(0, Math.round(c)));
  const totalCrowd = Math.max(1, safeCounts.reduce((a, b) => a + b, 0));
  const crowdShares = computeNormalizedShares(safeCounts);

  const explodedVaultIndices = determineExplodedVaults(round.twist, safeCounts);
  const playerExploded = explodedVaultIndices.includes(chosenVaultIndex);
  const vault: VaultDef = round.vaults[chosenVaultIndex] ??
    round.vaults[0] ?? {
      index: 0,
      code: 'A',
      name: 'Vault',
      jackpot: 150,
      multiplier: 1,
      accentHex: '#60a5fa',
    };

  let goldEarned = 0;
  let stealBusted = false;
  let stealJackpot = false;
  let headline = '';
  let subline = '';

  const avgCrowd = totalCrowd / Math.max(1, round.vaults.length);
  const playerVaultCount = Math.max(1, safeCounts[chosenVaultIndex] ?? 1);
  // Scarcity factor rewards slipping into quieter vaults (0.68x to 1.45x)
  const scarcityRatio = avgCrowd / playerVaultCount;
  const scarcityMult = Math.max(0.68, Math.min(1.45, 0.72 + scarcityRatio * 0.34));
  const basePayout = Math.round((vault.jackpot * vault.multiplier * scarcityMult) / 10) * 10;
  const chosenShare = crowdShares[chosenVaultIndex] ?? 0;

  if (playerExploded) {
    goldEarned = 0;
    headline = `VAULT ${vault.code} DETONATED`;
    subline =
      round.twist === 'second-most-explodes'
        ? `Caught in the 2nd-most crowded trap (${chosenShare}% crowd). Zero gold.`
        : `Overloaded at ${chosenShare}% crowd pressure. Hinges blown — 0g.`;
  } else if (round.twist === 'split-or-steal') {
    const choice: PactChoice = pactChoice ?? 'split';
    const vaultStealRate = stealRates[chosenVaultIndex] ?? 0.35;

    if (choice === 'steal') {
      if (vaultStealRate < 0.36) {
        goldEarned = Math.round((basePayout * 1.85) / 10) * 10;
        stealJackpot = true;
        headline = `CLEAN SOLO STEAL · +${goldEarned}g`;
        subline = `Only ${Math.round(vaultStealRate * 100)}% got greedy in Vault ${vault.code}. You swept the bullion!`;
      } else {
        goldEarned = 0;
        stealBusted = true;
        headline = `GREED CLASH · THIEVES LOCKED OUT`;
        subline = `${Math.round(vaultStealRate * 100)}% of Vault ${vault.code} hit STEAL. Deadbolts jammed — 0g.`;
      }
    } else {
      const splitRetention = vaultStealRate > 0.45 ? 0.85 : 1.0;
      goldEarned = Math.round((basePayout * splitRetention) / 10) * 10;
      headline = `SAFE SPLIT · +${goldEarned}g`;
      subline = `Vault ${vault.code} held at ${chosenShare}% crowd. Clean extraction.`;
    }
  } else {
    goldEarned = basePayout;
    const decoyText =
      decoyVaultIndex !== null && explodedVaultIndices.includes(decoyVaultIndex)
        ? ` Your decoy helped overload Vault ${round.vaults[decoyVaultIndex]?.code ?? ''}!`
        : '';
    headline = `VAULT ${vault.code} CRACKED · +${goldEarned}g`;
    subline = `Only ${chosenShare}% of players dared enter.${decoyText}`;
  }

  return {
    roundNumber: round.roundNumber,
    chosenVaultIndex,
    decoyVaultIndex,
    pactChoice: round.twist === 'split-or-steal' ? pactChoice ?? 'split' : null,
    explodedVaultIndices,
    crowdShares,
    crowdCounts: safeCounts,
    playerExploded,
    stealBusted,
    stealJackpot,
    goldEarned,
    headline,
    subline,
  };
}

export function calculatePercentile(totalGold: number, heist?: DailyHeist): number {
  if (totalGold <= 0) return 96;
  // Scale against the day's realistic strong haul (accounts for 2x bonus days vs dual-fuse days)
  const dayCeiling = heist
    ? Math.max(
        3400,
        Math.round(
          heist.rounds.reduce((sum, r) => {
            const topVault = r.vaults.reduce(
              (best, v) => Math.max(best, v.jackpot * v.multiplier),
              0
            );
            return sum + topVault * 0.78;
          }, 0)
        )
      )
    : 4400;
  const normalized = Math.min(1, totalGold / dayCeiling);
  const topPct = Math.max(1, Math.min(95, Math.round(92 - normalized * 90)));
  return topPct;
}

export function classifyArchetype(
  rounds: RoundResolution[],
  totalGold: number,
  decoyUsed: boolean
): ArchetypeBadge {
  const explosions = rounds.filter((r) => r.playerExploded).length;
  const r3 = rounds[2];

  if (explosions >= 2) {
    return {
      id: 'crowd-victim',
      title: 'Crowd Victim',
      tagline: 'Walked straight into the herd twice.',
      flairText: 'Crowd Victim',
    };
  }

  if (r3?.stealJackpot && totalGold >= 2600) {
    return {
      id: 'lone-wolf',
      title: 'Lone Wolf',
      tagline: 'Out-bluffed the final vault and took the solo steal.',
      flairText: 'Lone Wolf',
    };
  }

  if (explosions === 0 && totalGold >= 2800) {
    return {
      id: 'vault-king',
      title: 'Vault King',
      tagline: 'Zero detonations. Pure cold-blooded crowd reading.',
      flairText: 'Vault King',
    };
  }

  if (decoyUsed && explosions === 0) {
    return {
      id: 'cold-bluffer',
      title: 'Cold Bluffer',
      tagline: 'Planted a fake beacon and walked out clean.',
      flairText: 'Cold Bluffer',
    };
  }

  if (r3?.stealBusted || rounds.some((r) => r.chosenVaultIndex >= 4)) {
    return {
      id: 'chaos-gremlin',
      title: 'Chaos Gremlin',
      tagline: 'Chased maximum bullion regardless of the blast radius.',
      flairText: 'Chaos Gremlin',
    };
  }

  return {
    id: 'safe-tactician',
    title: 'Safe Tactician',
    tagline: 'Kept a cool head and secured steady bullion.',
    flairText: 'Safe Tactician',
  };
}

export function formatRedditComment(summary: HeistSummary): string {
  // Spoiler-safe Reddit markdown: vault letters hidden behind >!spoiler!< tags so comments never spoil the daily heist
  const roundLines = summary.rounds.map((r) => {
    const code = VAULT_CODES[r.chosenVaultIndex] ?? 'A';
    const decoyCode = r.decoyVaultIndex !== null ? VAULT_CODES[r.decoyVaultIndex] : undefined;
    const decoyTag = decoyCode ? ` · Decoy >!Vault ${decoyCode}!<` : '';
    const share = r.crowdShares[r.chosenVaultIndex] ?? 0;

    if (r.playerExploded) {
      return `R${r.roundNumber}: 💥 BLAST · >!Vault ${code}!< (${share}% crowd · 0g)${decoyTag}`;
    }
    if (r.stealBusted) {
      return `R${r.roundNumber}: 🔒 CLASH · >!Vault ${code}!< STEAL jammed (0g)`;
    }
    if (r.stealJackpot) {
      return `R${r.roundNumber}: 👑 STEAL · >!Vault ${code}!< solo sweep (+${r.goldEarned.toLocaleString()}g)`;
    }
    return `R${r.roundNumber}: 🟩 SAFE · >!Vault ${code}!< (+${r.goldEarned.toLocaleString()}g · ${share}% crowd)${decoyTag}`;
  });

  return [
    `**VAULT ZERO · Heist #${summary.dayNumber} (${summary.codename})**`,
    ...roundLines,
    `**Total Haul:** ${summary.totalGold.toLocaleString()}g (Top ${summary.percentile}%) · **Role:** ${summary.archetype.title} · **Streak:** ${summary.streak}d`,
  ].join('\n');
}

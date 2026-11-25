import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePercentile,
  classifyArchetype,
  determineExplodedVaults,
  formatRedditComment,
  generateBaselineCrowd,
  generateDailyHeist,
  resolveRound,
} from './heistEngine';

test('generateDailyHeist is deterministic for the same date and varies across dates', () => {
  const h1 = generateDailyHeist('2026-11-24');
  const h2 = generateDailyHeist('2026-11-24');
  const h3 = generateDailyHeist('2026-11-25');

  assert.deepEqual(h1, h2);
  assert.equal(h1.rounds.length, 3);
  assert.equal(h1.rounds[0].vaults.length, 5);
  assert.equal(h1.rounds[1].vaults.length, 5);
  assert.equal(h1.rounds[2].vaults.length, 3);
  assert.notEqual(h1.dayNumber, h3.dayNumber);
  assert.notEqual(h1.rounds[1].twist, h3.rounds[1].twist);
});

test('determineExplodedVaults handles classic overcrowd, ties, second-most, and dual-fuse', () => {
  // Classic single max
  assert.deepEqual(determineExplodedVaults('classic-overcrowd', [10, 25, 40, 15, 20]), [2]);

  // Classic tie for max — both blow
  assert.deepEqual(determineExplodedVaults('classic-overcrowd', [10, 40, 40, 15, 20]), [2, 1]);

  // Second-most explodes (reverse fuse)
  assert.deepEqual(determineExplodedVaults('second-most-explodes', [10, 50, 35, 20, 15]), [2]);

  // Dual fuse blows top 2
  const dual = determineExplodedVaults('dual-fuse', [12, 48, 36, 15, 22]);
  assert.equal(dual.length, 2);
  assert.ok(dual.includes(1));
  assert.ok(dual.includes(2));
});

test('resolveRound awards 0g when player vault explodes and positive scaled gold when safe', () => {
  const heist = generateDailyHeist('2026-11-24');
  const r1 = heist.rounds[0];

  const busted = resolveRound({
    round: r1,
    chosenVaultIndex: 4,
    decoyVaultIndex: null,
    pactChoice: null,
    crowdCounts: [15, 20, 25, 30, 60],
    stealRates: [0.2, 0.2, 0.2, 0.2, 0.2],
  });
  assert.equal(busted.playerExploded, true);
  assert.equal(busted.goldEarned, 0);

  const safe = resolveRound({
    round: r1,
    chosenVaultIndex: 0,
    decoyVaultIndex: 4,
    pactChoice: null,
    crowdCounts: [15, 20, 25, 30, 60],
    stealRates: [0.2, 0.2, 0.2, 0.2, 0.2],
  });
  assert.equal(safe.playerExploded, false);
  assert.ok(safe.goldEarned > 0);
  assert.ok(safe.subline.includes('decoy'));
});

test('Round 3 Split vs Steal rewards lone steal and busts greedy clash', () => {
  const heist = generateDailyHeist('2026-11-24');
  const r3 = heist.rounds[2];

  const loneSteal = resolveRound({
    round: r3,
    chosenVaultIndex: 2,
    decoyVaultIndex: null,
    pactChoice: 'steal',
    crowdCounts: [80, 40, 25], // Vault 0 blows; Vault 2 survives
    stealRates: [0.5, 0.5, 0.22], // Low steal rate -> clean solo steal
  });
  assert.equal(loneSteal.playerExploded, false);
  assert.equal(loneSteal.stealJackpot, true);
  assert.equal(loneSteal.stealBusted, false);
  assert.ok(loneSteal.goldEarned > (r3.vaults[2]?.jackpot ?? 0));
  assert.equal(
    loneSteal.crowdShares.reduce((a, b) => a + b, 0),
    100
  );

  const greedClash = resolveRound({
    round: r3,
    chosenVaultIndex: 2,
    decoyVaultIndex: null,
    pactChoice: 'steal',
    crowdCounts: [80, 40, 25],
    stealRates: [0.5, 0.5, 0.55], // Too many stealers -> busted
  });
  assert.equal(greedClash.stealBusted, true);
  assert.equal(greedClash.goldEarned, 0);

  const safeSplit = resolveRound({
    round: r3,
    chosenVaultIndex: 2,
    decoyVaultIndex: null,
    pactChoice: 'split',
    crowdCounts: [80, 40, 25],
    stealRates: [0.5, 0.5, 0.55],
  });
  assert.equal(safeSplit.stealBusted, false);
  assert.ok(safeSplit.goldEarned > 0);
});

test('classifyArchetype and formatRedditComment produce clean summaries', () => {
  const heist = generateDailyHeist('2026-11-24');
  const baseline = generateBaselineCrowd('2026-11-24', heist.rounds[0]);
  assert.equal(baseline.commits.length, 5);

  const r1 = resolveRound({
    round: heist.rounds[0],
    chosenVaultIndex: 2,
    decoyVaultIndex: 4,
    pactChoice: null,
    crowdCounts: [20, 25, 18, 30, 70],
    stealRates: [0.2, 0.2, 0.2, 0.2, 0.2],
  });
  const r2 = resolveRound({
    round: heist.rounds[1],
    chosenVaultIndex: 3,
    decoyVaultIndex: null,
    pactChoice: null,
    crowdCounts: [60, 40, 35, 12, 20],
    stealRates: [0.2, 0.2, 0.2, 0.2, 0.2],
  });
  const r3 = resolveRound({
    round: heist.rounds[2],
    chosenVaultIndex: 2,
    decoyVaultIndex: null,
    pactChoice: 'steal',
    crowdCounts: [90, 45, 22],
    stealRates: [0.5, 0.5, 0.2],
  });

  const totalGold = r1.goldEarned + r2.goldEarned + r3.goldEarned;
  const archetype = classifyArchetype([r1, r2, r3], totalGold, true);
  assert.equal(archetype.id, 'lone-wolf');

  const card = formatRedditComment({
    heistId: heist.id,
    dayNumber: heist.dayNumber,
    dateStr: heist.dateStr,
    codename: heist.codename,
    totalGold,
    percentile: calculatePercentile(totalGold, heist),
    rounds: [r1, r2, r3],
    archetype,
    decoyUsedOn: { roundNumber: 1, vaultCode: 'E' },
    streak: 3,
    completedAt: '2026-11-24T12:00:00.000Z',
  });

  assert.ok(card.includes('VAULT ZERO'));
  assert.ok(card.includes('Lone Wolf'));
  assert.ok(card.includes('Streak:'));
  assert.ok(card.includes('>!Vault'));
});

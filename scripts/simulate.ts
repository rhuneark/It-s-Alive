/**
 * Monte-Carlo checks for the game's randomness and the ad-vote cap.
 * Run: npm run simulate
 *
 * Targets:
 *  1. Empty days and ties pick every eligible option equally often (within 1.5 points).
 *  2. A determined player who spends every ad vote backing the runner-up flips the
 *     day's winner on at most 10% of 100-voter days (one ordinary vote alone flips
 *     ~4%). MAX_AD_VOTES_PER_DAY is the largest cap that meets this (more ad votes
 *     = more ad revenue).
 */
import { resolveDay } from '../src/game/tally';
import { makeRng, rngFor } from '../src/game/rng';
import { MAX_AD_VOTES_PER_DAY } from '../src/game/state';

const RUNS = 20_000;
let failed = false;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failed = true;
};

// 1. Fairness of seeded picks
{
  const hits = [0, 0, 0, 0, 0];
  for (let i = 0; i < RUNS; i++) hits[resolveDay([0, 0, 0, 0, 0], `s2026:${i}`).winnerIndex]!++;
  const pct = hits.map((h) => (h / RUNS) * 100);
  check(
    pct.every((p) => Math.abs(p - 20) < 1.5),
    `empty-day picks ~20% each: ${pct.map((p) => p.toFixed(1)).join(' / ')}`,
  );

  const tie = [0, 0, 0, 0, 0];
  for (let i = 0; i < RUNS; i++) tie[resolveDay([7, 2, 7, 7, 1], `t:${i}`).winnerIndex]!++;
  const tp = tie.map((h) => (h / RUNS) * 100);
  check(
    tie[1] === 0 && tie[4] === 0 && [0, 2, 3].every((i) => Math.abs(tp[i]! - 33.3) < 1.5),
    `3-way ties ~33% each: ${tp.map((p) => p.toFixed(1)).join(' / ')}`,
  );
}

// 2. Ad-vote cap: how often can one zealot flip a day?
function dayOutcome(
  rng: () => number,
  voters: number,
  cap: number,
  zealot: boolean,
): { base: number; withZealot: number } {
  const weights = Array.from({ length: 5 }, () => 0.3 + rng() ** 2 * 3);
  const sum = weights.reduce((a, b) => a + b, 0);
  const counts = [0, 0, 0, 0, 0];
  for (let v = 0; v < voters; v++) {
    let r = rng() * sum;
    let pick = 4;
    for (let i = 0; i < 5; i++) {
      r -= weights[i]!;
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    // ~20% of ordinary players watch some ads for extra votes on their favourite.
    const extra = rng() < 0.2 ? Math.ceil(rng() * cap) : 0;
    counts[pick]! += 1 + extra;
  }
  const seed = `${voters}:${rng()}`;
  const base = resolveDay(counts, seed).winnerIndex;
  if (!zealot) return { base, withZealot: base };
  // The zealot backs the runner-up (the cheapest option to push over the top).
  const order = counts.map((c, i) => ({ c, i })).sort((a, b) => b.c - a.c);
  const target = order[1]!.i;
  const boosted = [...counts];
  boosted[target]! += 1 + cap;
  return { base, withZealot: resolveDay(boosted, seed).winnerIndex };
}

const MAX_FLIP_AT_100 = 0.1;
const sizes = [10, 30, 100, 300];
const flipRates: number[][] = [];
console.log(
  '\ncap | flip rate of one maxed-out player at 10 / 30 / 100 / 300 voters | sway vs one vote @100',
);
for (let cap = 0; cap <= 6; cap++) {
  const rates = sizes.map((voters) => {
    const rng = makeRng(rngFor('cap', voters)() * 2 ** 32);
    let flips = 0;
    const days = 8000;
    for (let d = 0; d < days; d++) {
      const r = dayOutcome(rng, voters, cap, true);
      if (r.base !== r.withZealot) flips++;
    }
    return flips / days;
  });
  flipRates.push(rates);
  const sway = rates[2]! / flipRates[0]![2]!;
  console.log(
    `${cap}   | ${rates.map((r) => (r * 100).toFixed(1).padStart(5) + '%').join('  ')} | ${sway.toFixed(2)}x`,
  );
}
const flipAt100 = (cap: number) => flipRates[cap]![2]!;
let bestCap = 0;
for (let cap = 0; cap < flipRates.length; cap++)
  if (flipAt100(cap) <= MAX_FLIP_AT_100) bestCap = cap;
console.log(
  `\nLargest cap keeping a maxed-out player under ${MAX_FLIP_AT_100 * 100}% flips at 100 voters: ${bestCap}`,
);
check(
  flipAt100(MAX_AD_VOTES_PER_DAY) <= MAX_FLIP_AT_100,
  `MAX_AD_VOTES_PER_DAY (${MAX_AD_VOTES_PER_DAY}) flips ${(flipAt100(MAX_AD_VOTES_PER_DAY) * 100).toFixed(1)}% of 100-voter days`,
);
check(
  MAX_AD_VOTES_PER_DAY === bestCap,
  `MAX_AD_VOTES_PER_DAY is tuned to the largest fair cap (${bestCap})`,
);

process.exit(failed ? 1 : 0);

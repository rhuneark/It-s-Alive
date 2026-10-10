/** Turning raw vote counts into winners and percentages. */
import { rngFor } from './rng';

export type WinReason = 'votes' | 'tie' | 'empty';

export interface DayResult {
  winnerIndex: number;
  counts: number[];
  reason: WinReason;
}

/**
 * Most votes wins. Ties are broken by a seeded draw among the tied options, and a
 * day nobody voted on is picked at random ("the monster chose for itself").
 * Every client gets the same answer for the same counts and seed.
 */
export function resolveDay(counts: readonly number[], seed: string): DayResult {
  if (counts.length === 0) throw new Error('resolveDay needs at least one option');
  const clean = counts.map((c) => (Number.isFinite(c) && c > 0 ? Math.floor(c) : 0));
  const max = Math.max(...clean);
  const rng = rngFor('resolve', seed);
  if (max === 0) {
    return { winnerIndex: Math.floor(rng() * clean.length), counts: clean, reason: 'empty' };
  }
  const leaders = clean.flatMap((c, i) => (c === max ? [i] : []));
  if (leaders.length === 1) return { winnerIndex: leaders[0]!, counts: clean, reason: 'votes' };
  return {
    winnerIndex: leaders[Math.floor(rng() * leaders.length)]!,
    counts: clean,
    reason: 'tie',
  };
}

/** Whole-number percentages that always sum to 100 (largest remainder method). */
export function percentages(counts: readonly number[]): number[] {
  const total = counts.reduce((a, b) => a + Math.max(0, b), 0);
  if (total === 0) return counts.map(() => 0);
  const raw = counts.map((c) => (Math.max(0, c) / total) * 100);
  const floors = raw.map(Math.floor);
  let remaining = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remaining <= 0) break;
    floors[i]! += 1;
    remaining--;
  }
  return floors;
}

/** Index of the option currently in the lead (ties go to the earliest), or -1 with no votes. */
export function leaderIndex(counts: readonly number[]): number {
  let best = -1;
  let bestCount = 0;
  counts.forEach((c, i) => {
    if (c > bestCount) {
      best = i;
      bestCount = c;
    }
  });
  return best;
}

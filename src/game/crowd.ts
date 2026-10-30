/**
 * A stand-in crowd for local development and simulation. In production the
 * tallies come from real players (see src/sdk/run.ts); this is only used when
 * the SDK runs in mock mode, and by scripts/simulate.ts.
 */
import { rngFor } from './rng';

/** Deterministic fake vote counts for one day: a few hundred votes with a clear favourite or two. */
export function simulatedCrowd(seed: string, optionCount: number): number[] {
  const rng = rngFor('crowd', seed);
  const voters = 40 + Math.floor(rng() * 260);
  const weights = Array.from({ length: optionCount }, () => 0.3 + rng() ** 2 * 3);
  const sum = weights.reduce((a, b) => a + b, 0);
  const counts = new Array<number>(optionCount).fill(0);
  for (let v = 0; v < voters; v++) {
    let pick = rng() * sum;
    for (let i = 0; i < optionCount; i++) {
      pick -= weights[i]!;
      if (pick <= 0 || i === optionCount - 1) {
        counts[i]! += 1;
        break;
      }
    }
  }
  return counts;
}

/** Deterministic fake rampage runs for one day (local development only): runs per rubble band. */
export function simulatedRubble(seed: string, bands: number): number[] {
  const rng = rngFor('rubble', seed);
  const runs = 20 + Math.floor(rng() * 120);
  const counts = new Array<number>(bands).fill(0);
  for (let i = 0; i < runs; i++) {
    // most runs land in the middle bands (1,000-8,000 rubble), a few go huge
    const b = Math.round(3 + (rng() + rng() + rng() - 1.5) * 3);
    counts[Math.max(0, Math.min(bands - 1, b))]! += 1;
  }
  return counts;
}

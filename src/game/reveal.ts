/**
 * The reveal a returning player sees: which part was stitched on last night,
 * by how much, and how their own pick did. Pure; built from the save's cache
 * of resolved nights.
 */
import type { Question } from './catalog';
import type { SaveState } from './state';
import { percentages, type WinReason } from './tally';

export interface Reveal {
  night: number;
  question: Question;
  winner: string;
  /** The winner's share of the night's votes (0..100) and how many votes were cast. */
  share: number;
  total: number;
  reason: WinReason;
  /** What this player voted for that night, and where it placed (1 = won). */
  myPick: string | null;
  myPlace: number | null;
  /** Other stitchings the player missed before this one (shown in the Chronicle). */
  missed: number;
}

/** The latest resolved night the player has not been shown yet, or null. */
export function pendingReveal(save: SaveState, schedule: readonly Question[]): Reveal | null {
  const nights = Object.keys(save.history)
    .map(Number)
    .filter((n) => n > save.seenNight && schedule[n])
    .sort((a, b) => a - b);
  const night = nights.at(-1);
  if (night === undefined) return null;
  const r = save.history[String(night)]!;
  const question = schedule[night]!;
  const ids = question.options.map((o) => o.id);
  const total = r.counts.reduce((a, b) => a + b, 0);
  const share = percentages(r.counts)[ids.indexOf(r.winner)] ?? 0;
  const myPick = save.myPicks[String(night)] ?? null;
  let myPlace: number | null = null;
  if (myPick && ids.includes(myPick)) {
    // Options with more votes rank above it; a tie lost on the tie-break still places 2nd.
    const mine = r.counts[ids.indexOf(myPick)] ?? 0;
    const above = r.counts.filter((c) => c > mine).length;
    myPlace = myPick === r.winner ? 1 : Math.max(2, 1 + above);
  }
  return {
    night,
    question,
    winner: r.winner,
    share,
    total,
    reason: r.reason,
    myPick,
    myPlace,
    missed: nights.length - 1,
  };
}

/** "1st", "2nd", "3rd", "4th", "5th". */
export function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}

/**
 * The awakening: at midnight Central that begins Halloween the finished creature wakes. Every
 * player sees it happen once, in a short scene, the first time they open the game from then on.
 * Pure; built from the save.
 */
import type { Question } from './catalog';
import type { Phase } from './schedule';
import type { SaveState } from './state';

/** The scene is due from Halloween on, until the player has watched or skipped it. */
export function awakeningDue(save: SaveState, phase: Phase): boolean {
  return phase.kind === 'awakened' && !save.sawAwakening;
}

/** Watched (or skipped): the scene shows every stitching, so no night is left to reveal. */
export function markAwakened(save: SaveState, schedule: readonly Question[]): SaveState {
  return {
    ...save,
    sawAwakening: true,
    seenNight: Math.max(save.seenNight, schedule.length - 1),
  };
}

/** What went into the creature: the nights resolved so far and every vote cast on them. */
export function seasonTotals(
  save: SaveState,
  schedule: readonly Question[],
): { nights: number; votes: number } {
  let nights = 0;
  let votes = 0;
  schedule.forEach((_, n) => {
    const r = save.history[String(n)];
    if (!r) return;
    nights++;
    votes += r.counts.reduce((a, b) => a + b, 0);
  });
  return { nights, votes };
}

/** The creature is whole once every night of the season has been tallied. */
export function allStitched(save: SaveState, schedule: readonly Question[]): boolean {
  return schedule.every((_, n) => save.history[String(n)] !== undefined);
}

/**
 * The vigil's storm (the day before it wakes) grows wilder as midnight nears: the wait until the
 * next lightning strike, from the time left and a roll in [0, 1). Never under 1.2 s, so even with
 * a double flicker per strike the screen flashes fewer than 3 times a second.
 */
export function stormGap(msLeft: number, roll: number): number {
  const hours = msLeft / 3_600_000;
  const [min, max] =
    hours > 6
      ? [7000, 12000]
      : hours > 2
        ? [4500, 8000]
        : hours > 0.5
          ? [3000, 5500]
          : hours > 1 / 60
            ? [2000, 3500]
            : [1200, 2000];
  return Math.round(min + Math.max(0, Math.min(1, roll)) * (max - min));
}

/**
 * The daily round (owner's request, Oct 31: "a daily venue change at midnight with each day
 * showcasing the top 3 scores of the day. Daily rewards for return"). Pure.
 *
 * The day's board. RUN's leaderboards reset by UTC calendar periods, but a game day runs from
 * 05:00 to 05:00 UTC (midnight CDT). So each game day gets its own board MODE on a MONTHLY period
 * (rundot/leaderboard.config.json): `m<day of month><a|b>`, the letter by the month's parity. A
 * game day's runs all land in its mode's instance for the month the day starts in, except the last
 * day of a month, whose small hours fall in the next month's instance; with the parity letter that
 * instance is one no other day uses, so a mode instance only ever holds one game day's runs.
 *
 * Daily rewards: once a game day, a player who comes back claims rubble for their upgrades. Coming
 * back the next day builds a streak along a 7-day track (then round again); missing a day starts
 * it over. Each reward is at least a set amount, and grows with the player's best run so it stays
 * worth having.
 */
import { DAY_MS } from './schedule';

/** The board mode for the game day that starts at `dayStartMs`. */
export function boardMode(dayStartMs: number): string {
  const d = new Date(dayStartMs);
  return `m${d.getUTCDate()}${d.getUTCMonth() % 2 ? 'b' : 'a'}`;
}

/** Every board mode there is (31 days × 2 parities), for the config. */
export const BOARD_MODES: readonly string[] = Array.from({ length: 62 }, (_, i) => {
  return `m${(i % 31) + 1}${i < 31 ? 'a' : 'b'}`;
});

/**
 * Moments inside each monthly instance that holds the day's runs (one, or two for the last day of
 * a month): pass each as `periodDate`.
 */
export function boardInstances(dayStartMs: number): number[] {
  const start = new Date(dayStartMs);
  const end = new Date(dayStartMs + DAY_MS - 1);
  return start.getUTCMonth() === end.getUTCMonth()
    ? [dayStartMs]
    : [dayStartMs, dayStartMs + DAY_MS - 1];
}

/** One entry on a day's board. */
export interface BoardEntry {
  id: string;
  name: string;
  score: number;
}

/** A day's top `n`, from one or two instances' entries: each player once, at their best. */
export function topOf(lists: readonly (readonly BoardEntry[])[], n = 3): BoardEntry[] {
  const best = new Map<string, BoardEntry>();
  for (const list of lists)
    for (const e of list) {
      const was = best.get(e.id);
      if (!was || e.score > was.score) best.set(e.id, e);
    }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, n);
}

// ---------------------------------------------------------------- daily rewards

/** The reward track: at least this much rubble on day 1..7 of a streak… */
export const REWARD_BASE = [500, 1_000, 2_000, 3_500, 5_000, 7_500, 15_000] as const;
/** …or this share of the player's best run, if that is more. */
export const REWARD_SHARE = [0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.5] as const;

export interface DailySave {
  /** The game day (season day index) of the last claim (-1: never), and the streak it made. */
  day: number;
  streak: number;
}

export const NO_DAILY: DailySave = { day: -1, streak: 0 };

/** Whether today's reward is waiting. */
export function rewardWaiting(daily: DailySave, today: number): boolean {
  return today >= 0 && daily.day !== today && daily.day < today;
}

/** The streak today's claim makes: one more if they claimed yesterday, else a fresh start. */
export function streakToday(daily: DailySave, today: number): number {
  return daily.day === today - 1 ? daily.streak + 1 : daily.day === today ? daily.streak : 1;
}

/** The rubble for day `streak` of a streak (1-based; the 7-day track goes round again). */
export function rewardFor(streak: number, best: number): number {
  const i = (Math.max(1, Math.floor(streak)) - 1) % REWARD_BASE.length;
  return Math.max(REWARD_BASE[i]!, Math.round(Math.max(0, best) * REWARD_SHARE[i]!));
}

/**
 * The season calendar: which question is asked on which day, and when the
 * monster wakes. Pure functions of time; the caller supplies a trusted clock.
 *
 * A day runs from midnight to midnight US Central time (DAY_TIME_ZONE), by the
 * calendar: midnight is 05:00 UTC in daylight time (CDT) and 06:00 UTC in standard
 * time (CST, from Nov 1 2026), and the days the clocks change are 25 and 23 hours
 * long. Every day boundary goes through `centralDay` / `centralAt` (rules.test.ts
 * checks every boundary of the season and the change on Nov 1).
 */
import { QUESTIONS, type Question, type SlotId } from './catalog';

export const DAY_MS = 86_400_000;

export interface Season {
  /** Namespaces the shared vote tallies, so a future season starts fresh. */
  id: string;
  /** Midnight (Central) that opens the first voting day (the HEAD question). */
  startMs: number;
  /** Midnight (Central) that begins Halloween: voting is over and the monster wakes. */
  awakenMs: number;
}

/** Days turn over at midnight in this time zone. */
export const DAY_TIME_ZONE = 'America/Chicago';

const HOUR_MS = 3_600_000;
const CENTRAL = new Intl.DateTimeFormat('en-US', {
  timeZone: DAY_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  hourCycle: 'h23',
});

/** The Central calendar date and hour of an instant. */
function centralParts(ms: number): { day: number; hour: number } {
  const p: Record<string, number> = {};
  for (const part of CENTRAL.formatToParts(ms))
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  return {
    day: Math.round(Date.UTC(p['year']!, p['month']! - 1, p['day']!) / DAY_MS),
    hour: p['hour']!,
  };
}

/** The Central calendar day an instant falls on (days since Jan 1 1970). */
export function centralDay(ms: number): number {
  return centralParts(ms).day;
}

/** The instant it is `hour` o'clock Central on calendar day `day` (days since Jan 1 1970). */
export function centralAt(day: number, hour = 0): number {
  // Central is UTC-5 or UTC-6: try both (and the hour the clocks skip, at worst, the next one).
  for (const off of [5, 6, 7]) {
    const t = day * DAY_MS + (hour + off) * HOUR_MS;
    const c = centralParts(t);
    if (c.day === day && c.hour === hour) return t;
  }
  return day * DAY_MS + (hour + 6) * HOUR_MS;
}

export const SEASON: Season = {
  // Restarted on Oct 11 (the Oct 10 trial run used 's2026'): a new id means fresh tallies.
  id: 's2026b',
  startMs: Date.UTC(2026, 9, 11, 5), // Oct 11, 00:00 CDT
  awakenMs: Date.UTC(2026, 9, 31, 5), // Oct 31, 00:00 CDT
};

/** The last day before Halloween has no vote: the finished creature lies in state (the vigil). */
export const VIGIL_DAYS = 1;

/**
 * If the season is shorter than the full catalog, these slots are dropped first
 * (head always opens; brain and spark always close).
 */
const DROP_ORDER: readonly SlotId[] = [
  'jaw',
  'ears',
  'arm3',
  'chestEye',
  'spine',
  'head2',
  'maw',
  'horns',
  'tail',
  'wings',
  'browEye',
  'heart',
  'legR',
  'armL',
  'legL',
  'armR',
  'torso',
];

/** Number of days in a season, from the first question to Halloween (Central time). */
export function votingDays(season: Season): number {
  return Math.max(0, centralDay(season.awakenMs) - centralDay(season.startMs));
}

/** Midnight Central that begins the season's day `index` (0 = the first voting day). */
export function dayStartMs(season: Season, index: number): number {
  return centralAt(centralDay(season.startMs) + index);
}

/** Midnight Central that begins rampage day `day` (0 = Halloween). */
export function rampageDayStartMs(season: Season, day: number): number {
  return dayStartMs(season, votingDays(season) + day);
}

/** The ordered list of questions for a season of `days` voting days. */
export function buildSchedule(days: number): Question[] {
  if (days <= 0) return [];
  let slots: SlotId[] = QUESTIONS.map((q) => q.slot);
  for (const drop of DROP_ORDER) {
    if (slots.length <= days) break;
    slots = slots.filter((s) => s !== drop);
  }
  // Very short seasons keep the head first and the spark last.
  if (slots.length > days) {
    slots = days === 1 ? ['head'] : [...slots.slice(0, days - 1), 'spark'];
  }
  const bySlot = new Map(QUESTIONS.map((q) => [q.slot, q] as const));
  return slots.map((s) => bySlot.get(s)!);
}

/** The season's questions: one per day, the vigil excepted. */
export function seasonSchedule(season: Season): Question[] {
  return buildSchedule(votingDays(season) - VIGIL_DAYS);
}

export type Phase =
  | { kind: 'preseason'; opensInMs: number }
  | { kind: 'voting'; day: number; question: Question; endsInMs: number; dayCount: number }
  /** Every part is chosen but Halloween has not come: no vote, the creature waits for midnight. */
  | { kind: 'vigil'; wakesInMs: number; dayCount: number }
  | { kind: 'awakened'; daysSinceAwakening: number };

/** Day index relative to the season start (negative before it starts). */
export function dayIndexAt(nowMs: number, season: Season): number {
  return centralDay(nowMs) - centralDay(season.startMs);
}

export function phaseAt(nowMs: number, season: Season): Phase {
  const schedule = seasonSchedule(season);
  if (nowMs < season.startMs) return { kind: 'preseason', opensInMs: season.startMs - nowMs };
  const day = dayIndexAt(nowMs, season);
  if (nowMs >= season.awakenMs) {
    return {
      kind: 'awakened',
      daysSinceAwakening: Math.max(0, centralDay(nowMs) - centralDay(season.awakenMs)),
    };
  }
  if (day >= schedule.length) {
    return { kind: 'vigil', wakesInMs: season.awakenMs - nowMs, dayCount: schedule.length };
  }
  const endsAt = dayStartMs(season, day + 1);
  return {
    kind: 'voting',
    day,
    question: schedule[day]!,
    endsInMs: endsAt - nowMs,
    dayCount: schedule.length,
  };
}

/** Days whose voting has closed (and can be resolved) at `nowMs`. */
export function closedDays(nowMs: number, season: Season): number[] {
  const schedule = seasonSchedule(season);
  const day = Math.min(dayIndexAt(nowMs, season), schedule.length);
  const out: number[] = [];
  for (let d = 0; d < day; d++) out.push(d);
  return out;
}

export function questionForDay(day: number, season: Season): Question | undefined {
  return seasonSchedule(season)[day];
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

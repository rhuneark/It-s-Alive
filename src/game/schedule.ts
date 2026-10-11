/**
 * The season calendar: which question is asked on which UTC day, and when the
 * monster wakes. Pure functions of time; the caller supplies a trusted clock.
 */
import { QUESTIONS, type Question, type SlotId } from './catalog';

export const DAY_MS = 86_400_000;

export interface Season {
  /** Namespaces the shared vote tallies, so a future season starts fresh. */
  id: string;
  /** UTC midnight of the first voting day (the HEAD question). */
  startMs: number;
  /** UTC midnight of Halloween: voting is over and the monster wakes. */
  awakenMs: number;
}

export const SEASON: Season = {
  id: 's2026',
  startMs: Date.UTC(2026, 9, 10),
  awakenMs: Date.UTC(2026, 9, 31),
};

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

/** Number of voting days in a season (one question per UTC day). */
export function votingDays(season: Season): number {
  return Math.max(0, Math.round((season.awakenMs - season.startMs) / DAY_MS));
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

export type Phase =
  | { kind: 'preseason'; opensInMs: number }
  | { kind: 'voting'; day: number; question: Question; endsInMs: number; dayCount: number }
  /** Every part is chosen but Halloween has not come: no vote, the creature waits for midnight. */
  | { kind: 'vigil'; wakesInMs: number; dayCount: number }
  | { kind: 'awakened'; daysSinceAwakening: number };

/** UTC day index relative to the season start (negative before it starts). */
export function dayIndexAt(nowMs: number, season: Season): number {
  return Math.floor((nowMs - season.startMs) / DAY_MS);
}

export function phaseAt(nowMs: number, season: Season): Phase {
  const schedule = buildSchedule(votingDays(season));
  if (nowMs < season.startMs) return { kind: 'preseason', opensInMs: season.startMs - nowMs };
  const day = dayIndexAt(nowMs, season);
  if (nowMs >= season.awakenMs) {
    return {
      kind: 'awakened',
      daysSinceAwakening: Math.max(0, Math.floor((nowMs - season.awakenMs) / DAY_MS)),
    };
  }
  if (day >= schedule.length) {
    return { kind: 'vigil', wakesInMs: season.awakenMs - nowMs, dayCount: schedule.length };
  }
  const endsAt = season.startMs + (day + 1) * DAY_MS;
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
  const schedule = buildSchedule(votingDays(season));
  const day = Math.min(dayIndexAt(nowMs, season), schedule.length);
  const out: number[] = [];
  for (let d = 0; d < day; d++) out.push(d);
  return out;
}

export function questionForDay(day: number, season: Season): Question | undefined {
  return buildSchedule(votingDays(season))[day];
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

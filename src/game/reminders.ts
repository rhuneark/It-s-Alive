/**
 * The daily reminders a player gets once they have tapped Continue or opened the
 * Sketchbook: one a day naming that night's part, then the vigil, the waking, and
 * every day of the rampage after it (where it is loose today).
 * Pure; run.setReminders() schedules them as local notifications.
 */
import type { Question } from './catalog';
import { stageFor } from './rampage';
import { DAY_MS, dayIndexAt, votingDays, type Season } from './schedule';

const HOUR_MS = 3_600_000;
/** 6 pm Central: six hours before the vote closes. */
export const REMINDER_HOUR = 18;
/** Halloween morning, 10 am Central: it woke at midnight. */
export const AWAKE_HOUR = 10;
/** Local notifications can be scheduled at most 7 days ahead. */
export const REMINDER_HORIZON_MS = 7 * DAY_MS - 60_000;

export interface Reminder {
  /** Stable per night, so scheduling again replaces it instead of adding another. */
  id: string;
  atMs: number;
  title: string;
  body: string;
}

/**
 * Reminders from `nowMs` on, within the 7-day horizon. Tonight's is left out once
 * the player has voted.
 */
export function reminderPlan(
  nowMs: number,
  season: Season,
  schedule: readonly Question[],
  votedToday: boolean,
  /** The streak bonus vote is waiting tonight (the player voted last night). */
  bonusToday = false,
): Reminder[] {
  const today = dayIndexAt(nowMs, season);
  const halloween = votingDays(season);
  const out: Reminder[] = [];
  // From Halloween on the rampage goes on; the 7-day horizon decides how far ahead.
  for (let day = Math.max(0, today); day <= Math.max(today, halloween) + 7; day++) {
    const hour = day === halloween ? AWAKE_HOUR : REMINDER_HOUR;
    const atMs = season.startMs + day * DAY_MS + hour * HOUR_MS;
    if (atMs <= nowMs || atMs - nowMs > REMINDER_HORIZON_MS) continue;
    const id = `${season.id}-n${day}`;
    const q = schedule[day];
    if (q) {
      if (day === today && votedToday) continue;
      // A streak bonus is certain for tonight if earned, and for tomorrow once voted today.
      const streak = (day === today && bonusToday) || (day === today + 1 && votedToday);
      out.push({
        id,
        atMs,
        title: `Night ${day + 1}: the ${q.part.toLowerCase()}`,
        body: `${q.prompt} ${
          streak ? 'Your streak bonus vote is waiting too.' : 'The vote closes at midnight.'
        }`,
      });
    } else if (day < halloween) {
      out.push({
        id,
        atMs,
        title: 'The vigil',
        body: 'Every part is stitched. At midnight, the lightning comes.',
      });
    } else if (day === halloween) {
      out.push({
        id,
        atMs,
        title: "It's alive!",
        body: 'The creature woke at midnight and broke out of the laboratory. Come and rampage!',
      });
    } else {
      const stage = stageFor(day - halloween);
      out.push({
        id,
        atMs,
        title: `Rampage day ${day - halloween + 1}: ${stage.name}`,
        body: `${stage.blurb} A new venue, a new top 3, and your daily reward are waiting.`,
      });
    }
  }
  return out;
}

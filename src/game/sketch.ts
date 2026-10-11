/**
 * The Sketchbook: a private sandbox where a player designs their own monster by
 * choosing any option for any part, to see what their choices would look like.
 * Nothing here is a vote. Pure functions; the sketch is kept in the save.
 */
import { QUESTIONS, findOption, type SlotId } from './catalog';
import { makeRng } from './rng';
import type { ResolvedDay } from './state';

export type Parts = Partial<Record<SlotId, string>>;

/** Only real slot -> option pairs survive (a stored sketch may be stale or tampered with). */
export function cleanSketch(raw: unknown): Parts {
  const out: Parts = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [slot, id] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof id !== 'string') continue;
    const found = findOption(id);
    if (found && found.question.slot === slot) out[slot as SlotId] = id;
  }
  return out;
}

/** Set (or with null, clear back to bare husk) one part of the sketch. */
export function setSketchPart(sketch: Parts, slot: SlotId, id: string | null): Parts {
  const next = { ...sketch };
  if (id === null) delete next[slot];
  else if (findOption(id)?.question.slot === slot) next[slot] = id;
  return next;
}

/**
 * The monster as the player voted it: their own pick on every night they voted,
 * and the night's real winner where they did not. `schedule[day]` is that night's slot.
 */
export function sketchFromPicks(
  picks: Record<string, string>,
  history: Record<string, ResolvedDay>,
  schedule: readonly SlotId[],
): Parts {
  let out: Parts = {};
  schedule.forEach((slot, day) => {
    const id = picks[String(day)] ?? history[String(day)]?.winner;
    if (id) out = setSketchPart(out, slot, id);
  });
  return out;
}

/**
 * A whole monster with every part of the season chosen at random (seeded, so a seed
 * always gives the same one).
 */
export function randomSketch(seed: number, slots: readonly SlotId[]): Parts {
  const rand = makeRng(seed);
  const out: Parts = {};
  for (const q of QUESTIONS)
    if (slots.includes(q.slot)) out[q.slot] = q.options[Math.floor(rand() * q.options.length)]!.id;
  return out;
}

/** How many parts the sketch has. */
export const sketchSize = (sketch: Parts) => Object.keys(sketch).length;

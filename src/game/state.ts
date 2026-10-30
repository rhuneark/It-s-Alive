/**
 * The player's save: today's votes, ad-earned extra votes, the option they were
 * looking at, and a cache of already-resolved days. Pure reducers only; the
 * caller persists the result to appStorage after every step.
 */
import { cleanSketch, type Parts } from './sketch';
import type { WinReason } from './tally';

/** Everyone gets one vote per day. */
export const FREE_VOTES_PER_DAY = 1;
/** A player on a streak (voted on the night before) gets this many more votes tonight. */
export const RETURN_BONUS_VOTES = 1;
/**
 * Extra votes a player can earn per day by watching rewarded ads (the owner's
 * choice). scripts/simulate.ts checks it stays fair: one player maxing it out
 * must flip only a small share of 100-voter days.
 */
export const MAX_AD_VOTES_PER_DAY = 2;

export const SAVE_VERSION = 1;
export const DEFAULT_MUSIC_VOLUME = 0.5;

export interface CastVote {
  optionId: string;
  kind: 'free' | 'bonus' | 'ad';
}

export interface ResolvedDay {
  winner: string;
  counts: number[];
  reason: WinReason;
}

export interface SaveState {
  v: typeof SAVE_VERSION;
  season: string;
  /** Day index that `votes`, `pending` and `adVotesEarned` belong to. */
  day: number;
  votes: CastVote[];
  adVotesEarned: number;
  /** Streak bonus votes (RETURN_BONUS_VOTES) for `day` only: the player voted the night before. */
  bonusVotes: number;
  /** Option the player tapped but has not cast yet. */
  pending: string | null;
  /** Resolved past days, keyed by day index. Final once a day has closed. */
  history: Record<string, ResolvedDay>;
  stats: { totalVotes: number; daysVoted: number; lastVotedDay: number; streak: number };
  /** Player has seen the intro at least once (shows "Continue" instead of "Begin"). */
  started: boolean;
  /** Main theme on/off. */
  musicOn: boolean;
  /** Main theme volume, 0..1. */
  musicVolume: number;
  /** The option this player last voted for on each night (day index -> option id). */
  myPicks: Record<string, string>;
  /** The player's own design in the Sketchbook (slot -> option id). Never a vote. */
  sketch: Parts | null;
  /** The latest night whose stitching the player has been shown (-1: none yet). */
  seenNight: number;
  /** The player has watched (or skipped) the creature waking on Halloween. */
  sawAwakening: boolean;
  /** The rampage (from Halloween on). */
  rampage: RampageSave;
}

export interface RampageSave {
  /** The player's best rubble in one run, and how many runs they have played. */
  best: number;
  runs: number;
  /** Rampage day (0 = Halloween) that `today` counts for, and the player's rubble on it. */
  day: number;
  today: number;
  /** The player has seen the creature break out of the laboratory (the first run's intro). */
  brokeOut: boolean;
  /** The whole community's rubble on each closed rampage day (final once the day is over). */
  totals: Record<string, number>;
}

function newRampage(): RampageSave {
  return { best: 0, runs: 0, day: -1, today: 0, brokeOut: false, totals: {} };
}

function parseRampage(raw: unknown): RampageSave {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<RampageSave>;
  const totals: Record<string, number> = {};
  if (r.totals && typeof r.totals === 'object')
    for (const [k, v] of Object.entries(r.totals))
      if (/^\d+$/.test(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0) totals[k] = v;
  return {
    best: clampInt(r.best, 0, 1e9),
    runs: clampInt(r.runs, 0, 1e9),
    day: clampInt(r.day, -1, 10_000),
    today: clampInt(r.today, 0, 1e9),
    brokeOut: r.brokeOut === true,
    totals,
  };
}

/** A finished run: the player's best and today's rubble (the community's is in the shared tally). */
export function recordRun(save: SaveState, rampageDay: number, rubble: number): SaveState {
  const r = save.rampage;
  const today = r.day === rampageDay ? r.today : 0;
  return {
    ...save,
    rampage: {
      ...r,
      best: Math.max(r.best, rubble),
      runs: r.runs + 1,
      day: rampageDay,
      today: today + rubble,
      brokeOut: true,
    },
  };
}

/** The player has seen the creature break out of the laboratory (the rampage menu's first scene). */
export function markBrokeOut(save: SaveState): SaveState {
  return save.rampage.brokeOut ? save : { ...save, rampage: { ...save.rampage, brokeOut: true } };
}

/** Cache a closed rampage day's community rubble (it no longer changes). */
export function rememberRubble(save: SaveState, rampageDay: number, total: number): SaveState {
  return {
    ...save,
    rampage: { ...save.rampage, totals: { ...save.rampage.totals, [String(rampageDay)]: total } },
  };
}

export function newSave(season: string, day: number): SaveState {
  return {
    v: SAVE_VERSION,
    season,
    day,
    votes: [],
    adVotesEarned: 0,
    bonusVotes: 0,
    pending: null,
    history: {},
    stats: { totalVotes: 0, daysVoted: 0, lastVotedDay: -999, streak: 0 },
    started: false,
    musicOn: true,
    musicVolume: DEFAULT_MUSIC_VOLUME,
    myPicks: {},
    sketch: null,
    seenNight: -1,
    sawAwakening: false,
    rampage: newRampage(),
  };
}

/** Parse a stored save defensively; anything unreadable or from another season starts fresh. */
export function parseSave(raw: string | null, season: string, day: number): SaveState {
  if (!raw) return newSave(season, day);
  try {
    const data = JSON.parse(raw) as Partial<SaveState>;
    if (data.v !== SAVE_VERSION) return newSave(season, day);
    if (data.season !== season) return carryOver(data, newSave(season, day));
    const base = newSave(season, day);
    const votes = Array.isArray(data.votes)
      ? data.votes.filter(
          (v): v is CastVote =>
            !!v &&
            typeof v.optionId === 'string' &&
            (v.kind === 'free' || v.kind === 'bonus' || v.kind === 'ad'),
        )
      : [];
    const save: SaveState = {
      ...base,
      day: typeof data.day === 'number' ? data.day : day,
      votes,
      adVotesEarned: clampInt(data.adVotesEarned, 0, MAX_AD_VOTES_PER_DAY),
      bonusVotes: clampInt(data.bonusVotes, 0, RETURN_BONUS_VOTES),
      pending: typeof data.pending === 'string' ? data.pending : null,
      // Only days already closed: a day reopened by a clock change is tallied again when it ends.
      history: isRecord(data.history)
        ? Object.fromEntries(
            Object.entries(data.history as Record<string, ResolvedDay>).filter(
              ([d]) => Number(d) < day,
            ),
          )
        : {},
      stats: { ...base.stats, ...(isRecord(data.stats) ? data.stats : {}) },
      started: data.started === true,
      musicOn: data.musicOn !== false,
      musicVolume:
        typeof data.musicVolume === 'number' && Number.isFinite(data.musicVolume)
          ? Math.max(0, Math.min(1, data.musicVolume))
          : DEFAULT_MUSIC_VOLUME,
      myPicks: isRecord(data.myPicks)
        ? Object.fromEntries(
            Object.entries(data.myPicks).filter(
              (e): e is [string, string] => /^\d+$/.test(e[0]) && typeof e[1] === 'string',
            ),
          )
        : {},
      sketch: data.sketch == null ? null : cleanSketch(data.sketch),
      seenNight: typeof data.seenNight === 'number' ? Math.min(data.seenNight, day - 1) : -1,
      sawAwakening: data.sawAwakening === true,
      rampage: parseRampage(data.rampage),
    };
    return rollToDay(save, day);
  } catch {
    return newSave(season, day);
  }
}

/** A new season starts the votes afresh but keeps the player's own settings and Sketchbook. */
function carryOver(old: Partial<SaveState>, fresh: SaveState): SaveState {
  return {
    ...fresh,
    started: old.started === true,
    musicOn: old.musicOn !== false,
    musicVolume:
      typeof old.musicVolume === 'number' && Number.isFinite(old.musicVolume)
        ? Math.max(0, Math.min(1, old.musicVolume))
        : DEFAULT_MUSIC_VOLUME,
    sketch: old.sketch == null ? null : cleanSketch(old.sketch),
  };
}

export function serializeSave(save: SaveState): string {
  return JSON.stringify(save);
}

/**
 * Moving to another day clears that day's votes and selection but keeps history and
 * stats. A player who voted on the night before (a streak) gets the bonus vote.
 * A day the player already voted on keeps that vote (from `myPicks`), so moving the
 * clock back (as the switch to Central midnight did) never hands out a second free vote.
 */
export function rollToDay(save: SaveState, day: number): SaveState {
  if (save.day === day) return save;
  const pick = save.myPicks[String(day)];
  const votes: CastVote[] = pick ? [{ optionId: pick, kind: 'free' }] : [];
  const streak = save.stats.lastVotedDay === day - 1;
  const bonusVotes = streak ? RETURN_BONUS_VOTES : 0;
  return { ...save, day, votes, adVotesEarned: 0, bonusVotes, pending: null };
}

/** The streak bonus vote is still there to use today. */
export function bonusVoteWaiting(save: SaveState): boolean {
  return save.bonusVotes > 0 && save.votes.length < FREE_VOTES_PER_DAY + save.bonusVotes;
}

export function votesAllowed(save: SaveState): number {
  return FREE_VOTES_PER_DAY + save.bonusVotes + save.adVotesEarned;
}

export function votesRemaining(save: SaveState): number {
  return Math.max(0, votesAllowed(save) - save.votes.length);
}

export function hasVotedToday(save: SaveState): boolean {
  return save.votes.length > 0;
}

/** True when the player is out of votes but may still earn one more by watching an ad. */
export function canEarnAdVote(save: SaveState): boolean {
  return votesRemaining(save) === 0 && save.adVotesEarned < MAX_AD_VOTES_PER_DAY;
}

export function selectOption(save: SaveState, optionId: string | null): SaveState {
  return { ...save, pending: optionId };
}

/** Call only after the rewarded ad reports the reward as earned. */
export function grantAdVote(save: SaveState): SaveState {
  if (save.adVotesEarned >= MAX_AD_VOTES_PER_DAY) return save;
  return { ...save, adVotesEarned: save.adVotesEarned + 1 };
}

export function recordVote(save: SaveState, optionId: string): SaveState {
  if (votesRemaining(save) <= 0) throw new Error('No votes remaining today');
  const n = save.votes.length;
  const kind: CastVote['kind'] =
    n < FREE_VOTES_PER_DAY ? 'free' : n < FREE_VOTES_PER_DAY + save.bonusVotes ? 'bonus' : 'ad';
  const firstToday = save.votes.length === 0;
  const continuing = save.stats.lastVotedDay === save.day - 1;
  const stats = firstToday
    ? {
        totalVotes: save.stats.totalVotes + 1,
        daysVoted: save.stats.daysVoted + 1,
        lastVotedDay: save.day,
        streak: continuing ? save.stats.streak + 1 : 1,
      }
    : { ...save.stats, totalVotes: save.stats.totalVotes + 1 };
  return {
    ...save,
    votes: [...save.votes, { optionId, kind }],
    pending: null,
    stats,
    myPicks: { ...save.myPicks, [String(save.day)]: optionId },
  };
}

/** Keep the player's Sketchbook design. */
export function setSketch(save: SaveState, sketch: Parts): SaveState {
  return { ...save, sketch };
}

export function rememberResolved(save: SaveState, day: number, result: ResolvedDay): SaveState {
  return { ...save, history: { ...save.history, [String(day)]: result } };
}

/** Test Lab only: give back tonight's votes (the fake tally keeps the earlier ones). */
export function setMusic(save: SaveState, on: boolean): SaveState {
  return save.musicOn === on ? save : { ...save, musicOn: on };
}

export function setMusicVolume(save: SaveState, volume: number): SaveState {
  const v = Math.round(Math.max(0, Math.min(1, volume)) * 100) / 100;
  return save.musicVolume === v ? save : { ...save, musicVolume: v };
}

export function markStarted(save: SaveState): SaveState {
  return save.started ? save : { ...save, started: true };
}

/** The player has been shown the stitching of `night` (and so every night before it). */
export function markSeen(save: SaveState, night: number): SaveState {
  return night <= save.seenNight ? save : { ...save, seenNight: night };
}

function clampInt(v: unknown, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.floor(v)))
    : min;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

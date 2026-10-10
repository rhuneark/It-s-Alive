/**
 * The player's save: today's votes, ad-earned extra votes, the option they were
 * looking at, and a cache of already-resolved days. Pure reducers only; the
 * caller persists the result to appStorage after every step.
 */
import { cleanSketch, type Parts } from './sketch';
import type { WinReason } from './tally';

/** Everyone gets one vote per day. */
export const FREE_VOTES_PER_DAY = 1;
/**
 * Extra votes a player can earn per day by watching rewarded ads. Tuned in
 * scripts/simulate.ts: the largest cap where one player maxing it out flips at
 * most 10% of 100-voter days.
 */
export const MAX_AD_VOTES_PER_DAY = 1;

export const SAVE_VERSION = 1;
export const DEFAULT_MUSIC_VOLUME = 0.5;

export interface CastVote {
  optionId: string;
  kind: 'free' | 'ad';
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
}

export function newSave(season: string, day: number): SaveState {
  return {
    v: SAVE_VERSION,
    season,
    day,
    votes: [],
    adVotesEarned: 0,
    pending: null,
    history: {},
    stats: { totalVotes: 0, daysVoted: 0, lastVotedDay: -999, streak: 0 },
    started: false,
    musicOn: true,
    musicVolume: DEFAULT_MUSIC_VOLUME,
    myPicks: {},
    sketch: null,
  };
}

/** Parse a stored save defensively; anything unreadable or from another season starts fresh. */
export function parseSave(raw: string | null, season: string, day: number): SaveState {
  if (!raw) return newSave(season, day);
  try {
    const data = JSON.parse(raw) as Partial<SaveState>;
    if (data.v !== SAVE_VERSION || data.season !== season) return newSave(season, day);
    const base = newSave(season, day);
    const votes = Array.isArray(data.votes)
      ? data.votes.filter(
          (v): v is CastVote =>
            !!v && typeof v.optionId === 'string' && (v.kind === 'free' || v.kind === 'ad'),
        )
      : [];
    const save: SaveState = {
      ...base,
      day: typeof data.day === 'number' ? data.day : day,
      votes,
      adVotesEarned: clampInt(data.adVotesEarned, 0, MAX_AD_VOTES_PER_DAY),
      pending: typeof data.pending === 'string' ? data.pending : null,
      history: isRecord(data.history) ? (data.history as Record<string, ResolvedDay>) : {},
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
    };
    return rollToDay(save, day);
  } catch {
    return newSave(season, day);
  }
}

export function serializeSave(save: SaveState): string {
  return JSON.stringify(save);
}

/** Moving to a new day clears that day's votes and selection but keeps history and stats. */
export function rollToDay(save: SaveState, day: number): SaveState {
  if (save.day === day) return save;
  return { ...save, day, votes: [], adVotesEarned: 0, pending: null };
}

export function votesAllowed(save: SaveState): number {
  return FREE_VOTES_PER_DAY + save.adVotesEarned;
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
  const kind: CastVote['kind'] = save.votes.length < FREE_VOTES_PER_DAY ? 'free' : 'ad';
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
export function refillVotes(save: SaveState): SaveState {
  return { ...save, votes: [], adVotesEarned: 0, pending: null };
}

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

function clampInt(v: unknown, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.floor(v)))
    : min;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Game controller: owns the save, the clock and the shared tallies, and wires
 * the pure rules in src/game to the SDK wrapper. Every state change is written
 * to appStorage immediately so a player can always Continue where they left off.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SlotId } from '../game/catalog';
import { reminderPlan } from '../game/reminders';
import { pendingReveal, type Reveal } from '../game/reveal';
import {
  DAY_MS,
  SEASON,
  closedDays,
  dayIndexAt,
  phaseAt,
  seasonSchedule,
  type Phase,
} from '../game/schedule';
import {
  bonusVoteWaiting,
  canEarnAdVote,
  grantAdVote,
  markSeen,
  markStarted,
  markBrokeOut as saveBrokeOut,
  buyUpgrade as saveBuyUpgrade,
  claimDaily,
  recordRun,
  rememberRubble,
  newSave,
  parseSave,
  recordVote,
  rememberResolved,
  rollToDay,
  selectOption,
  setMusic,
  setMusicVolume,
  setSketch as saveSketch,
  serializeSave,
  votesRemaining,
  type SaveState,
} from '../game/state';
import { allStitched, awakeningDue, markAwakened, seasonTotals } from '../game/awakening';
import { bountiesFor, type Bounty } from '../game/bounty';
import {
  RUBBLE_BANDS,
  buildWorld,
  communitySize,
  rubbleBand,
  stageFor,
  totalFromBands,
  venueFor,
  type Stage,
  type Venue,
} from '../game/rampage';
import type { RunResult } from '../game/rampageRun';
import { storyRun, type UpgradeId } from '../game/upgrades';
import { rewardWaiting, streakToday } from '../game/daily';
import type { Parts } from '../game/sketch';
import { resolveDay } from '../game/tally';
import * as run from '../sdk/run';

/** The game's October Jam page, where players vote for it (Community Pick). */
export const JAM_VOTE_URL = 'https://run.world/jams/octoberjam?game=GORVjkIRThUz5n2tmAms';

export interface RampageInfo {
  /** 0 = Halloween. */
  day: number;
  /** Today's venue (a new one every midnight Central) and its place. */
  venue: Venue;
  stage: Stage;
  /** Same place for everyone on a day. */
  seed: string;
  /** Its real height today (world units): it grows every midnight with the community's rubble. */
  size: number;
  /** How much it grew at the last midnight. */
  grewBy: number;
  /** Everyone's rubble so far today (null until counted). */
  today: number | null;
  /** Until midnight Central, when today's rubble makes it grow. */
  growsInMs: number;
  /** The day's three bounties (the same for everyone), and the ones the player has done today. */
  bounties: Bounty[];
  done: string[];
  /** Where it goes tomorrow. */
  next: Venue;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'success';
}

export interface GameModel {
  loading: boolean;
  now: number;
  phase: Phase;
  save: SaveState;
  /** Winners so far, slot -> option id. */
  parts: Partial<Record<SlotId, string>>;
  /** Progress while past days are being tallied for the first time. */
  resolving: { done: number; total: number } | null;
  todayCounts: number[] | null;
  countsLoading: boolean;
  casting: boolean;
  adBusy: boolean;
  toast: Toast | null;
  begin: () => void;
  /** Schedule the daily reminders (opening the Sketchbook does this too). */
  armReminders: () => void;
  /** Last night's stitching, until the player has seen it (null for a first visit). */
  reveal: Reveal | null;
  dismissReveal: () => void;
  /** Halloween: the creature's waking scene has not been shown to this player yet. */
  awakening: boolean;
  /** Every night is tallied, so the finished creature can be drawn. */
  stitched: boolean;
  /** What went into the creature: nights tallied and every vote cast on them. */
  totals: { nights: number; votes: number };
  /** The waking scene was watched or skipped. */
  markAwake: () => void;
  /** The rampage (from Halloween on): today's place and how big the community has made it. */
  rampage: RampageInfo | null;
  /** A run ended: keep the player's stats, add its rubble to the community's tally, its score to the day's board. */
  finishRun: (result: RunResult) => Promise<run.RubbleResult>;
  /** A guest chose to sign in so a run counts. */
  countAsSignedIn: (result: RunResult) => Promise<run.RubbleResult>;
  /** The day's board (top three, and the player's place), and yesterday's (null until read). */
  board: run.DayBoard | null;
  yesterday: run.DayBoard | null;
  refreshBoard: () => Promise<void>;
  /** Today's reward for coming back is waiting (from Halloween on), and claiming it. */
  rewardWaiting: boolean;
  /** The streak claiming today's reward makes (1 = a fresh start). */
  rewardStreak: number;
  claimReward: () => void;
  /** The player has seen it break out of the laboratory. */
  markBrokeOut: () => void;
  /** Buy the next level of a story upgrade with rubble from the purse. */
  buyUpgrade: (id: UpgradeId) => void;
  /** Owner test mode: the day it pretends to be (null when off). */
  preview: number | null;
  /** Turn test mode on at a day (fresh throwaway save) or off (null), and reload. */
  setPreview: (day: number | null) => Promise<void>;
  select: (optionId: string | null) => void;
  cast: () => Promise<void>;
  watchAdForVote: () => Promise<void>;
  refreshCounts: () => Promise<void>;
  toggleMusic: () => void;
  /** Copy the October Jam vote link for the player (RUN's sandbox cannot open new tabs). */
  voteInJam: () => void;
  /** Live volume while dragging; saved shortly after the player lets go. */
  setVolume: (v: number) => void;
  /** Keep the player's Sketchbook design (debounced save). */
  setSketch: (sketch: Parts) => void;
  /** The slot voted on each night, for the Sketchbook's "my votes". */
  schedule: readonly SlotId[];
}

const SCHEDULE = seasonSchedule(SEASON);
const SLOTS = SCHEDULE.map((q) => q.slot);
const TALLY_REFRESH_MS = 60_000;

function currentDay(now: number): number {
  return Math.max(0, Math.min(dayIndexAt(now, SEASON), SCHEDULE.length));
}

export function partsFromHistory(save: SaveState): Partial<Record<SlotId, string>> {
  const parts: Partial<Record<SlotId, string>> = {};
  SCHEDULE.forEach((q, day) => {
    const r = save.history[String(day)];
    if (r) parts[q.slot] = r.winner;
  });
  return parts;
}

export function useGame(): GameModel {
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => run.now());
  const [save, setSave] = useState<SaveState>(() => newSave(SEASON.id, currentDay(run.now())));
  const [resolving, setResolving] = useState<GameModel['resolving']>(null);
  const [todayCounts, setTodayCounts] = useState<number[] | null>(null);
  const [countsLoading, setCountsLoading] = useState(false);
  const [casting, setCasting] = useState(false);
  const [adBusy, setAdBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const saveRef = useRef(save);
  const resolvingRef = useRef(false);

  /** Apply a change and persist it straight away (awaitable when it must land before moving on). */
  // Test mode switches saves: nothing is written mid-switch, and work started before a switch
  // (an `epoch` ago) is dropped rather than saved into the other save.
  const switching = useRef(false);
  const epoch = useRef(0);
  const commit = useCallback((next: SaveState): Promise<boolean> => {
    saveRef.current = next;
    setSave(next);
    if (switching.current) return Promise.resolve(false);
    return run.writeSave(serializeSave(next));
  }, []);

  const notify = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    setToast({ id: Date.now(), text, tone });
  }, []);

  const voteInJam = useCallback(() => {
    run.track('jam_vote_link');
    void run
      .copyText(JAM_VOTE_URL)
      .then((copied) =>
        notify(
          copied
            ? "Link copied! Paste it in your browser to vote for It's Alive!"
            : "Vote for It's Alive! at run.world/jams/octoberjam",
          copied ? 'success' : 'info',
        ),
      );
  }, [notify]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const phase = useMemo(() => phaseAt(now, SEASON), [now]);
  const day = phase.kind === 'voting' ? phase.day : -1;

  /** Tally every closed day we haven't resolved yet (results are final once a day ends). */
  const resolvePast = useCallback(async () => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    try {
      const missing = closedDays(run.now(), SEASON).filter(
        (d) => !saveRef.current.history[String(d)],
      );
      if (missing.length === 0) return;
      setResolving({ done: 0, total: missing.length });
      let done = 0;
      for (const d of missing) {
        const q = SCHEDULE[d];
        if (!q) continue;
        const ids = q.options.map((o) => o.id);
        const counts = await run.fetchCounts(SEASON.id, d, ids);
        if (!counts) {
          notify('The spirits are quiet. Some results will appear later.', 'error');
          break;
        }
        const result = resolveDay(counts, `${SEASON.id}:${d}`);
        void commit(
          rememberResolved(saveRef.current, d, {
            winner: ids[result.winnerIndex]!,
            counts,
            reason: result.reason,
          }),
        );
        done++;
        setResolving({ done, total: missing.length });
      }
    } finally {
      setResolving(null);
      resolvingRef.current = false;
    }
  }, [commit, notify]);

  const refreshCounts = useCallback(async () => {
    const p = phaseAt(run.now(), SEASON);
    if (p.kind !== 'voting') return;
    setCountsLoading(true);
    const counts = await run.fetchCounts(
      SEASON.id,
      p.day,
      p.question.options.map((o) => o.id),
    );
    setCountsLoading(false);
    if (!counts) {
      notify('Could not read the tally. Try again in a moment.', 'error');
      return;
    }
    // Never show fewer votes for an option than this player cast for it.
    const mine = saveRef.current.day === p.day ? saveRef.current.votes : [];
    setTodayCounts(
      counts.map((c, i) =>
        Math.max(c, mine.filter((v) => v.optionId === p.question.options[i]!.id).length),
      ),
    );
  }, [notify]);

  // Boot: wait for the SDK, load the save, then catch up on missed days.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await run.ready();
      const t = run.now();
      const loaded = parseSave(await run.loadSave(), SEASON.id, currentDay(t));
      if (cancelled) return;
      saveRef.current = loaded;
      setSave(loaded);
      setNow(t);
      setLoading(false);
      run.track('app_loaded', { day: currentDay(t), returning: loaded.started });
      run.funnel(1, 'app_loaded');
      void resolvePast();
      if (loaded.votes.length > 0) void refreshCounts();
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvePast, refreshCounts]);

  // Clock tick (1s) for the countdown and the midnight rollover.
  useEffect(() => {
    const id = setInterval(() => setNow(run.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Midnight Central: the day's winner is stitched on and a new question opens.
  useEffect(() => {
    if (loading) return;
    const d = currentDay(now);
    if (saveRef.current.day !== d) {
      void commit(rollToDay(saveRef.current, d));
      setTodayCounts(null);
      void resolvePast();
    }
  }, [now, loading, commit, resolvePast]);

  // Keep the revealed tally fresh while the player is looking at it.
  useEffect(() => {
    if (loading || save.votes.length === 0 || day < 0) return;
    const id = setInterval(() => void refreshCounts(), TALLY_REFRESH_MS);
    return () => clearInterval(id);
  }, [loading, save.votes.length, day, refreshCounts]);

  useEffect(() => {
    return run.onLifecycle({
      onResume: () => {
        void run.syncClock().then(() => {
          setNow(run.now());
          void resolvePast();
          if (saveRef.current.votes.length > 0) void refreshCounts();
        });
      },
    });
  }, [resolvePast, refreshCounts]);

  /** Daily reminders for the coming week, from now on (Continue, the Sketchbook, a vote). */
  const armReminders = useCallback(() => {
    const t = run.now();
    const p = phaseAt(t, SEASON);
    const s = saveRef.current;
    const today = p.kind === 'voting' && s.day === p.day;
    run.setReminders(
      reminderPlan(t, SEASON, SCHEDULE, today && s.votes.length > 0, today && bonusVoteWaiting(s)),
    );
  }, []);

  const begin = useCallback(() => {
    const s = saveRef.current;
    // A first visit starts from tonight: past stitchings are in the Chronicle, not a reveal
    // (every night closed so far, tallied yet or not).
    void commit(markStarted(s.started ? s : markSeen(s, currentDay(run.now()) - 1)));
    run.funnel(2, 'begin');
    armReminders();
  }, [commit, armReminders]);

  const reveal = useMemo(() => (save.started ? pendingReveal(save, SCHEDULE) : null), [save]);
  const dismissReveal = useCallback(() => {
    const r = pendingReveal(saveRef.current, SCHEDULE);
    if (r) void commit(markSeen(saveRef.current, r.night));
  }, [commit]);

  const awakening = awakeningDue(save, phase);
  const stitched = useMemo(() => allStitched(save, SCHEDULE), [save]);
  // From Halloween on the creature must be the one everyone built: keep asking for any night
  // whose tally failed until every part is known.
  useEffect(() => {
    if (loading || stitched || resolving || phase.kind !== 'awakened') return;
    const id = setTimeout(() => void resolvePast(), 4000);
    return () => clearTimeout(id);
  }, [loading, stitched, resolving, phase.kind, resolvePast]);
  const totals = useMemo(() => seasonTotals(save, SCHEDULE), [save]);
  const markAwake = useCallback(() => {
    if (!saveRef.current.sawAwakening) void commit(markAwakened(saveRef.current, SCHEDULE));
  }, [commit]);

  // ------------------------------------------------------------- the rampage
  const rampageDay = phase.kind === 'awakened' ? phase.daysSinceAwakening : -1;
  const [todayRubble, setTodayRubble] = useState<number | null>(null);
  /** When a rampage day starts (game days run 05:00 to 05:00 UTC). */
  const dayStart = (d: number) => SEASON.awakenMs + d * DAY_MS;
  const [board, setBoard] = useState<run.DayBoard | null>(null);
  const [yesterday, setYesterday] = useState<run.DayBoard | null>(null);
  const refreshBoard = useCallback(async () => {
    const d = phaseAt(run.now(), SEASON);
    if (d.kind !== 'awakened') return;
    const mine = epoch.current;
    const day = d.daysSinceAwakening;
    const [today, before] = await Promise.all([
      run.fetchBoard(day, SEASON.awakenMs + day * DAY_MS),
      day > 0 ? run.fetchBoard(day - 1, SEASON.awakenMs + (day - 1) * DAY_MS) : null,
    ]);
    if (epoch.current !== mine) return;
    if (today) setBoard(today);
    if (before) setYesterday(before);
  }, []);
  useEffect(() => {
    setBoard(null);
    setYesterday(null);
    if (!loading && rampageDay >= 0) void refreshBoard();
  }, [loading, rampageDay, refreshBoard]);
  const seasonDay = dayIndexAt(now, SEASON);
  const rewardIsWaiting = rampageDay >= 0 && rewardWaiting(save.daily, seasonDay);
  const claimReward = useCallback(() => {
    const today = dayIndexAt(run.now(), SEASON);
    const before = saveRef.current;
    const after = claimDaily(before, today);
    if (after === before) return;
    void commit(after);
    run.haptic('success');
    run.track('daily_reward', { streak: after.daily.streak });
  }, [commit]);
  const rubbleBusy = useRef(false);

  /** Count closed rampage days once (they are final), then today's so far. */
  const refreshRubble = useCallback(async () => {
    const d = phaseAt(run.now(), SEASON);
    if (d.kind !== 'awakened' || rubbleBusy.current) return;
    rubbleBusy.current = true;
    const mine = epoch.current;
    try {
      for (let past = 0; past < d.daysSinceAwakening; past++) {
        if (saveRef.current.rampage.totals[String(past)] !== undefined) continue;
        const counts = await run.fetchRubble(SEASON.id, past, RUBBLE_BANDS);
        if (!counts || epoch.current !== mine) return;
        void commit(rememberRubble(saveRef.current, past, totalFromBands(counts)));
      }
      const counts = await run.fetchRubble(SEASON.id, d.daysSinceAwakening, RUBBLE_BANDS);
      if (counts && epoch.current === mine) setTodayRubble(totalFromBands(counts));
    } finally {
      rubbleBusy.current = false;
    }
  }, [commit]);

  useEffect(() => {
    if (!loading && rampageDay >= 0) void refreshRubble();
  }, [loading, rampageDay, refreshRubble]);

  // The day's bounties come from the day's place (the same for everyone).
  const bounties = useMemo(() => {
    if (rampageDay < 0) return [];
    const seed = `${SEASON.id}:r${rampageDay}`;
    return bountiesFor(seed, buildWorld(seed, stageFor(rampageDay)));
  }, [rampageDay]);

  const rampage = useMemo<RampageInfo | null>(() => {
    if (rampageDay < 0) return null;
    const before = (day: number) => {
      let sum = 0;
      for (let d = 0; d < day; d++) sum += save.rampage.totals[String(d)] ?? 0;
      return sum;
    };
    const size = communitySize(before(rampageDay));
    const nextMidnight = SEASON.startMs + (dayIndexAt(now, SEASON) + 1) * DAY_MS;
    return {
      day: rampageDay,
      venue: venueFor(rampageDay),
      stage: stageFor(rampageDay),
      seed: `${SEASON.id}:r${rampageDay}`,
      size,
      grewBy: rampageDay > 0 ? size - communitySize(before(rampageDay - 1)) : 0,
      today: todayRubble,
      growsInMs: Math.max(0, nextMidnight - now),
      bounties,
      done: save.rampage.day === rampageDay ? save.rampage.bounties : [],
      next: venueFor(rampageDay + 1),
    };
  }, [
    rampageDay,
    save.rampage.totals,
    save.rampage.day,
    save.rampage.bounties,
    todayRubble,
    now,
    bounties,
  ]);

  const finishRun = useCallback(
    async (result: RunResult) => {
      const d = rampageDay < 0 ? 0 : rampageDay;
      void commit(recordRun(saveRef.current, d, result.rubble, result.bounties));
      run.track('rampage_end', {
        day: d,
        rubble: result.rubble,
        peak: result.peak,
        powers: result.powers.length,
      });
      // The village's tally counts the rubble before the player's own upgrades multiplied it; the
      // day's board, the run's own score.
      const [how] = await Promise.all([
        run.recordRubble(SEASON.id, d, rubbleBand(result.baseRubble)),
        run.submitScore(
          d,
          dayStart(d),
          result.rubble,
          storyRun(saveRef.current.rampage.levels).seconds,
        ),
      ]);
      void refreshRubble();
      void refreshBoard();
      return how;
    },
    [commit, rampageDay, refreshRubble, refreshBoard],
  );

  // Owner test mode (hidden in Diagnostics): pretend it is another day, from a throwaway save.
  const [preview, setPreviewDay] = useState<number | null>(null);
  const setPreview = useCallback(
    async (day: number | null) => {
      epoch.current += 1;
      switching.current = true;
      setLoading(true);
      run.setPreview(day);
      const t = run.now();
      let loaded: SaveState;
      if (day === null) {
        loaded = parseSave(await run.loadSave(), SEASON.id, currentDay(t));
      } else {
        // A fresh throwaway save (keeping the music settings), replacing any earlier one.
        loaded = {
          ...newSave(SEASON.id, currentDay(t)),
          musicOn: saveRef.current.musicOn,
          musicVolume: saveRef.current.musicVolume,
        };
        await run.writeSave(serializeSave(loaded));
      }
      saveRef.current = loaded;
      setSave(loaded);
      setNow(t);
      setTodayCounts(null);
      setTodayRubble(null);
      setPreviewDay(day);
      switching.current = false;
      setLoading(false);
      void resolvePast();
    },
    [resolvePast],
  );

  const markBrokeOut = useCallback(() => {
    void commit(saveBrokeOut(saveRef.current));
  }, [commit]);

  const buyUpgrade = useCallback(
    (id: UpgradeId) => {
      const next = saveBuyUpgrade(saveRef.current, id);
      if (next === saveRef.current) return;
      void commit(next);
      run.haptic('success');
      run.track('upgrade', { id, level: next.rampage.levels[id] ?? 0 });
    },
    [commit],
  );

  const countAsSignedIn = useCallback(
    async (result: RunResult) => {
      if (!(await run.signIn())) return 'guest' as const;
      const d = Math.max(0, rampageDay);
      const how = await run.recordRubble(SEASON.id, d, rubbleBand(result.baseRubble));
      await run.submitScore(
        d,
        dayStart(d),
        result.rubble,
        storyRun(saveRef.current.rampage.levels).seconds,
      );
      void refreshRubble();
      void refreshBoard();
      return how;
    },
    [rampageDay, refreshRubble, refreshBoard],
  );

  const select = useCallback(
    (optionId: string | null) => {
      void commit(selectOption(saveRef.current, optionId));
      if (optionId) run.haptic('light');
    },
    [commit],
  );

  const cast = useCallback(async () => {
    const s = saveRef.current;
    const p = phaseAt(run.now(), SEASON);
    if (p.kind !== 'voting' || !s.pending || casting) return;
    if (p.day !== s.day) {
      notify('The clock struck midnight. A new question awaits!', 'info');
      return;
    }
    if (votesRemaining(s) <= 0) return;
    const optionId = s.pending;
    setCasting(true);
    const res = await run.castVote(SEASON.id, p.day, optionId);
    setCasting(false);
    if (!res.ok) {
      notify(
        res.reason === 'login'
          ? 'Sign in to RUN to cast your vote. One soul, one vote!'
          : res.reason === 'offline'
            ? 'No connection. Your vote was not cast.'
            : 'A storm scrambled the telegraph. Your vote was not cast. Try again.',
        'error',
      );
      return;
    }
    const next = recordVote(saveRef.current, optionId);
    await commit(next);
    run.haptic('heavy');
    run.track('vote_cast', {
      day: p.day,
      slot: p.question.slot,
      option: optionId,
      kind: next.votes.at(-1)!.kind,
    });
    if (next.votes.length === 1) {
      run.funnel(3, 'first_vote');
      armReminders(); // tonight's reminder is no longer needed
    }
    await refreshCounts();
  }, [casting, commit, notify, refreshCounts, armReminders]);

  const watchAdForVote = useCallback(async () => {
    if (adBusy || !canEarnAdVote(saveRef.current)) return;
    setAdBusy(true);
    run.track('rewarded_offer_tapped', { day });
    const isReady = await run.rewardedAdReady();
    if (!isReady) {
      setAdBusy(false);
      notify('No ad is ready right now. Try again soon.', 'info');
      return;
    }
    const earned = await run.showRewardedAd();
    setAdBusy(false);
    if (!earned) {
      run.track('rewarded_not_earned', { day });
      notify('The ad ended early, so no extra vote this time.', 'info');
      return;
    }
    await commit(grantAdVote(saveRef.current));
    run.track('rewarded_vote_earned', { day });
    notify('Another vote is yours. Choose wisely.', 'success');
  }, [adBusy, commit, day, notify]);

  const toggleMusic = useCallback(() => {
    const on = !saveRef.current.musicOn;
    void commit(setMusic(saveRef.current, on));
    run.track('music_toggled', { on });
  }, [commit]);

  const volumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setVolume = useCallback(
    (v: number) => {
      const next = setMusicVolume(saveRef.current, v);
      saveRef.current = next;
      setSave(next);
      if (volumeTimer.current) clearTimeout(volumeTimer.current);
      // Debounced so dragging the slider doesn't hammer cloud storage.
      volumeTimer.current = setTimeout(() => void commit(saveRef.current), 600);
    },
    [commit],
  );

  const sketchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setSketch = useCallback(
    (sketch: Parts) => {
      const next = saveSketch(saveRef.current, sketch);
      saveRef.current = next;
      setSave(next);
      if (sketchTimer.current) clearTimeout(sketchTimer.current);
      // A burst of taps becomes one cloud write.
      sketchTimer.current = setTimeout(() => void commit(saveRef.current), 800);
    },
    [commit],
  );

  const parts = useMemo(() => partsFromHistory(save), [save]);

  return {
    loading,
    now,
    phase,
    save,
    parts,
    resolving,
    todayCounts,
    countsLoading,
    casting,
    adBusy,
    toast,
    begin,
    armReminders,
    reveal,
    dismissReveal,
    awakening,
    stitched,
    totals,
    markAwake,
    rampage,
    finishRun,
    countAsSignedIn,
    board,
    yesterday,
    refreshBoard,
    rewardWaiting: rewardIsWaiting,
    rewardStreak: streakToday(save.daily, seasonDay),
    claimReward,
    markBrokeOut,
    buyUpgrade,
    preview,
    setPreview,
    select,
    cast,
    watchAdForVote,
    refreshCounts,
    toggleMusic,
    voteInJam,
    setVolume,
    setSketch,
    schedule: SLOTS,
  };
}

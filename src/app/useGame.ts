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
  SEASON,
  closedDays,
  dayIndexAt,
  phaseAt,
  seasonSchedule,
  type Phase,
} from '../game/schedule';
import {
  canEarnAdVote,
  grantAdVote,
  markSeen,
  markStarted,
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
import type { Parts } from '../game/sketch';
import { resolveDay } from '../game/tally';
import * as run from '../sdk/run';

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
  select: (optionId: string | null) => void;
  cast: () => Promise<void>;
  watchAdForVote: () => Promise<void>;
  refreshCounts: () => Promise<void>;
  toggleMusic: () => void;
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
  const commit = useCallback((next: SaveState): Promise<boolean> => {
    saveRef.current = next;
    setSave(next);
    return run.writeSave(serializeSave(next));
  }, []);

  const notify = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    setToast({ id: Date.now(), text, tone });
  }, []);

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
    const voted =
      p.kind === 'voting' && saveRef.current.day === p.day && saveRef.current.votes.length > 0;
    run.setReminders(reminderPlan(t, SEASON, SCHEDULE, voted));
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
    select,
    cast,
    watchAdForVote,
    refreshCounts,
    toggleMusic,
    setVolume,
    setSketch,
    schedule: SLOTS,
  };
}

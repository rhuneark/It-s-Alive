/**
 * The main theme ("The Assembly"). Plays on a loop while `on` is true, fades in and
 * out, dips around the loop point so the restart isn't jarring, and goes quiet
 * whenever the host pauses/sleeps the game or the tab is hidden. The track is only
 * downloaded the first time music is actually wanted.
 */
import { useEffect, useRef, useState } from 'react';
import * as run from '../sdk/run';

const VOLUME = 0.45;
/** Seconds of fade at each end of the track, so the loop seam is soft. */
const SEAM_S = 2.5;
const FADE_STEP = 0.06;
const FADE_TICK_MS = 50;

export function useMusic(on: boolean): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wantRef = useRef(on);
  const awayRef = useRef(false);
  const masterRef = useRef(0);
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncRef = useRef<() => void>(() => {});
  const retryArmedRef = useRef(false);
  /** Web Audio gain (iOS ignores HTMLAudioElement.volume); null falls back to audio.volume. */
  const gainRef = useRef<GainNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const [armed, setArmed] = useState(on);

  useEffect(() => {
    if (on) setArmed(true);
  }, [on]);

  useEffect(() => {
    if (!armed) return;
    const seam = (a: HTMLAudioElement) => {
      const d = Number.isFinite(a.duration) ? a.duration : 0;
      const t = a.currentTime;
      return d > SEAM_S * 2 ? Math.max(0, Math.min(1, t / SEAM_S, (d - t) / SEAM_S)) : 1;
    };
    const apply = () => {
      const a = audioRef.current;
      if (!a) return;
      const level = Math.max(0, Math.min(1, VOLUME * masterRef.current * seam(a)));
      if (gainRef.current) gainRef.current.gain.value = level;
      else a.volume = level;
    };
    const retryOnGesture = () => {
      if (retryArmedRef.current) return;
      retryArmedRef.current = true;
      const retry = () => {
        retryArmedRef.current = false;
        syncRef.current();
      };
      document.addEventListener('pointerdown', retry, { once: true });
    };
    const fadeTo = (target: number) => {
      if (fadeRef.current) clearInterval(fadeRef.current);
      fadeRef.current = setInterval(() => {
        const m = masterRef.current;
        masterRef.current =
          target > m ? Math.min(target, m + FADE_STEP) : Math.max(target, m - FADE_STEP);
        apply();
        if (masterRef.current === target) {
          if (fadeRef.current) clearInterval(fadeRef.current);
          fadeRef.current = null;
          if (target === 0) audioRef.current?.pause();
        }
      }, FADE_TICK_MS);
    };
    syncRef.current = () => {
      const a = audioRef.current;
      if (!a) return;
      if (wantRef.current && !awayRef.current) {
        if (a.paused) {
          void ctxRef.current?.resume().catch(() => {});
          a.play().then(
            // The wish may have changed while play() was pending.
            () => fadeTo(wantRef.current && !awayRef.current ? 1 : 0),
            // Browsers can block audio until the player interacts; try again on the next tap.
            () => retryOnGesture(),
          );
        } else {
          fadeTo(1);
        }
      } else if (!a.paused) {
        fadeTo(0);
      }
    };

    let url: string | null = null;
    let cancelled = false;
    void run.loadThemeUrl().then((u) => {
      if (!u) return;
      if (cancelled) {
        URL.revokeObjectURL(u);
        return;
      }
      url = u;
      const a = new Audio(u);
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;
      a.addEventListener('timeupdate', apply);
      try {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) {
          const ctx = new AC();
          const gain = ctx.createGain();
          gain.gain.value = 0;
          ctx.createMediaElementSource(a).connect(gain);
          gain.connect(ctx.destination);
          ctxRef.current = ctx;
          gainRef.current = gain;
        }
      } catch {
        ctxRef.current = null;
        gainRef.current = null;
      }
      audioRef.current = a;
      syncRef.current();
    });

    const setAway = (away: boolean) => {
      awayRef.current = away;
      syncRef.current();
    };
    const onVisibility = () => setAway(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    const unsubscribe = run.onLifecycle({
      onPause: () => setAway(true),
      onSleep: () => setAway(true),
      onResume: () => setAway(false),
      onAwake: () => setAway(false),
    });

    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
      if (fadeRef.current) clearInterval(fadeRef.current);
      audioRef.current?.pause();
      audioRef.current = null;
      gainRef.current = null;
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      if (url) URL.revokeObjectURL(url);
    };
  }, [armed]);

  useEffect(() => {
    wantRef.current = on;
    syncRef.current();
  }, [on]);
}

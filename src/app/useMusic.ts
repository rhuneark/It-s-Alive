/**
 * The main theme ("The Assembly"): one shared player for the whole app.
 *
 * Mobile browsers and WebViews only let sound start from a tap, and a Web Audio
 * context created outside a tap starts "suspended": an element routed through it
 * plays in silence even though play() succeeds. So:
 * - every tap anywhere (capture phase, before React's handler) calls unlock(),
 *   which creates/resumes the AudioContext and starts playback inside the gesture;
 * - the element plays on its own until the context is confirmed running, and only
 *   then is routed through a GainNode (needed because iOS ignores audio.volume).
 * The track loops with a soft fade across the seam, follows the player's volume,
 * and goes quiet while the host pauses/sleeps the game or the tab is hidden.
 */
import { useEffect } from 'react';
import * as run from '../sdk/run';

/** Seconds of fade at each end of the track, so the loop seam is soft. */
const SEAM_S = 2.5;
const FADE_STEP = 0.06;
const FADE_TICK_MS = 50;

export interface MusicDiagnostics {
  source: string;
  element: string;
  context: string;
  routed: boolean;
  lastError: string;
}

class ThemePlayer {
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private routed = false;
  /** Remote stream (last-resort source): never route through Web Audio. */
  private direct = false;
  private loading: Promise<void> | null = null;
  private wanted = false;
  private away = false;
  private volume = 0.5;
  private master = 0;
  private fade: ReturnType<typeof setInterval> | null = null;
  private source = 'not loaded';
  private lastError = 'none';

  /** Download the track (once). Safe to call before the player has tapped anything. */
  prefetch(): void {
    if (this.loading) return;
    this.source = 'loading…';
    this.loading = run.loadTheme().then(
      (src) => {
        const a = new Audio();
        a.loop = true;
        a.preload = 'auto';
        if (src.direct) a.crossOrigin = 'anonymous';
        a.src = src.url;
        this.direct = src.direct;
        a.volume = 0;
        a.addEventListener('timeupdate', () => this.apply());
        a.addEventListener('error', () => this.fail(`element error ${a.error?.code ?? '?'}`));
        this.audio = a;
        this.source = src.direct
          ? 'streaming from CDN (no volume control on iPhone)'
          : `${src.from}, ${Math.round(src.bytes / 1024)} KB, ${src.type}`;
        this.sync();
      },
      (err: unknown) => {
        this.loading = null; // allow a retry later
        this.source = 'failed';
        this.fail(err);
      },
    );
  }

  /** Call from inside a user gesture: unlocks audio output and starts playback if wanted. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) {
          this.ctx = new AC();
          this.ctx.onstatechange = () => this.route();
        }
      }
      if (this.ctx && this.ctx.state !== 'running') {
        this.ctx.resume().then(
          () => this.route(),
          (err: unknown) => this.fail(err),
        );
      }
    } catch (err) {
      this.fail(err);
    }
    this.route();
    if (this.audio && this.wanted && !this.away && this.audio.paused) this.play();
  }

  setWanted(on: boolean): void {
    this.wanted = on;
    if (on) this.prefetch();
    this.sync();
  }

  setAway(away: boolean): void {
    this.away = away;
    if (!away) void this.ctx?.resume().catch(() => {});
    this.sync();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.apply();
  }

  diagnostics(): MusicDiagnostics {
    const a = this.audio;
    return {
      source: this.source,
      element: a
        ? `${a.paused ? 'paused' : 'playing'} at ${a.currentTime.toFixed(1)}s, ready ${a.readyState}`
        : 'none',
      context: this.ctx ? this.ctx.state : 'not created (no tap yet)',
      routed: this.routed,
      lastError: this.lastError,
    };
  }

  private fail(err: unknown): void {
    this.lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.warn('[music]', err);
  }

  /** Route through Web Audio only once the context is really running (else it would be silent). */
  private route(): void {
    const { ctx, audio } = this;
    if (this.routed || this.direct || !ctx || !audio || ctx.state !== 'running') return;
    try {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(audio).connect(gain);
      gain.connect(ctx.destination);
      this.gain = gain;
      this.routed = true;
      audio.volume = 1;
      this.apply();
    } catch (err) {
      this.fail(err);
    }
  }

  private seam(a: HTMLAudioElement): number {
    const d = Number.isFinite(a.duration) ? a.duration : 0;
    const t = a.currentTime;
    return d > SEAM_S * 2 ? Math.max(0, Math.min(1, t / SEAM_S, (d - t) / SEAM_S)) : 1;
  }

  private apply(): void {
    const a = this.audio;
    if (!a) return;
    const level = Math.max(0, Math.min(1, this.volume * this.master * this.seam(a)));
    if (this.routed && this.gain) this.gain.gain.value = level;
    else a.volume = level;
  }

  private fadeTo(target: number): void {
    if (this.fade) clearInterval(this.fade);
    this.fade = setInterval(() => {
      const m = this.master;
      this.master = target > m ? Math.min(target, m + FADE_STEP) : Math.max(target, m - FADE_STEP);
      this.apply();
      if (this.master === target) {
        if (this.fade) clearInterval(this.fade);
        this.fade = null;
        if (target === 0) this.audio?.pause();
      }
    }, FADE_TICK_MS);
  }

  private play(): void {
    const a = this.audio;
    if (!a) return;
    try {
      a.play().then(
        () => {
          this.route();
          this.fadeTo(this.wanted && !this.away ? 1 : 0);
        },
        // Blocked until the player taps; unlock() on the next tap tries again.
        (err: unknown) => this.fail(err),
      );
    } catch (err) {
      this.fail(err);
    }
  }

  private sync(): void {
    const a = this.audio;
    if (!a) return;
    if (this.wanted && !this.away) {
      if (a.paused) this.play();
      else this.fadeTo(1);
    } else if (!a.paused) {
      this.fadeTo(0);
    }
  }
}

export const theme = new ThemePlayer();

let gestureHooked = false;
function hookGestures(): void {
  if (gestureHooked) return;
  gestureHooked = true;
  const unlock = () => theme.unlock();
  for (const type of ['pointerdown', 'touchend', 'click', 'keydown'] as const) {
    document.addEventListener(type, unlock, { capture: true, passive: true });
  }
}

/**
 * Keep the shared player in step with the app. `prefetch` starts the download
 * (title screen, music on); `on` is whether it should be audible right now.
 */
export function useMusic({
  prefetch,
  on,
  volume,
}: {
  prefetch: boolean;
  on: boolean;
  volume: number;
}) {
  useEffect(() => {
    hookGestures();
    const setAway = (away: boolean) => theme.setAway(away);
    const onVisibility = () => setAway(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    const unsubscribe = run.onLifecycle({
      onPause: () => setAway(true),
      onSleep: () => setAway(true),
      onResume: () => setAway(false),
      onAwake: () => setAway(false),
    });
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (prefetch) theme.prefetch();
  }, [prefetch]);

  useEffect(() => {
    theme.setWanted(on);
  }, [on]);

  useEffect(() => {
    theme.setVolume(volume);
  }, [volume]);
}

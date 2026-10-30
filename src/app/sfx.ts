/**
 * Storm sounds for the awakening, made from filtered noise (no audio files to ship). They play
 * through the theme's AudioContext, which the player's taps have already unlocked, scaled by the
 * music volume. Silent when there is no audio output yet; never throws.
 */
import { theme } from './useMusic';

function noise(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      // Integrated noise: the deep, rolling part of thunder.
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = white;
  }
  return buf;
}

interface Burst {
  /** Seconds from now. */
  at: number;
  seconds: number;
  brown: boolean;
  filter: BiquadFilterType;
  /** Filter cutoff sweeps from `from` to `to` Hz. */
  from: number;
  to: number;
  peak: number;
  attack: number;
}

function burst(ctx: AudioContext, b: Burst): void {
  const t = ctx.currentTime + 0.01 + b.at;
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, b.seconds, b.brown);
  const filter = ctx.createBiquadFilter();
  filter.type = b.filter;
  filter.frequency.setValueAtTime(b.from, t);
  filter.frequency.exponentialRampToValueAtTime(b.to, t + b.seconds);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, b.peak), t + b.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + b.seconds);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start(t);
  src.stop(t + b.seconds + 0.05);
}

function play(volume: number, bursts: Burst[]): void {
  const ctx = theme.output();
  if (!ctx || volume <= 0) return;
  try {
    for (const b of bursts) burst(ctx, { ...b, peak: b.peak * volume });
  } catch {
    // No sound is better than a broken scene.
  }
}

/** A far-off roll of thunder. */
export function distantThunder(volume: number): void {
  play(volume, [
    {
      at: 0,
      seconds: 3.4,
      brown: true,
      filter: 'lowpass',
      from: 420,
      to: 80,
      peak: 0.5,
      attack: 0.9,
    },
  ]);
}

/** The generator building charge: a few sharp electric snaps. */
export function crackle(volume: number): void {
  play(
    volume,
    [0, 0.14, 0.22, 0.5, 0.58, 0.9].map((at, i) => ({
      at,
      seconds: 0.06 + (i % 2) * 0.04,
      brown: false,
      filter: 'highpass' as const,
      from: 2600,
      to: 5200,
      peak: 0.28,
      attack: 0.004,
    })),
  );
}

/** The strike: a crack overhead, then thunder rolling away. */
export function thunderclap(volume: number): void {
  play(volume, [
    {
      at: 0,
      seconds: 0.35,
      brown: false,
      filter: 'highpass',
      from: 900,
      to: 300,
      peak: 0.6,
      attack: 0.003,
    },
    {
      at: 0.02,
      seconds: 3.2,
      brown: true,
      filter: 'lowpass',
      from: 2400,
      to: 70,
      peak: 1,
      attack: 0.02,
    },
  ]);
}

/** A smash: from a crunch (small things) to a crash that shakes the ground (big ones). */
export function thud(volume: number, weight: number): void {
  const w = Math.max(0, Math.min(1, weight));
  play(volume, [
    {
      at: 0,
      seconds: 0.18 + 0.6 * w,
      brown: w > 0.3,
      filter: 'lowpass',
      from: 900 + 1400 * (1 - w),
      to: 80,
      peak: 0.18 + 0.7 * w,
      attack: 0.005,
    },
  ]);
}

/** The creature's roar as it breaks out: a long, rough bellow. */
export function roar(volume: number): void {
  play(volume, [
    {
      at: 0,
      seconds: 1.8,
      brown: false,
      filter: 'bandpass',
      from: 380,
      to: 140,
      peak: 0.55,
      attack: 0.18,
    },
    {
      at: 0.05,
      seconds: 1.9,
      brown: true,
      filter: 'lowpass',
      from: 600,
      to: 90,
      peak: 0.9,
      attack: 0.25,
    },
  ]);
  tones(volume, [
    { at: 0, freq: 82, to: 55, seconds: 1.7, peak: 0.12, type: 'sawtooth' },
    { at: 0, freq: 123, to: 80, seconds: 1.6, peak: 0.08, type: 'sawtooth' },
  ]);
}

/** A part waking: a short eerie rising chime. */
export function chime(volume: number): void {
  tones(volume, [
    { at: 0, freq: 392, to: 392, seconds: 0.5, peak: 0.12, type: 'triangle' },
    { at: 0.09, freq: 587, to: 587, seconds: 0.55, peak: 0.1, type: 'triangle' },
    { at: 0.18, freq: 784, to: 790, seconds: 0.8, peak: 0.09, type: 'sine' },
  ]);
}

interface Tone {
  at: number;
  freq: number;
  /** Glides to this frequency. */
  to: number;
  seconds: number;
  peak: number;
  type: OscillatorType;
}

function tones(volume: number, list: Tone[]): void {
  const ctx = theme.output();
  if (!ctx || volume <= 0) return;
  try {
    for (const t of list) {
      const at = ctx.currentTime + 0.01 + t.at;
      const osc = ctx.createOscillator();
      osc.type = t.type;
      osc.frequency.setValueAtTime(t.freq, at);
      osc.frequency.exponentialRampToValueAtTime(t.to, at + t.seconds);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, t.peak * volume), at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + t.seconds);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + t.seconds + 0.05);
    }
  } catch {
    // No sound is better than a broken scene.
  }
}

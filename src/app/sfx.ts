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

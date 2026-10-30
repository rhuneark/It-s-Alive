/**
 * The vigil's storm: lightning strikes at random, more and more often as midnight nears
 * (`stormGap`), each followed by thunder (nearer strikes sooner and louder). Nothing strikes for
 * players who asked for less motion.
 */
import { useEffect, useRef, useState } from 'react';
import { stormGap } from '../game/awakening';
import { distantThunder, thunderclap } from './sfx';

export interface Strike {
  /** Changes with every strike (use it as a React key to replay the flash). */
  id: number;
  /** Where it strikes across the window, 0..1. */
  x: number;
  /** A near strike: brighter, and the thunder follows at once. */
  near: boolean;
}

export function useStorm(active: boolean, msLeft: number, volume: number): Strike | null {
  const [strike, setStrike] = useState<Strike | null>(null);
  const left = useRef(msLeft);
  left.current = msLeft;
  const vol = useRef(volume);
  vol.current = volume;

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
    };
    let id = 0;
    const strikeNow = () => {
      id += 1;
      const near = left.current < 3_600_000 ? Math.random() < 0.6 : Math.random() < 0.3;
      setStrike({ id, x: Math.random(), near });
      later(
        () => (near ? thunderclap(vol.current * 0.6) : distantThunder(vol.current)),
        near ? 220 : 700 + Math.random() * 1000,
      );
      later(strikeNow, stormGap(left.current, Math.random()));
    };
    later(strikeNow, 900);
    return () => timers.forEach(clearTimeout);
  }, [active]);

  return active ? strike : null;
}

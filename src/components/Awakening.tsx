import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SlotId } from '../game/catalog';
import { crackle, distantThunder, thunderclap } from '../app/sfx';
import * as run from '../sdk/run';
import { Monster } from './Monster';

/**
 * Halloween: the creature everyone built wakes up. A short scene, played once for every player
 * the first time they open the game from midnight Central on (and again from the Awakened screen):
 * the dark lab in the rain, the spark gathering, the strike, colour flooding back into the
 * stitched body, the first twitch, and IT'S ALIVE!
 */
type Stage = 'intro' | 'dark' | 'charge' | 'strike' | 'surge' | 'alive' | 'done';

/** When each stage begins, in ms after the player taps "Witness the awakening". */
const TIMELINE: ReadonlyArray<readonly [Stage, number]> = [
  ['dark', 0],
  ['charge', 1900],
  ['strike', 3700],
  ['surge', 4250],
  ['alive', 5900],
  ['done', 7600],
];

/** What the chosen spark of life does as it gathers. */
const SPARK_LINES: Record<string, string> = {
  lightning: 'The storm breaks over the tower…',
  curse: 'Old words are spoken over the slab…',
  moon: 'The Blood Moon rises…',
  ghostfire: 'Cold blue souls pour in…',
  elixir: 'One drop of the elixir…',
};

const DORMANT: ReadonlySet<Stage> = new Set(['intro', 'dark', 'charge', 'strike']);

interface Props {
  parts: Partial<Record<SlotId, string>>;
  /** The spark of life chosen on the last night (its colour and line). */
  spark: string | null;
  totals: { nights: number; votes: number };
  /** Every night is tallied: the creature that wakes is exactly the one everyone built. */
  ready: boolean;
  /** A replay: the player already tapped, so the scene starts straight away. */
  autoStart?: boolean;
  /** Storm volume, 0..1 (0 when the player turned the sound off). */
  volume: number;
  /** The player tapped to begin (a gesture: the theme may start here). */
  onBegin?: () => void;
  /** The last button (after IT'S ALIVE!). */
  doneLabel?: string;
  onDone: (how: 'watched' | 'skipped') => void;
}

export function Awakening({
  parts,
  spark,
  totals,
  ready,
  autoStart = false,
  volume,
  onBegin,
  doneLabel = 'See your creature',
  onDone,
}: Props) {
  const [stage, setStage] = useState<Stage>(autoStart ? 'dark' : 'intro');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const kind = spark?.replace('spark_', '') ?? 'lightning';

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const play = useCallback(() => {
    clear();
    onBegin?.();
    run.track('awakening_play');
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (calm) {
      // No flashes or shaking: straight to the living creature.
      setStage('alive');
      run.haptic('success');
      timers.current.push(setTimeout(() => setStage('done'), 900));
      return;
    }
    for (const [s, at] of TIMELINE) {
      timers.current.push(
        setTimeout(() => {
          setStage(s);
          if (s === 'dark') distantThunder(volume);
          if (s === 'charge') crackle(volume);
          if (s === 'strike') {
            thunderclap(volume);
            run.haptic('heavy');
          }
          if (s === 'surge') run.haptic('medium');
          if (s === 'alive') run.haptic('success');
        }, at),
      );
    }
  }, [onBegin, volume]);

  // A replay starts at once; leaving never strands a timer.
  useEffect(() => {
    if (autoStart) play();
    return clear;
  }, []);

  const finish = (how: 'watched' | 'skipped') => {
    clear();
    run.track(how === 'watched' ? 'awakening_done' : 'awakening_skip');
    onDone(how);
  };

  const caption = useMemo(() => {
    if (stage === 'dark')
      return totals.votes > 0
        ? `${totals.nights} nights. ${totals.votes.toLocaleString('en-US')} votes.`
        : `${totals.nights} nights of stitching.`;
    if (stage === 'charge') return SPARK_LINES[kind] ?? 'The spark gathers…';
    return null;
  }, [stage, totals, kind]);

  const awake = stage === 'alive' || stage === 'done';

  return (
    <div
      className={`awakening aura-${kind} ${DORMANT.has(stage) ? 'dormant' : ''}`}
      data-stage={stage}
      role="dialog"
      aria-modal="true"
      aria-label="The creature awakens"
      data-testid="awakening"
    >
      <div className="awaken-rain" aria-hidden="true" />
      {stage === 'intro' ? (
        <div className="awaken-intro">
          <p className="eyebrow">All Hallows' Eve</p>
          <h2 className="awaken-intro-title">Midnight has come</h2>
          <p>
            For {totals.nights || 'nineteen'} nights the village chose its parts. Now the creature
            lies on the slab, waiting for its spark.
          </p>
          <button
            className="btn btn-primary btn-wide awaken-go"
            onClick={play}
            disabled={!ready}
            data-testid="awaken-start"
          >
            {ready ? 'Witness the awakening ⚡' : 'Gathering the parts…'}
          </button>
          <button
            className="btn btn-secondary btn-small"
            onClick={() => finish('skipped')}
            data-testid="awaken-skip"
          >
            Skip
          </button>
        </div>
      ) : (
        <>
          {stage !== 'done' && (
            <button
              className="btn btn-secondary btn-small awaken-skip"
              onClick={() => finish('skipped')}
              data-testid="awaken-skip"
            >
              Skip
            </button>
          )}
          <div className="awaken-frame">
            <Monster
              parts={parts}
              spark={DORMANT.has(stage) ? null : spark}
              alive={awake}
              className="awaken-monster"
            />
            <svg className="awaken-bolt" viewBox="0 0 170 200" aria-hidden="true">
              <polyline points="146,-80 122,-48 134,-42 106,-10 117,-5 94,22 104,26 86,42" />
              <polyline className="fork" points="122,-48 98,-60 88,-50" />
              <polyline className="fork" points="106,-10 88,-18 80,-8" />
            </svg>
            <div className="awaken-flicker" aria-hidden="true" />
          </div>
          <div className="awaken-words" aria-live="polite">
            {caption && (
              <p key={stage} className="awaken-caption">
                {caption}
              </p>
            )}
            {awake && (
              <>
                <h1 className="logo logo-alive awaken-title">IT'S ALIVE!</h1>
                <p className="awaken-sub">Stitched together by everyone, one night at a time.</p>
              </>
            )}
          </div>
          <div className="awaken-actions">
            {stage === 'done' && (
              <button
                className="btn btn-primary btn-wide awaken-done"
                onClick={() => finish('watched')}
                data-testid="awaken-done"
                autoFocus
              >
                {doneLabel}
              </button>
            )}
          </div>
        </>
      )}
      <div className="awaken-flash" aria-hidden="true" />
    </div>
  );
}

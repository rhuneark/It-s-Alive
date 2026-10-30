import { useEffect, useMemo, useRef } from 'react';
import type { Strike } from '../app/useStorm';
import type { SlotId } from '../game/catalog';
import {
  SCENE_H,
  SCENE_W,
  layerKey,
  layoutMonster,
  slotBox,
  type Box,
  type LayerSheet,
} from '../game/layout';
import LAYER_DATA from '../game/layers.json';

const LAYERS: LayerSheet = LAYER_DATA;
const BASE = import.meta.env.BASE_URL;
const layerUrl = (src: string) => `${BASE}art/${src}.png`;

/**
 * Art for an option card: the option's own painted layer (on the monster's
 * current head / torso / leg when it is painted per base). The spark is an
 * effect, so it has a small icon instead.
 */
export function iconUrl(slot: SlotId, id: string, parts: Partial<Record<SlotId, string>>) {
  if (slot === 'spark') return `${BASE}art/icons/${id}.png`;
  return layerUrl(`parts/${layerKey(slot, id, parts)}`);
}

interface Props {
  parts: Partial<Record<SlotId, string>>;
  /** Option being previewed on the monster (not yet chosen). */
  preview?: { slot: SlotId; id: string } | null;
  /** Today's slot: marks where the next part will be stitched. */
  nextSlot?: SlotId | null;
  /** Spark of life (chosen or previewed) drives the aura effect. */
  spark?: string | null;
  alive?: boolean;
  /** A part just stitched on: it glows for a moment. */
  fresh?: SlotId | null;
  /** Small, background-free version used inside option cards. */
  mini?: boolean;
  /** The vigil's storm: lightning in the window behind it, and it twitches. */
  strike?: Strike | null;
  className?: string;
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

function boxStyle(b: { x: number; y: number; w: number; h: number }) {
  return {
    left: pct(b.x, SCENE_W),
    top: pct(b.y, SCENE_H),
    width: pct(b.w, SCENE_W),
    height: pct(b.h, SCENE_H),
  };
}

const toRect = (b: Box, grow = 0) => ({
  x: b[0]! - grow,
  y: b[1]! - grow,
  w: b[2]! + grow * 2,
  h: b[3]! + grow * 2,
});

/** The husk in the laboratory, with every chosen part painted into it. */
export function Monster({
  parts,
  preview,
  nextSlot,
  spark,
  alive,
  fresh,
  mini,
  strike,
  className = '',
}: Props) {
  const body = useRef<HTMLDivElement>(null);
  // Each strike jolts the body: it is stirring.
  useEffect(() => {
    if (!strike || !body.current?.animate) return;
    const k = strike.near ? 1.6 : 1;
    body.current.animate(
      [
        { transform: 'none', filter: 'brightness(1)' },
        {
          transform: `translate(${-1 * k}px, ${-1.5 * k}px) rotate(${-0.8 * k}deg)`,
          filter: 'brightness(1.8)',
          offset: 0.12,
        },
        {
          transform: `translate(${1 * k}px, 0) rotate(${0.6 * k}deg)`,
          filter: 'brightness(1.2)',
          offset: 0.3,
        },
        { transform: 'none', filter: 'brightness(1)' },
      ],
      { duration: 650, easing: 'ease-out' },
    );
  }, [strike]);
  const all = useMemo(
    () => (preview && preview.slot !== 'spark' ? { ...parts, [preview.slot]: preview.id } : parts),
    [parts, preview],
  );
  const pieces = useMemo(() => layoutMonster(all, LAYERS), [all]);
  const ghost = useMemo(() => {
    if (!nextSlot || preview || parts[nextSlot]) return null;
    return slotBox(nextSlot, parts, LAYERS);
  }, [nextSlot, preview, parts]);

  const sparkKind = (preview?.slot === 'spark' ? preview.id : spark)?.replace('spark_', '') ?? null;

  return (
    <div
      className={`monster ${mini ? 'monster-mini' : ''} ${alive ? 'alive' : ''} ${sparkKind ? `aura aura-${sparkKind}` : ''} ${className}`}
      role={mini ? undefined : 'img'}
      aria-label={mini ? undefined : 'The monster so far'}
      aria-hidden={mini ? true : undefined}
    >
      <div className="monster-stage">
        {!mini && (
          <img className="monster-bg" src={`${BASE}art/lab.png`} alt="" draggable={false} />
        )}
        {!mini && <div className="monster-flash" />}
        {!mini && strike && <StormStrike key={strike.id} strike={strike} />}
        <div className="monster-body" ref={body}>
          {pieces.map((p) => (
            <img
              key={p.src}
              className={`part ${preview && p.slot === preview.slot ? 'previewing' : ''} ${fresh && p.slot === fresh ? 'fresh' : ''}`}
              src={layerUrl(p.src)}
              alt=""
              draggable={false}
              data-layer={p.src}
              style={boxStyle(p)}
            />
          ))}
          {ghost && (
            <div className="ghost-slot" style={boxStyle(toRect(ghost, 1))}>
              <span>?</span>
            </div>
          )}
        </div>
        {sparkKind && <div className={`spark-fx spark-${sparkKind}`} />}
      </div>
    </div>
  );
}

/** The lab's arched window (scene px), where the storm shows behind the slab. */
const WINDOW = 'M80 130 V52 A35 30 0 0 1 150 52 V130 Z';

/** One lightning strike seen through the window, lighting up the lab. */
function StormStrike({ strike }: { strike: Strike }) {
  // A jagged bolt from the top of the window down to its sill, across the side panes.
  const points = useMemo(() => {
    let x = 84 + strike.x * 62;
    const pts: string[] = [`${x.toFixed(1)},20`];
    for (let y = 30; y <= 130; y += 11) {
      x = Math.max(80, Math.min(150, x + (Math.random() - 0.5) * 22));
      pts.push(`${x.toFixed(1)},${y}`);
    }
    return pts.join(' ');
  }, [strike]);
  const id = `win${strike.id}`;
  return (
    <>
      <svg
        className={`lab-strike ${strike.near ? 'near' : ''}`}
        viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
        aria-hidden="true"
      >
        <defs>
          <clipPath id={id}>
            <path d={WINDOW} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id})`}>
          <path className="lab-strike-sky" d={WINDOW} />
          <polyline className="lab-strike-bolt" points={points} />
        </g>
      </svg>
      <div className={`lab-strike-room ${strike.near ? 'near' : ''}`} />
    </>
  );
}

import { useMemo } from 'react';
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
  className = '',
}: Props) {
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
        <div className="monster-body">
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

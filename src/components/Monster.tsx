import { Fragment, useMemo } from 'react';
import { questionForSlot, type SlotId } from '../game/catalog';
import {
  CANVAS_H,
  CANVAS_W,
  CX,
  FLOOR_Y,
  frameFor,
  layoutMonster,
  type Placed,
  type SpriteSheet,
} from '../game/layout';
import SPRITE_DATA from '../game/sprites.json';

const SPRITES: SpriteSheet = SPRITE_DATA;

const BASE = import.meta.env.BASE_URL;
export const partUrl = (id: string) => `${BASE}art/parts/${id}.png`;
/** Full-size art for option cards and the chronicle. */
export const iconUrl = (id: string) => `${BASE}art/icons/${id}.png`;

interface Props {
  parts: Partial<Record<SlotId, string>>;
  /** Option being previewed on the monster (not yet chosen). */
  preview?: { slot: SlotId; id: string } | null;
  /** Today's slot: marks where the next part will be stitched. */
  nextSlot?: SlotId | null;
  /** Spark of life (chosen or previewed) drives the aura effect. */
  spark?: string | null;
  alive?: boolean;
  /** Small, background-free version used inside option cards. */
  mini?: boolean;
  className?: string;
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/** Crackle over the tesla coil's tip (its place in lab.png is set by SCENE in tools/art/process.py). */
const COIL_SPARK = { x: 202, y: 150, w: 24, h: 24 };

function boxStyle(p: { x: number; y: number; w: number; h: number }) {
  return {
    left: pct(p.x, CANVAS_W),
    top: pct(p.y, CANVAS_H),
    width: pct(p.w, CANVAS_W),
    height: pct(p.h, CANVAS_H),
  };
}

/** The monster on its iron rack: layered pixel-art parts, stitched seams and the night's spark. */
export function Monster({ parts, preview, nextSlot, spark, alive, mini, className = '' }: Props) {
  const all = useMemo(
    () => (preview && preview.slot !== 'spark' ? { ...parts, [preview.slot]: preview.id } : parts),
    [parts, preview],
  );
  const placed = useMemo(() => layoutMonster(all, SPRITES), [all]);

  const ghost = useMemo(() => {
    if (!nextSlot || nextSlot === 'spark' || preview || parts[nextSlot]) return [];
    const sample = questionForSlot(nextSlot).options[0].id;
    return layoutMonster({ ...parts, [nextSlot]: sample }, SPRITES).filter(
      (p) => p.slot === nextSlot,
    );
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
        {!mini && <div className="coil-spark" style={boxStyle(COIL_SPARK)} />}
        <Armature parts={all} />
        <div className="monster-body">
          {placed.map((p, i) => (
            <Fragment key={`${p.slot}-${p.id}-${i}`}>
              {p.slot === 'heart' && <div className="cavity" style={boxStyle(grow(p, 3))} />}
              <img
                className={`part ${preview && p.slot === preview.slot ? 'previewing' : ''}`}
                src={partUrl(p.id)}
                alt=""
                draggable={false}
                style={{ ...boxStyle(p), transform: p.flip ? 'scaleX(-1)' : undefined }}
              />
            </Fragment>
          ))}
          <Stitches placed={placed} />
          {ghost.map((g, i) => (
            <div key={i} className="ghost-slot" style={boxStyle(grow(g, 1))}>
              <span>?</span>
            </div>
          ))}
        </div>
        {sparkKind && <div className={`spark-fx spark-${sparkKind}`} />}
      </div>
    </div>
  );
}

function grow(p: Pick<Placed, 'x' | 'y' | 'w' | 'h'>, by: number) {
  return { x: p.x - by, y: p.y - by, w: p.w + by * 2, h: p.h + by * 2 };
}

/** Iron rack the parts hang on; whatever hasn't been grafted yet shows bare iron. */
function Armature({ parts }: { parts: Partial<Record<SlotId, string>> }) {
  const f = frameFor(parts, SPRITES);
  const iron = '#3a3440';
  const hi = '#6b6170';
  const bolt = '#b08a3e';
  const yokeY = Math.min(f.shoulderL.y, f.shoulderR.y) - 5;
  const yokeL = f.shoulderL.x - 16;
  const yokeR = f.shoulderR.x + 16;
  const hipY = Math.max(f.hipL.y, f.hipR.y) - 2;
  return (
    <svg
      className="armature"
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {/* base plate and post */}
      <rect x={CX - 28} y={FLOOR_Y} width={56} height={6} fill={iron} />
      <rect x={CX - 28} y={FLOOR_Y} width={56} height={1} fill={hi} />
      <rect x={CX - 2} y={20} width={4} height={FLOOR_Y - 20} fill={iron} />
      <rect x={CX - 2} y={20} width={1} height={FLOOR_Y - 20} fill={hi} />
      {/* shoulder yoke with hooks */}
      <rect x={yokeL} y={yokeY} width={yokeR - yokeL} height={3} fill={iron} />
      <rect x={yokeL} y={yokeY} width={yokeR - yokeL} height={1} fill={hi} />
      {/* hip bar */}
      <rect x={f.hipL.x - 8} y={hipY} width={f.hipR.x - f.hipL.x + 16} height={3} fill={iron} />
      {/* bare iron limbs where nothing is grafted yet */}
      {!parts.armR && <rect x={f.shoulderL.x - 1} y={yokeY} width={3} height={58} fill={iron} />}
      {!parts.armL && <rect x={f.shoulderR.x - 1} y={yokeY} width={3} height={58} fill={iron} />}
      {!parts.legR && (
        <rect x={f.hipL.x - 1} y={hipY} width={3} height={FLOOR_Y - hipY} fill={iron} />
      )}
      {!parts.legL && (
        <rect x={f.hipR.x - 1} y={hipY} width={3} height={FLOOR_Y - hipY} fill={iron} />
      )}
      {!parts.head && (
        <>
          <rect x={f.neck.x - 12} y={f.head.y + 6} width={24} height={3} fill={iron} />
          <rect x={f.neck.x - 12} y={f.head.y + 6} width={3} height={f.head.h - 4} fill={iron} />
          <rect x={f.neck.x + 9} y={f.head.y + 6} width={3} height={f.head.h - 4} fill={iron} />
        </>
      )}
      {[yokeL + 2, yokeR - 4, CX - 1].map((x) => (
        <rect key={x} x={x} y={yokeY} width={2} height={2} fill={bolt} />
      ))}
    </svg>
  );
}

/** Black thread across every seam where a grafted part is sewn on. */
function Stitches({ placed }: { placed: Placed[] }) {
  const seams = placed.flatMap((p) => p.seams);
  if (seams.length === 0) return null;
  return (
    <svg
      className="stitches"
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {seams.map((s, i) => {
        const marks = [];
        for (let k = 0; k < s.len; k += 3) {
          const x = s.vertical ? s.x : s.x + k;
          const y = s.vertical ? s.y + k : s.y;
          marks.push(
            <g key={k}>
              <rect x={x} y={y} width={1} height={1} fill="#140f12" />
              <rect x={x + 1} y={y + 1} width={1} height={1} fill="#140f12" />
              <rect x={x + 1} y={y} width={1} height={1} fill="#d9c9a8" />
              <rect x={x} y={y + 1} width={1} height={1} fill="#d9c9a8" opacity={0.6} />
            </g>,
          );
        }
        return <g key={i}>{marks}</g>;
      })}
    </svg>
  );
}

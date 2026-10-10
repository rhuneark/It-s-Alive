import { Fragment, useMemo } from 'react';
import { questionForSlot, type SlotId } from '../game/catalog';
import { CANVAS_H, CANVAS_W, FLOOR_Y, frameFor, layoutMonster, type Placed } from '../game/layout';
import SPRITES from '../game/sprites.json';

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
  const frame = useMemo(() => frameFor(all, SPRITES), [all]);

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
      {!mini && <img className="monster-bg" src={`${BASE}art/lab.png`} alt="" draggable={false} />}
      {!mini && <div className="monster-flash" />}
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
        <Stitches parts={all} frame={frame} />
        {ghost.map((g, i) => (
          <div key={i} className="ghost-slot" style={boxStyle(grow(g, 1))}>
            <span>?</span>
          </div>
        ))}
      </div>
      {sparkKind && <div className={`spark-fx spark-${sparkKind}`} />}
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
  return (
    <svg
      className="armature"
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {/* base plate and post */}
      <rect x={52} y={FLOOR_Y} width={56} height={6} fill={iron} />
      <rect x={52} y={FLOOR_Y} width={56} height={1} fill={hi} />
      <rect x={78} y={20} width={4} height={FLOOR_Y - 20} fill={iron} />
      <rect x={78} y={20} width={1} height={FLOOR_Y - 20} fill={hi} />
      {/* shoulder yoke with hooks */}
      <rect
        x={f.shoulderL - 18}
        y={f.shoulderY - 6}
        width={f.shoulderR - f.shoulderL + 36}
        height={3}
        fill={iron}
      />
      <rect
        x={f.shoulderL - 18}
        y={f.shoulderY - 6}
        width={f.shoulderR - f.shoulderL + 36}
        height={1}
        fill={hi}
      />
      {/* hip bar */}
      <rect x={f.hipL - 10} y={f.hipY + 2} width={f.hipR - f.hipL + 20} height={3} fill={iron} />
      {/* bare iron limbs where nothing is grafted yet */}
      {!parts.armR && (
        <rect x={f.shoulderL - 4} y={f.shoulderY - 4} width={3} height={54} fill={iron} />
      )}
      {!parts.armL && (
        <rect x={f.shoulderR + 1} y={f.shoulderY - 4} width={3} height={54} fill={iron} />
      )}
      {!parts.legR && (
        <rect x={f.hipL - 1} y={f.hipY + 4} width={3} height={FLOOR_Y - f.hipY - 4} fill={iron} />
      )}
      {!parts.legL && (
        <rect x={f.hipR - 2} y={f.hipY + 4} width={3} height={FLOOR_Y - f.hipY - 4} fill={iron} />
      )}
      {!parts.head && (
        <>
          <rect x={68} y={f.head.y + 6} width={24} height={3} fill={iron} />
          <rect x={68} y={f.head.y + 6} width={3} height={f.head.h - 4} fill={iron} />
          <rect x={89} y={f.head.y + 6} width={3} height={f.head.h - 4} fill={iron} />
        </>
      )}
      {[f.shoulderL - 16, f.shoulderR + 14, 80].map((x) => (
        <rect key={x} x={x} y={f.shoulderY - 6} width={2} height={2} fill={bolt} />
      ))}
    </svg>
  );
}

/** Black thread across every seam where two grafted parts meet. */
function Stitches({
  parts,
  frame: f,
}: {
  parts: Partial<Record<SlotId, string>>;
  frame: ReturnType<typeof frameFor>;
}) {
  const seams: Array<{ x: number; y: number; len: number; vertical?: boolean }> = [];
  if (parts.head && parts.torso) seams.push({ x: 72, y: f.torso.y + 3, len: 16 });
  if (parts.torso && parts.armR)
    seams.push({ x: f.shoulderL - 2, y: f.shoulderY - 1, len: 10, vertical: true });
  if (parts.torso && parts.armL)
    seams.push({ x: f.shoulderR + 1, y: f.shoulderY - 1, len: 10, vertical: true });
  if (parts.torso && parts.legR) seams.push({ x: f.hipL - 6, y: f.hipY + 3, len: 12 });
  if (parts.torso && parts.legL) seams.push({ x: f.hipR - 6, y: f.hipY + 3, len: 12 });
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

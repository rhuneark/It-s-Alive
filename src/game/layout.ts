/**
 * Where each grafted part sits on the monster. Pure geometry on a fixed
 * 160x224 pixel canvas: give it the parts so far (and optionally a preview
 * part) and it returns positioned sprites in draw order.
 */
import type { SlotId } from './catalog';

export const CANVAS_W = 160;
export const CANVAS_H = 224;
/** Top of the iron base plate the monster stands on. */
export const FLOOR_Y = 210;
const CX = CANVAS_W / 2;

/** Sprite pixel sizes keyed by option id (generated into sprites.json by tools/art/process.py). */
export type SpriteSizes = Record<string, readonly number[]>;

export interface Placed {
  slot: SlotId;
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  flip: boolean;
  z: number;
}

/** Draw order, back to front. */
const Z: Record<SlotId, number> = {
  wings: 0,
  spine: 1,
  arm3: 2,
  tail: 3,
  legR: 4,
  legL: 4,
  hide: 5,
  torso: 6,
  heart: 7,
  chestEye: 8,
  maw: 9,
  armR: 10,
  armL: 10,
  ears: 11,
  head: 12,
  brain: 13,
  horns: 14,
  browEye: 15,
  jaw: 16,
  head2: 17,
  spark: 18,
};

/** Frame used before the torso / head exist, so limbs still hang somewhere sensible. */
const DEFAULT_TORSO = { w: 54, h: 62 };
const DEFAULT_HEAD = { w: 50, h: 54 };
const TORSO_TOP = 76;

export interface Frame {
  torso: { x: number; y: number; w: number; h: number };
  head: { x: number; y: number; w: number; h: number };
  shoulderY: number;
  shoulderL: number;
  shoulderR: number;
  hipY: number;
  hipL: number;
  hipR: number;
}

/** Key body landmarks, derived from whichever torso and head have been chosen. */
export function frameFor(parts: Partial<Record<SlotId, string>>, sizes: SpriteSizes): Frame {
  const t = sizeOf(parts.torso, sizes) ?? DEFAULT_TORSO;
  const torso = { x: Math.round(CX - t.w / 2), y: TORSO_TOP, w: t.w, h: t.h };
  const h = sizeOf(parts.head, sizes) ?? DEFAULT_HEAD;
  const neckY = TORSO_TOP + 6;
  const head = { x: Math.round(CX - h.w / 2), y: neckY - h.h, w: h.w, h: h.h };
  const half = Math.max(18, Math.min(30, Math.round(t.w / 2) - 4));
  return {
    torso,
    head,
    shoulderY: TORSO_TOP + 6,
    shoulderL: CX - half,
    shoulderR: CX + half,
    hipY: TORSO_TOP + t.h - 8,
    hipL: CX - 11,
    hipR: CX + 11,
  };
}

function sizeOf(id: string | undefined, sizes: SpriteSizes): { w: number; h: number } | null {
  if (!id) return null;
  const s = sizes[id];
  return s && s.length >= 2 ? { w: s[0]!, h: s[1]! } : null;
}

/**
 * Positions for every part. `parts` maps slot -> chosen option id. Unknown
 * sprites are skipped. The spark has no sprite (it is drawn as an effect).
 */
export function layoutMonster(
  parts: Partial<Record<SlotId, string>>,
  sizes: SpriteSizes,
): Placed[] {
  const f = frameFor(parts, sizes);
  const out: Placed[] = [];
  const put = (slot: SlotId, id: string, x: number, y: number, flip = false) => {
    const s = sizeOf(id, sizes);
    if (!s) return;
    out.push({ slot, id, x: Math.round(x), y: Math.round(y), w: s.w, h: s.h, flip, z: Z[slot] });
  };
  const at = (slot: SlotId) => {
    const id = parts[slot];
    const s = sizeOf(id, sizes);
    return id && s ? { id, ...s } : null;
  };

  const headTop = f.head.y;
  const headBottom = f.head.y + f.head.h;

  for (const slot of Object.keys(parts) as SlotId[]) {
    const p = at(slot);
    if (!p) continue;
    switch (slot) {
      case 'head':
        put(slot, p.id, f.head.x, f.head.y);
        break;
      case 'torso':
        put(slot, p.id, f.torso.x, f.torso.y);
        break;
      case 'armR': // the monster's right arm is on the viewer's left
        put(slot, p.id, f.shoulderL - p.w / 2 - 3, f.shoulderY - 2);
        break;
      case 'armL':
        put(slot, p.id, f.shoulderR - p.w / 2 + 3, f.shoulderY - 2, true);
        break;
      case 'legR':
        put(slot, p.id, f.hipL - p.w / 2, f.hipY);
        break;
      case 'legL':
        put(slot, p.id, f.hipR - p.w / 2, f.hipY, true);
        break;
      case 'browEye':
        put(slot, p.id, CX - p.w / 2, headTop + f.head.h * 0.3 - p.h / 2);
        break;
      case 'chestEye':
        put(slot, p.id, CX - 13 - p.w / 2, f.torso.y + 18 - p.h / 2);
        break;
      case 'heart':
        put(slot, p.id, CX + 13 - p.w / 2, f.torso.y + 22 - p.h / 2);
        break;
      case 'maw':
        put(slot, p.id, CX - p.w / 2, f.torso.y + f.torso.h * 0.62 - p.h / 2);
        break;
      case 'tail':
        put(slot, p.id, CX + 6, f.hipY + 26 - p.h);
        break;
      case 'wings':
        put(slot, p.id, CX - p.w / 2, f.torso.y + 20 - p.h / 2);
        break;
      case 'spine':
        put(slot, p.id, CX - p.w / 2, f.torso.y + 6 - p.h);
        break;
      case 'arm3':
        put(slot, p.id, f.shoulderL - 6 - p.w / 2, f.torso.y + 28 - p.h);
        break;
      case 'head2':
        put(slot, p.id, f.shoulderR + 8 - p.w / 2, f.shoulderY + 8 - p.h);
        break;
      case 'horns':
        put(slot, p.id, CX - p.w / 2, headTop + 10 - p.h);
        break;
      case 'ears':
        put(slot, p.id, f.head.x + 7 - p.w, headTop + f.head.h * 0.4 - p.h / 2);
        put(slot, p.id, f.head.x + f.head.w - 7, headTop + f.head.h * 0.4 - p.h / 2, true);
        break;
      case 'brain':
        put(slot, p.id, CX - p.w / 2, headTop + 7 - p.h);
        break;
      case 'jaw':
        put(slot, p.id, CX - p.w / 2, headBottom - 12);
        break;
      case 'hide':
        put(slot, p.id, f.hipL - p.w / 2, f.hipY + 14);
        break;
      case 'spark':
        break;
    }
  }
  return out.sort((a, b) => a.z - b.z);
}

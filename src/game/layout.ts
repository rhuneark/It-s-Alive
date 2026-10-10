/**
 * Where each grafted part sits on the monster. Pure geometry on a fixed
 * 240x224 pixel canvas: give it the parts so far (and optionally a preview
 * part) and it returns positioned sprites in draw order, each with the seams
 * that sew it on.
 *
 * Every sprite carries attachment points measured from its own pixels
 * (tools/art/anchors.py -> sprites.json): "a" is the spot on the part that is
 * sewn on, and torsos, heads and legs also list their sockets (shoulders, hips,
 * skull top, mouth...). A part is placed so that its "a" lands on its host's
 * socket, so a narrow torso gets narrow shoulders and a horned head gets its
 * brain sewn onto the skull rather than onto the ear tips.
 */
import type { SlotId } from './catalog';

export const CANVAS_W = 240;
export const CANVAS_H = 224;
/** Horizontal centre: the iron post the monster hangs on. */
export const CX = CANVAS_W / 2;
/** Top of the iron base plate the monster stands on. */
export const FLOOR_Y = 212;
/** Top of the torso. Low enough that even the shortest leg reaches up behind it. */
const TORSO_TOP = 90;
/** How far a head's neck sinks into the torso. */
const NECK_SINK = 5;

type Pt = readonly number[];

/** One sprite's size and attachment points (sprite pixels, unflipped). */
export interface SpriteInfo {
  w: number;
  h: number;
  /** The pixel that is sewn onto the host. */
  a: Pt;
  // torso sockets
  neck?: Pt;
  shoulderL?: Pt;
  shoulderR?: Pt;
  hipL?: Pt;
  hipR?: Pt;
  chestL?: Pt;
  chestR?: Pt;
  belly?: Pt;
  back?: Pt;
  // head sockets
  top?: Pt;
  brow?: Pt;
  mouth?: Pt;
  earL?: Pt;
  earR?: Pt;
  // leg socket
  thigh?: Pt;
}

/** Sprite info keyed by option id (generated into sprites.json by tools/art/process.py). */
export type SpriteSheet = Record<string, SpriteInfo>;

export interface P {
  x: number;
  y: number;
}

/** A row (or column) of stitches, in canvas pixels. */
export interface Seam {
  x: number;
  y: number;
  len: number;
  vertical?: boolean;
}

export interface Placed {
  slot: SlotId;
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  flip: boolean;
  z: number;
  /** Canvas position of the part's attachment point. */
  anchor: P;
  /** Stitches where this part is sewn on. */
  seams: Seam[];
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

/** Stand-ins used before the torso / head exist, so limbs still hang somewhere sensible. */
const DEFAULT_TORSO: SpriteInfo = {
  w: 48,
  h: 60,
  a: [24, 0],
  neck: [24, 0],
  shoulderL: [6, 6],
  shoulderR: [41, 6],
  hipL: [14, 58],
  hipR: [34, 58],
  chestL: [16, 18],
  chestR: [32, 22],
  belly: [24, 37],
  back: [38, 46],
};
const DEFAULT_HEAD: SpriteInfo = {
  w: 40,
  h: 52,
  a: [20, 51],
  top: [20, 2],
  brow: [20, 14],
  mouth: [20, 36],
  earL: [4, 20],
  earR: [36, 20],
};

type Box = { x: number; y: number; w: number; h: number };

export interface Frame {
  torso: Box;
  head: Box;
  neck: P;
  shoulderL: P;
  shoulderR: P;
  hipL: P;
  hipR: P;
  chestL: P;
  chestR: P;
  belly: P;
  back: P;
  skull: P;
  brow: P;
  mouth: P;
  earL: P;
  earR: P;
}

function infoOf(id: string | undefined, sheet: SpriteSheet): SpriteInfo | null {
  if (!id) return null;
  const s = sheet[id];
  return s && s.w > 0 && s.h > 0 && s.a?.length >= 2 ? s : null;
}

const at = (base: Box, pt: Pt | undefined, fallback: Pt): P => {
  const p = pt && pt.length >= 2 ? pt : fallback;
  return { x: base.x + p[0]!, y: base.y + p[1]! };
};

/** Key body landmarks (canvas pixels), derived from whichever torso and head have been chosen. */
export function frameFor(parts: Partial<Record<SlotId, string>>, sheet: SpriteSheet): Frame {
  const t = infoOf(parts.torso, sheet) ?? DEFAULT_TORSO;
  const d = DEFAULT_TORSO;
  const torso = { x: Math.round(CX - t.w / 2), y: TORSO_TOP, w: t.w, h: t.h };
  const neck = at(torso, t.neck, [t.w >> 1, 0]);
  const h = infoOf(parts.head, sheet) ?? DEFAULT_HEAD;
  const dh = DEFAULT_HEAD;
  const head = { x: neck.x - h.a[0]!, y: neck.y + NECK_SINK - h.a[1]!, w: h.w, h: h.h };
  return {
    torso,
    head,
    neck,
    shoulderL: at(torso, t.shoulderL, d.shoulderL!),
    shoulderR: at(torso, t.shoulderR, [t.w - 7, 6]),
    hipL: at(torso, t.hipL, [t.w / 2 - 10, t.h - 2]),
    hipR: at(torso, t.hipR, [t.w / 2 + 10, t.h - 2]),
    chestL: at(torso, t.chestL, [t.w * 0.3, 18]),
    chestR: at(torso, t.chestR, [t.w * 0.7, 22]),
    belly: at(torso, t.belly, [t.w / 2, t.h * 0.62]),
    back: at(torso, t.back, [t.w - 8, t.h - 14]),
    skull: at(head, h.top, [h.w / 2, 0]),
    brow: at(head, h.brow, [h.w / 2, h.h * 0.25]),
    mouth: at(head, h.mouth, [h.w / 2, h.h * 0.7]),
    earL: at(head, h.earL, [3, dh.earL![1]!]),
    earR: at(head, h.earR, [h.w - 4, dh.earR![1]!]),
  };
}

/** Horizontal stitches of `len` centred on x. */
const across = (x: number, y: number, len: number): Seam => ({
  x: Math.round(x - len / 2),
  y: Math.round(y),
  len,
});
/** Vertical stitches of `len` centred on y. */
const down = (x: number, y: number, len: number): Seam => ({
  x: Math.round(x),
  y: Math.round(y - len / 2),
  len,
  vertical: true,
});

/**
 * Positions for every part. `parts` maps slot -> chosen option id. Unknown
 * sprites are skipped. The spark has no sprite (it is drawn as an effect).
 */
export function layoutMonster(
  parts: Partial<Record<SlotId, string>>,
  sheet: SpriteSheet,
): Placed[] {
  const f = frameFor(parts, sheet);
  const out: Placed[] = [];
  /** Place `id` so its attachment point lands on `socket`. */
  const sew = (slot: SlotId, id: string, socket: P, flip = false, seams: Seam[] = []) => {
    const s = infoOf(id, sheet);
    if (!s) return null;
    const ax = flip ? s.w - 1 - s.a[0]! : s.a[0]!;
    const p: Placed = {
      slot,
      id,
      x: Math.round(socket.x - ax),
      y: Math.round(socket.y - s.a[1]!),
      w: s.w,
      h: s.h,
      flip,
      z: Z[slot],
      anchor: { x: Math.round(socket.x), y: Math.round(socket.y) },
      seams,
    };
    out.push(p);
    return p;
  };
  /** Legs stand on the base plate; their tops reach up behind the hips. */
  const leg = (slot: 'legR' | 'legL', id: string, hip: P, flip: boolean) => {
    const s = infoOf(id, sheet);
    if (!s) return;
    const top = FLOOR_Y + 1 - s.h;
    sew(slot, id, { x: hip.x, y: top + s.a[1]! }, flip, [across(hip.x, hip.y, 11)]);
  };

  for (const slot of Object.keys(parts) as SlotId[]) {
    const id = parts[slot];
    const s = infoOf(id, sheet);
    if (!id || !s) continue;
    switch (slot) {
      case 'head':
        sew(slot, id, { x: f.neck.x, y: f.neck.y + NECK_SINK }, false, [
          across(f.neck.x, f.neck.y + 1, 15),
        ]);
        break;
      case 'torso':
        sew(slot, id, { x: f.torso.x + s.a[0]!, y: f.torso.y + s.a[1]! });
        break;
      case 'armR': // the monster's right arm is on the viewer's left
        sew(slot, id, { x: f.shoulderL.x, y: f.shoulderL.y + 1 }, false, [
          across(f.shoulderL.x, f.shoulderL.y + 4, 9),
        ]);
        break;
      case 'armL':
        sew(slot, id, { x: f.shoulderR.x, y: f.shoulderR.y + 1 }, true, [
          across(f.shoulderR.x, f.shoulderR.y + 4, 9),
        ]);
        break;
      case 'legR':
        leg(slot, id, f.hipL, false);
        break;
      case 'legL':
        leg(slot, id, f.hipR, true);
        break;
      case 'browEye':
        sew(slot, id, f.brow);
        break;
      case 'chestEye':
        sew(slot, id, f.chestL);
        break;
      case 'heart':
        sew(slot, id, f.chestR);
        break;
      case 'maw':
        sew(slot, id, f.belly, false, [
          down(f.belly.x - s.w / 2, f.belly.y, 7),
          down(f.belly.x + s.w / 2 - 1, f.belly.y, 7),
        ]);
        break;
      case 'tail':
        sew(slot, id, f.back, false, [down(f.back.x + 3, f.back.y, 7)]);
        break;
      case 'wings':
        sew(slot, id, { x: f.neck.x, y: f.torso.y + 18 });
        break;
      case 'spine':
        sew(slot, id, { x: f.neck.x, y: f.torso.y + 8 });
        break;
      case 'arm3':
        sew(slot, id, { x: f.shoulderL.x + 6, y: f.shoulderL.y + 22 });
        break;
      case 'head2': {
        const socket = { x: f.shoulderR.x + 3, y: f.shoulderR.y + 6 };
        sew(slot, id, socket, false, [across(socket.x, socket.y - 3, 10)]);
        break;
      }
      case 'horns':
        sew(slot, id, { x: f.skull.x, y: f.skull.y + 8 });
        break;
      case 'ears':
        sew(slot, id, f.earL, false, [down(f.earL.x - 2, f.earL.y - 3, 7)]);
        sew(slot, id, f.earR, true, [down(f.earR.x + 2, f.earR.y - 3, 7)]);
        break;
      case 'brain': {
        const socket = { x: f.skull.x, y: f.skull.y + 7 };
        sew(slot, id, socket, false, [across(socket.x, socket.y - 1, Math.round(s.w * 0.7))]);
        break;
      }
      case 'jaw': {
        const len = Math.min(s.w, 14);
        sew(slot, id, f.mouth, false, [across(f.mouth.x, f.mouth.y + 1, len)]);
        break;
      }
      case 'hide': {
        // a patch sewn over the right thigh, just below the hip
        const leg = infoOf(parts.legR, sheet);
        const thighX = leg?.thigh ? f.hipL.x - leg.a[0]! + leg.thigh[0]! : f.hipL.x;
        const thighY = Math.max(leg?.thigh ? FLOOR_Y + 1 - leg.h + leg.thigh[1]! : 0, f.hipL.y + 9);
        const x0 = Math.round(thighX - (s.w >> 1));
        const y0 = Math.round(thighY - (s.h >> 1));
        sew(slot, id, { x: thighX, y: thighY }, false, [
          { x: x0, y: y0, len: s.w },
          { x: x0, y: y0 + s.h - 1, len: s.w },
          { x: x0, y: y0, len: s.h, vertical: true },
          { x: x0 + s.w - 1, y: y0, len: s.h, vertical: true },
        ]);
        break;
      }
      case 'spark':
        break;
    }
  }
  return out.sort((a, b) => a.z - b.z);
}

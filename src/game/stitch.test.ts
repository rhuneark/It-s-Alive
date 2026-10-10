/**
 * Cross-reference of the shipped art against the layout: for every torso x head
 * (and every host limb where it matters), every option of every slot must be
 * sewn onto its host. Uses the real pixels of public/art/parts, so a re-picked
 * sprite that would float off the body fails here.
 */
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { QUESTIONS, type SlotId } from './catalog';
import {
  CANVAS_H,
  CANVAS_W,
  FLOOR_Y,
  layoutMonster,
  type Placed,
  type SpriteSheet,
} from './layout';
import SPRITES from './sprites.json';

const SHEET: SpriteSheet = SPRITES;
const ids = (slot: SlotId) => QUESTIONS.find((q) => q.slot === slot)!.options.map((o) => o.id);

const masks = new Map<string, { w: number; h: number; on: Uint8Array }>();
function mask(id: string) {
  let m = masks.get(id);
  if (!m) {
    const png = PNG.sync.read(readFileSync(`public/art/parts/${id}.png`));
    const on = new Uint8Array(png.width * png.height);
    for (let i = 0; i < on.length; i++) on[i] = png.data[i * 4 + 3]! > 127 ? 1 : 0;
    m = { w: png.width, h: png.height, on };
    masks.set(id, m);
  }
  return m;
}

/** The part's opaque pixels on the canvas (optionally only one side of its anchor). */
function paint(p: Placed, side?: 'left' | 'right'): Uint8Array {
  const out = new Uint8Array(CANVAS_W * CANVAS_H);
  const m = mask(p.id);
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      if (!m.on[y * m.w + (p.flip ? m.w - 1 - x : x)]) continue;
      const X = p.x + x;
      const Y = p.y + y;
      if (side === 'left' && X >= p.anchor.x) continue;
      if (side === 'right' && X < p.anchor.x) continue;
      if (X >= 0 && Y >= 0 && X < CANVAS_W && Y < CANVAS_H) out[Y * CANVAS_W + X] = 1;
    }
  return out;
}

function union(placed: Placed[], slots: SlotId[]): Uint8Array {
  const out = new Uint8Array(CANVAS_W * CANVAS_H);
  for (const p of placed) {
    if (!slots.includes(p.slot)) continue;
    const m = paint(p);
    for (let i = 0; i < m.length; i++) out[i] = out[i]! | m[i]!;
  }
  return out;
}

/** The host's outline filled in row by row, so a hollow ribcage still counts as body. */
function silhouette(a: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let y = 0; y < CANVAS_H; y++) {
    const row = a.subarray(y * CANVAS_W, (y + 1) * CANVAS_W);
    const l = row.indexOf(1);
    if (l >= 0) out.fill(1, y * CANVAS_W + l, y * CANVAS_W + row.lastIndexOf(1) + 1);
  }
  return out;
}

const sum = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);
const shared = (a: Uint8Array, b: Uint8Array) => a.reduce((s, v, i) => s + (v & b[i]!), 0);

/** What each part must be sewn onto. */
const HOST: Record<Exclude<SlotId, 'torso' | 'spark'>, SlotId[]> = {
  head: ['torso'],
  armR: ['torso'],
  armL: ['torso'],
  legR: ['torso'],
  legL: ['torso'],
  browEye: ['head'],
  chestEye: ['torso'],
  heart: ['torso'],
  maw: ['torso'],
  tail: ['torso', 'legL'],
  wings: ['torso'],
  spine: ['torso', 'head'],
  arm3: ['torso'],
  head2: ['torso', 'armL'],
  horns: ['head'],
  ears: ['head'],
  brain: ['head'],
  jaw: ['head'],
  hide: ['legR'],
};
/** Parts set into their host: (nearly) all of their pixels must lie inside its outline. */
const INLAID: SlotId[] = ['browEye', 'chestEye', 'heart', 'maw'];
/** Least number of pixels a part must share with its host. */
const MIN_SHARED = 12;

type Combo = { label: string; parts: Partial<Record<SlotId, string>> };

/** Every option of `slot` on every torso x head, and on every option of a host limb. */
function combos(slot: SlotId): Combo[] {
  const out: Combo[] = [];
  const limb = HOST[slot as keyof typeof HOST]?.find((h) => h !== 'torso' && h !== 'head');
  for (const id of ids(slot))
    for (const torso of ids('torso'))
      for (const head of ids('head'))
        for (const limbId of limb ? ids(limb) : [null]) {
          const parts: Partial<Record<SlotId, string>> = { torso, head, [slot]: id };
          if (limb && limbId) parts[limb] = limbId;
          out.push({ label: `${id} on ${torso} + ${head}${limbId ? ` + ${limbId}` : ''}`, parts });
        }
  return out;
}

describe('every part is sewn onto its host', () => {
  for (const q of QUESTIONS) {
    const slot = q.slot;
    if (slot === 'torso' || slot === 'spark') continue;
    it(`${slot}: all options touch ${HOST[slot].join(' / ')}`, () => {
      const problems: string[] = [];
      for (const c of combos(slot)) {
        const placed = layoutMonster(c.parts, SHEET);
        const host = union(placed, HOST[slot]);
        for (const p of placed.filter((x) => x.slot === slot)) {
          const all = paint(p);
          if (INLAID.includes(slot)) {
            const inside = shared(all, silhouette(host));
            if (inside < sum(all) * 0.95)
              problems.push(`${c.label}: only ${inside}/${sum(all)} px inside the body`);
            continue;
          }
          // a pair (wings, a wide pair of horns) must attach on both sides
          const pair = slot === 'wings' || (slot === 'horns' && p.w > 30);
          for (const side of pair ? (['left', 'right'] as const) : [undefined]) {
            const k = shared(side ? paint(p, side) : all, host);
            if (k < MIN_SHARED)
              problems.push(`${c.label}${side ? ` (${side})` : ''}: ${k} px touch`);
          }
        }
      }
      expect(problems).toEqual([]);
    });
  }

  it('the chest eye, heart and belly mouth do not pile onto each other', () => {
    const problems: string[] = [];
    for (const torso of ids('torso'))
      for (const chestEye of ids('chestEye'))
        for (const heart of ids('heart'))
          for (const maw of ids('maw')) {
            const placed = layoutMonster({ torso, chestEye, heart, maw }, SHEET);
            const organs = placed
              .filter((p) => INLAID.includes(p.slot))
              .map((p) => [p, paint(p)] as const);
            for (let i = 0; i < organs.length; i++)
              for (let j = i + 1; j < organs.length; j++) {
                const [a, am] = organs[i]!;
                const [b, bm] = organs[j]!;
                const n = shared(am, bm);
                if (n > Math.min(sum(am), sum(bm)) * 0.12)
                  problems.push(`${a.id} and ${b.id} on ${torso}: ${n} px overlap`);
              }
          }
    expect([...new Set(problems)]).toEqual([]);
  });

  it('feet stand on the base plate', () => {
    for (const torso of ids('torso'))
      for (const slot of ['legR', 'legL'] as const)
        for (const id of ids(slot)) {
          const p = layoutMonster({ torso, [slot]: id }, SHEET).find((x) => x.slot === slot)!;
          expect(p.y + p.h, `${id} on ${torso}`).toBe(FLOOR_Y + 1);
        }
  });

  it('a full monster and its seams stay on the canvas', () => {
    for (const torso of ids('torso'))
      for (const head of ids('head'))
        for (let k = 0; k < 5; k++) {
          const parts: Partial<Record<SlotId, string>> = {};
          for (const q of QUESTIONS) parts[q.slot] = q.options[(k + QUESTIONS.indexOf(q)) % 5]!.id;
          Object.assign(parts, { torso, head });
          for (const p of layoutMonster(parts, SHEET)) {
            const where = `${p.id} on ${torso} + ${head}`;
            expect(p.x, where).toBeGreaterThanOrEqual(0);
            expect(p.y, where).toBeGreaterThanOrEqual(0);
            expect(p.x + p.w, where).toBeLessThanOrEqual(CANVAS_W);
            expect(p.y + p.h, where).toBeLessThanOrEqual(CANVAS_H);
            for (const s of p.seams) {
              expect(s.x, where).toBeGreaterThanOrEqual(0);
              expect(s.y, where).toBeGreaterThanOrEqual(0);
              expect((s.vertical ? s.x : s.x + s.len) + 2, where).toBeLessThanOrEqual(CANVAS_W);
              expect((s.vertical ? s.y + s.len : s.y) + 2, where).toBeLessThanOrEqual(CANVAS_H);
            }
          }
        }
  });
});

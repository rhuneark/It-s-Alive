/**
 * Cross-reference of the shipped layers: every option of every slot exists for
 * every base it can be painted onto, joins the body it is sewn to, keeps its
 * feet on the floor, and is not buried on a finished monster. Reads the real
 * PNGs in public/art, so a re-picked painting that breaks any of this fails here.
 */
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { QUESTIONS, type SlotId } from './catalog';
import {
  BASE_OF,
  FLOOR_Y,
  REGIONS,
  SCENE_H,
  SCENE_W,
  layerKey,
  layoutMonster,
  type LayerSheet,
  type Piece,
} from './layout';
import LAYER_DATA from './layers.json';

const SHEET: LayerSheet = LAYER_DATA;
const ids = (slot: SlotId) => QUESTIONS.find((q) => q.slot === slot)!.options.map((o) => o.id);
const SLOTS = QUESTIONS.map((q) => q.slot).filter((s) => s !== 'spark');

/** A layer's opaque pixels as a scene-sized mask. */
const masks = new Map<string, Uint8Array>();
function maskOf(src: string): Uint8Array {
  let m = masks.get(src);
  if (!m) {
    const [group, key] = src.split('/') as ['husk' | 'parts', string];
    const [x0, y0] = SHEET[group][key]!;
    const png = PNG.sync.read(readFileSync(`public/art/${src}.png`));
    m = new Uint8Array(SCENE_W * SCENE_H);
    for (let y = 0; y < png.height; y++)
      for (let x = 0; x < png.width; x++)
        if (png.data[(y * png.width + x) * 4 + 3]! > 127) m[(y0! + y) * SCENE_W + x0! + x] = 1;
    masks.set(src, m);
  }
  return m;
}

/** Pixels of `a` that sit on or right beside `b` (one pixel apart counts: a seam). */
function touching(a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  for (let y = 0; y < SCENE_H; y++)
    for (let x = 0; x < SCENE_W; x++) {
      if (!a[y * SCENE_W + x]) continue;
      let hit = false;
      for (let dy = -1; dy <= 1 && !hit; dy++)
        for (let dx = -1; dx <= 1 && !hit; dx++) {
          const X = x + dx;
          const Y = y + dy;
          hit = X >= 0 && Y >= 0 && X < SCENE_W && Y < SCENE_H && b[Y * SCENE_W + X] === 1;
        }
      if (hit) n++;
    }
  return n;
}

function union(...ms: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(SCENE_W * SCENE_H);
  for (const m of ms) for (let i = 0; i < m.length; i++) out[i] = out[i]! | m[i]!;
  return out;
}

const part = (slot: SlotId, id: string, parts: Partial<Record<SlotId, string>> = {}) =>
  `parts/${layerKey(slot, id, parts)}`;
/** The husk region, or each option that can replace it. */
const choices = (region: 'head' | 'torso' | 'armR' | 'armL' | 'legR' | 'legL') => [
  `husk/${region}`,
  ...ids(region).map((id) => `parts/${id}`),
];

/** Least number of pixels where two sewn pieces meet. */
const SEAM = 8;

describe('the husk and its painted parts', () => {
  it('has a layer for every option, on every base it can be painted onto', () => {
    const missing: string[] = [];
    for (const r of REGIONS) if (!SHEET.husk[r]) missing.push(`husk/${r}`);
    for (const slot of SLOTS) {
      const base = BASE_OF[slot];
      for (const id of ids(slot))
        for (const b of base ? ids(base) : [null]) {
          const key = layerKey(slot, id, b && base ? { [base]: b } : {});
          if (!SHEET.parts[key]) missing.push(key);
        }
    }
    expect(missing).toEqual([]);
  });

  it('keeps every layer inside the scene', () => {
    for (const group of ['husk', 'parts'] as const)
      for (const [key, [x, y, w, h]] of Object.entries(SHEET[group])) {
        expect(x! >= 0 && y! >= 0, key).toBe(true);
        expect(x! + w! <= SCENE_W && y! + h! <= SCENE_H, key).toBe(true);
      }
  });

  it('sews every head, arm and leg onto every torso it can meet', () => {
    const problems: string[] = [];
    const loincloth = maskOf('husk/loincloth');
    for (const torso of choices('torso')) {
      const t = maskOf(torso);
      for (const limb of ['head', 'armR', 'armL'] as const)
        for (const src of choices(limb)) {
          const n = touching(maskOf(src), t);
          if (n < SEAM) problems.push(`${src} meets ${torso} along ${n} px`);
        }
      const n = touching(t, loincloth);
      if (n < SEAM) problems.push(`${torso} meets the loincloth along ${n} px`);
    }
    for (const leg of [...choices('legR'), ...choices('legL')]) {
      const n = touching(maskOf(leg), loincloth);
      if (n < SEAM) problems.push(`${leg} meets the loincloth along ${n} px`);
    }
    expect(problems).toEqual([]);
  });

  it('sews every add-on onto the part it was painted for', () => {
    const problems: string[] = [];
    for (const slot of SLOTS) {
      const baseSlot = BASE_OF[slot];
      if (!baseSlot) continue;
      for (const id of ids(slot))
        for (const base of ids(baseSlot)) {
          const src = part(slot, id, { [baseSlot]: base });
          // a second head sits on the shoulder: torso, or the top of whichever arm is there
          const hosts = slot === 'head2' ? choices('armL') : [null];
          for (const arm of hosts) {
            const host = arm
              ? union(maskOf(`parts/${base}`), maskOf(arm))
              : maskOf(`parts/${base}`);
            const n = touching(maskOf(src), host);
            if (n < SEAM)
              problems.push(`${src} touches ${base}${arm ? ` + ${arm}` : ''} along ${n} px`);
          }
        }
    }
    expect(problems).toEqual([]);
  });

  it('roots wings, spine, tail and third arm in every body they can grow from', () => {
    const problems: string[] = [];
    for (const slot of ['wings', 'spine', 'tail', 'arm3'] as const)
      for (const id of ids(slot))
        for (const torso of choices('torso')) {
          const body = union(
            maskOf(torso),
            maskOf('husk/armR'),
            maskOf('husk/armL'),
            maskOf('husk/legL'),
            maskOf('husk/loincloth'),
          );
          const n = touching(maskOf(`parts/${id}`), body);
          if (n < SEAM) problems.push(`${id} behind ${torso}: ${n} px`);
        }
    expect(problems).toEqual([]);
  });

  it('stands every leg on the floor', () => {
    for (const leg of [...choices('legR'), ...choices('legL')]) {
      const [group, key] = leg.split('/') as ['husk' | 'parts', string];
      const [, y, , h] = SHEET[group][key]!;
      expect(y! + h!, leg).toBeGreaterThanOrEqual(FLOOR_Y - 1);
      expect(y! + h!, leg).toBeLessThanOrEqual(FLOOR_Y);
    }
  });

  it('buries no part on a finished monster', () => {
    const problems: string[] = [];
    // Least share that must show. Painted add-ons carry a little of the redrawn body around them
    // (a chest eye on a ribcage brings ribs), so their count is lower than the part itself.
    const least: Partial<Record<SlotId, number>> = {
      wings: 0.2,
      spine: 0.15,
      tail: 0.15,
      chestEye: 0.15,
    };
    for (const slot of SLOTS) {
      if (slot === 'torso' || slot === 'head') continue;
      for (const id of ids(slot))
        for (const torso of ids('torso'))
          for (const head of ids('head'))
            for (let k = 0; k < 2; k++) {
              const parts: Partial<Record<SlotId, string>> = {};
              QUESTIONS.forEach((q, i) => (parts[q.slot] = q.options[(k + i) % 5]!.id));
              Object.assign(parts, { torso, head, [slot]: id });
              const placed = layoutMonster(parts, SHEET);
              const t = placed.find((p) => p.slot === slot);
              if (!t) {
                problems.push(`${layerKey(slot, id, parts)} has no layer`);
                continue;
              }
              const v = shown(placed, t);
              if (v < (least[slot] ?? 0.3))
                problems.push(`${t.src} with ${torso} + ${head}: ${Math.round(v * 100)}% shows`);
            }
    }
    expect([...new Set(problems)]).toEqual([]);
  });
});

/** Share of a layer's pixels not covered by layers drawn in front of it. */
function shown(placed: Piece[], t: Piece): number {
  const at = placed.indexOf(t);
  const front = union(...placed.filter((_, i) => i > at).map((p) => maskOf(p.src)));
  const own = maskOf(t.src);
  let all = 0;
  let seen = 0;
  for (let i = 0; i < own.length; i++)
    if (own[i]) {
      all++;
      if (!front[i]) seen++;
    }
  return seen / all;
}

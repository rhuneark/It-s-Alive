/**
 * Which layers make up the monster, in draw order. Pure data, no DOM.
 *
 * The monster is one human husk. Each night's winning part was painted INTO the
 * husk (tools/art/husk.py): a head onto its neck, a torso between its shoulders,
 * horns onto the chosen head, a heart into the chosen chest. Every layer is
 * already cut to its place in the 224x200 laboratory scene (layers.json), so
 * nothing is positioned here: we only choose the husk pieces and the layers to
 * show, and stack them back to front.
 */
import { questionForSlot, type SlotId } from './catalog';

export const SCENE_W = 224;
export const SCENE_H = 200;
/** The row the husk's feet stand on. */
export const FLOOR_Y = 192;

/** Parts of the husk that a vote can replace, plus the rag that stays at the waist. */
export type Region = 'head' | 'torso' | 'loincloth' | 'armR' | 'armL' | 'legR' | 'legL';
export const REGIONS: readonly Region[] = [
  'head',
  'torso',
  'loincloth',
  'armR',
  'armL',
  'legR',
  'legL',
];

/** [x, y, w, h] in scene pixels. */
export type Box = readonly number[];

export interface LayerSheet {
  husk: Record<string, Box>;
  parts: Record<string, Box>;
}

/** Slots that replace a husk region outright. */
const REPLACES: Partial<Record<SlotId, Region>> = {
  head: 'head',
  torso: 'torso',
  armR: 'armR',
  armL: 'armL',
  legR: 'legR',
  legL: 'legL',
};

/** Add-ons painted onto one particular chosen part: their layer depends on it. */
export const BASE_OF: Partial<Record<SlotId, SlotId>> = {
  browEye: 'head',
  horns: 'head',
  ears: 'head',
  jaw: 'head',
  brain: 'head',
  chestEye: 'torso',
  heart: 'torso',
  maw: 'torso',
  head2: 'torso',
  hide: 'legR',
};

/** Draw order, back to front (matches Z in tools/art/husk.py). */
const Z: Record<SlotId | Region, number> = {
  wings: 0,
  arm3: 1,
  spine: 2,
  tail: 3,
  legR: 4,
  legL: 4,
  hide: 5,
  torso: 6,
  chestEye: 7,
  maw: 8,
  heart: 9,
  loincloth: 10,
  armR: 11,
  armL: 11,
  head: 12,
  ears: 13,
  horns: 14,
  brain: 15,
  jaw: 16,
  browEye: 17,
  head2: 18,
  spark: 19,
};

export interface Piece {
  /** Image path under art/: husk/<region> or parts/<key>. */
  src: string;
  /** The vote slot this layer shows, or the husk region when it is bare husk. */
  slot: SlotId | Region;
  husk: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

/**
 * Layer key for an option: add-ons painted per base are keyed "<option>@<base>".
 * Before its base is chosen (never in a real season) the base's first option stands in.
 */
export function layerKey(slot: SlotId, id: string, parts: Partial<Record<SlotId, string>>): string {
  const baseSlot = BASE_OF[slot];
  if (!baseSlot) return id;
  const base = parts[baseSlot] ?? questionForSlot(baseSlot).options[0].id;
  return `${id}@${base}`;
}

const piece = (src: string, slot: SlotId | Region, isHusk: boolean, b: Box): Piece => ({
  src,
  slot,
  husk: isHusk,
  x: b[0]!,
  y: b[1]!,
  w: b[2]!,
  h: b[3]!,
  z: Z[slot],
});

/**
 * Every layer to draw for these parts (slot -> option id), back to front. Husk
 * regions that have not been replaced yet show bare husk. The spark has no layer.
 */
export function layoutMonster(parts: Partial<Record<SlotId, string>>, sheet: LayerSheet): Piece[] {
  const out: Piece[] = [];
  const replaced = new Set<Region>();
  for (const slot of Object.keys(parts) as SlotId[]) {
    const id = parts[slot];
    if (!id || slot === 'spark') continue;
    // an add-on was painted onto a chosen head / torso / leg: without one it has nothing to sit on
    const baseSlot = BASE_OF[slot];
    if (baseSlot && !parts[baseSlot]) continue;
    const key = layerKey(slot, id, parts);
    const box = sheet.parts[key];
    if (!box) continue;
    const region = REPLACES[slot];
    if (region) replaced.add(region);
    out.push(piece(`parts/${key}`, slot, false, box));
  }
  for (const region of REGIONS) {
    const box = sheet.husk[region];
    if (!replaced.has(region) && box) out.push(piece(`husk/${region}`, region, true, box));
  }
  return out.sort((a, b) => a.z - b.z);
}

/** Where tonight's part will go: the box of its first option on the current monster. */
export function slotBox(
  slot: SlotId,
  parts: Partial<Record<SlotId, string>>,
  sheet: LayerSheet,
): Box | null {
  if (slot === 'spark') return null;
  const id = questionForSlot(slot).options[0].id;
  return sheet.parts[layerKey(slot, id, parts)] ?? null;
}

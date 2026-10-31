/**
 * The creature everyone built, as sprites for the rampage: its painted layers (the real winners
 * of every night) composited once onto one canvas, cropped to the body, plus a glowing copy in the
 * spark's colour and one canvas per part so a part can light up when its power wakes.
 */
import type { SlotId } from '../game/catalog';
import {
  FLOOR_Y,
  SCENE_H,
  SCENE_W,
  layoutMonster,
  type LayerSheet,
  type Piece,
} from '../game/layout';
import LAYER_DATA from '../game/layers.json';

const LAYERS: LayerSheet = LAYER_DATA;
const BASE = import.meta.env.BASE_URL;
/** Room around the body for the glow. */
const PAD = 10;

export interface CreatureSprite {
  body: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  /** Each slot's own layers, on the same canvas size as `glow`. */
  parts: Map<string, HTMLCanvasElement>;
  /** Slots back to front, the order the parts are drawn in (see creatureRig.ts). */
  order: string[];
  /** Add to a 224x200 scene point to get the same point on the `glow` canvas. */
  originX: number;
  originY: number;
  /** Where the feet are on the `glow` canvas (px). */
  footX: number;
  footY: number;
  /** Feet-to-top height of the body (px), what the creature's size maps to. */
  height: number;
}

const images = new Map<string, Promise<HTMLImageElement>>();

/** Load (once) and decode an image under the game's base path. */
export function loadImage(path: string): Promise<HTMLImageElement> {
  let p = images.get(path);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`could not load ${path}`));
      img.src = `${BASE}${path}`;
    });
    images.set(path, p);
  }
  return p;
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function draw(ctx: CanvasRenderingContext2D, pieces: Piece[], imgs: Map<string, HTMLImageElement>) {
  for (const p of pieces) {
    const img = imgs.get(p.src);
    if (img) ctx.drawImage(img, p.x, p.y, p.w, p.h);
  }
}

export async function buildCreatureSprite(
  parts: Partial<Record<SlotId, string>>,
  aura: string,
): Promise<CreatureSprite> {
  const pieces = layoutMonster(parts, LAYERS);
  const imgs = new Map<string, HTMLImageElement>();
  await Promise.all(
    pieces.map(async (p) => {
      try {
        imgs.set(p.src, await loadImage(`art/${p.src}.png`));
      } catch {
        // a missing layer leaves a gap rather than no creature at all
      }
    }),
  );

  // The whole scene, then crop to the body.
  const scene = canvas(SCENE_W, SCENE_H);
  const sctx = scene.getContext('2d')!;
  draw(sctx, pieces, imgs);
  const { data } = sctx.getImageData(0, 0, SCENE_W, SCENE_H);
  let x0 = SCENE_W;
  let y0 = SCENE_H;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < SCENE_H; y++)
    for (let x = 0; x < SCENE_W; x++)
      if (data[(y * SCENE_W + x) * 4 + 3]! > 24) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < x0) {
    x0 = 0;
    y0 = 0;
    x1 = SCENE_W - 1;
    y1 = SCENE_H - 1;
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const body = canvas(w, h);
  body.getContext('2d')!.drawImage(scene, x0, y0, w, h, 0, 0, w, h);

  const glow = canvas(w + PAD * 2, h + PAD * 2);
  const gctx = glow.getContext('2d')!;
  gctx.filter = `drop-shadow(0 0 2px ${aura}) drop-shadow(0 0 6px ${aura})`;
  gctx.drawImage(body, PAD, PAD);
  gctx.filter = 'none';

  const partCanvases = new Map<string, HTMLCanvasElement>();
  const order: string[] = [];
  for (const p of pieces) if (!order.includes(p.slot)) order.push(p.slot);
  for (const slot of order) {
    const c = canvas(glow.width, glow.height);
    const ctx = c.getContext('2d')!;
    ctx.translate(PAD - x0, PAD - y0);
    draw(
      ctx,
      pieces.filter((p) => p.slot === slot),
      imgs,
    );
    partCanvases.set(slot, c);
  }

  const feet = Math.min(y1, FLOOR_Y);
  return {
    body,
    glow,
    parts: partCanvases,
    order,
    originX: PAD - x0,
    originY: PAD - y0,
    footX: PAD + (SCENE_W / 2 - 0.5 - x0),
    footY: PAD + (feet - y0),
    height: feet - y0,
  };
}

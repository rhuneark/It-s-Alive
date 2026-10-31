/**
 * The home's one button, drawn as pixel art and oozing with the creature's power: a slab of
 * stitched flesh with a neck bolt at each end, glowing ooze in the colour of the creature's spark
 * pouring over its top and dripping off its bottom, cracks that light up with a heartbeat,
 * lightning arcing from the bolts, and AWAKEN in chunky pixel letters. One art pixel is PX CSS
 * pixels; it animates at FPS frames a second (still for reduced-motion players).
 */
import { useEffect, useRef } from 'react';
import { AURA, withAlpha } from '../app/drawing';

const PX = 3;
const FPS = 15;
/** Room around the slab, in art pixels, for the glow, the bolts, the arcs and the drips. */
const M = { top: 15, side: 9, bottom: 22 };
const BEAT = 1.15;

type RGB = readonly [number, number, number];

const hex = (s: string): RGB => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const INK = hex('#060104');
const HIDE = ['#3d2c43', '#2a1d30', '#1b1221', '#0e0812'].map(hex);
const RIM = hex('#6a4f72');
const SHADE = hex('#07040a');
const SEAM = hex('#0a0205');
const THREAD = hex('#dccaa8');
const STEEL = hex('#7e8591');
const STEEL_HI = hex('#d4dae4');
const STEEL_LO = hex('#363a43');
const BONE = [hex('#fffaf0'), hex('#f2dcc2'), hex('#c9a688')];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)]!;

/** A hash in 0..1 of two integers (the same every time). */
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// 7x9 letters, two pixels thick.
const GLYPHS: Record<string, string[]> = {
  A: [
    '..###..',
    '.#####.',
    '##...##',
    '##...##',
    '##...##',
    '#######',
    '#######',
    '##...##',
    '##...##',
  ],
  W: [
    '##...##',
    '##...##',
    '##...##',
    '##.#.##',
    '##.#.##',
    '##.#.##',
    '#######',
    '.##.##.',
    '.#...#.',
  ],
  K: [
    '##...##',
    '##..##.',
    '##.##..',
    '####...',
    '###....',
    '####...',
    '##.##..',
    '##..##.',
    '##...##',
  ],
  E: [
    '#######',
    '#######',
    '##.....',
    '##.....',
    '######.',
    '######.',
    '##.....',
    '#######',
    '#######',
  ],
  N: [
    '##...##',
    '###..##',
    '####.##',
    '#######',
    '##.####',
    '##..###',
    '##...##',
    '##...##',
    '##...##',
  ],
};
const GW = 7;
const GH = 9;
const GAP = 2;

/** The word's pixels (letter pixels, the outline around them, the pixels it stands on). */
function wordMask(word: string): {
  fill: Array<[number, number]>;
  edge: Array<[number, number]>;
  feet: Array<[number, number]>;
  w: number;
} {
  const on = new Set<string>();
  const fill: Array<[number, number]> = [];
  [...word].forEach((ch, i) => {
    const g = GLYPHS[ch];
    if (!g) return;
    g.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c !== '#') return;
        const px = i * (GW + GAP) + x;
        on.add(`${px},${y}`);
        fill.push([px, y]);
      }),
    );
  });
  const edge: Array<[number, number]> = [];
  const seen = new Set<string>();
  for (const [x, y] of fill)
    for (let dy = -1; dy <= 2; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const k = `${x + dx},${y + dy}`;
        if (on.has(k) || seen.has(k)) continue;
        seen.add(k);
        edge.push([x + dx, y + dy]);
      }
  const feet = fill.filter(([x, y]) => y === GH - 1 && !on.has(`${x},${y + 1}`));
  return { fill, edge, feet, w: word.length * (GW + GAP) - GAP };
}
const WORD = wordMask('AWAKEN');

/** An RGBA pixel buffer with alpha blending. */
class Pixels {
  constructor(
    readonly w: number,
    readonly h: number,
    readonly d: Uint8ClampedArray,
  ) {}
  set(x: number, y: number, c: RGB, a = 1): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4;
    const d = this.d;
    if (a >= 1 || d[i + 3] === 0) {
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = Math.round(Math.min(1, a) * 255);
      return;
    }
    const da = d[i + 3]! / 255;
    const oa = a + da * (1 - a);
    for (let k = 0; k < 3; k++) d[i + k] = (c[k]! * a + d[i + k]! * da * (1 - a)) / oa;
    d[i + 3] = oa * 255;
  }
  empty(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.d[(Math.floor(y) * this.w + Math.floor(x)) * 4 + 3] === 0;
  }
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Arc {
  path: Array<[number, number]>;
  life: number;
}

/** A jagged line of pixels from a to b. */
function bolt(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rnd: () => number,
): Array<[number, number]> {
  const pts: Array<[number, number]> = [[ax, ay]];
  const n = 3 + Math.floor(rnd() * 3);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push([ax + (bx - ax) * t + (rnd() - 0.5) * 5, ay + (by - ay) * t + (rnd() - 0.5) * 5]);
  }
  pts.push([bx, by]);
  const out: Array<[number, number]> = [];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let s = 0; s < steps; s++)
      out.push([
        Math.round(x0 + ((x1 - x0) * s) / steps),
        Math.round(y0 + ((y1 - y0) * s) / steps),
      ]);
  }
  return out;
}

export function AwakenButton({
  spark,
  ready,
  still,
  onClick,
  label,
}: {
  /** The creature's spark option (its colour is the ooze's). */
  spark: string | undefined;
  /** False while the parts are gathered: a dull slab, and the label as text. */
  ready: boolean;
  /** Stop animating (something covers the home). */
  still: boolean;
  onClick: () => void;
  label: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const b = btn.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const kind = spark?.replace('spark_', '') ?? 'lightning';
    const m = (AURA[kind] ?? AURA['lightning']!).match(/[\d.]+/g)!;
    const ooze: RGB = [+m[0]!, +m[1]!, +m[2]!];
    const oozeHi = mix(ooze, WHITE, 0.6);
    const oozeLo = mix(ooze, BLACK, 0.5);
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let seed = 1;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };

    let sw = 0;
    let sh = 0;
    let img: ImageData | null = null;
    let cracks: Array<[number, number]> = [];
    let drips: Array<{ x: number; period: number; off: number }> = [];
    let hangs: Array<{ x: number; len: number }> = [];
    const fit = () => {
      sw = Math.max(48, Math.floor(b.clientWidth / PX));
      sh = Math.max(16, Math.floor(b.clientHeight / PX));
      const w = sw + M.side * 2;
      const h = sh + M.top + M.bottom;
      cv.width = w;
      cv.height = h;
      cv.style.width = `${w * PX}px`;
      cv.style.height = `${h * PX}px`;
      cv.style.left = `${Math.floor((b.clientWidth - sw * PX) / 2) - M.side * PX}px`;
      cv.style.top = `${Math.floor((b.clientHeight - sh * PX) / 2) - M.top * PX}px`;
      img = ctx.createImageData(w, h);
      // Cracks: short random walks in from the top and bottom edges.
      seed = 7;
      cracks = [];
      for (let c = 0; c < 6; c++) {
        const fromTop = c % 2 === 0;
        let x = Math.floor(sw * (0.1 + 0.8 * rnd()));
        let y = fromTop ? 1 : sh - 3;
        const len = 4 + Math.floor(rnd() * 5);
        for (let i = 0; i < len; i++) {
          cracks.push([x, y]);
          y += fromTop ? 1 : -1;
          x += Math.floor(rnd() * 3) - 1;
        }
      }
      drips = [0.1, 0.24, 0.38, 0.55, 0.7, 0.86].map((f, i) => ({
        x: Math.floor(sw * f + (rnd() - 0.5) * 4),
        period: 2.3 + rnd() * 2,
        off: rnd() * 5 + i,
      }));
      hangs = [
        3,
        13,
        21,
        Math.floor(sw * 0.36),
        Math.floor(sw * 0.58),
        sw - 24,
        sw - 15,
        sw - 6,
      ].map((x) => ({
        x,
        len: 5 + Math.floor(rnd() * 6),
      }));
    };

    const sparks: Spark[] = [];
    const arcs: Arc[] = [];
    let nextArc = 0.4;
    let nextSurge = 1.2;
    let flash = 0;
    let side = 0;

    const draw = (t: number, dt: number) => {
      if (!img) return;
      img.data.fill(0);
      const P = new Pixels(img.width, img.height, img.data);
      const ox = M.side;
      const oy = M.top;
      const cy = oy + Math.floor(sh / 2);
      const live = ready;

      // The heartbeat: lub-dub, and every arc adds a flash.
      const p = t % BEAT;
      const bump = (c: number, w: number) => Math.max(0, 1 - Math.abs(p - c) / w);
      flash = Math.max(0, flash - dt * 5);
      const pulse = live
        ? Math.min(1, Math.max(bump(0.08, 0.16), 0.75 * bump(0.34, 0.14)) + flash)
        : 0;

      // Lightning: small arcs off the bolts, and now and then a surge from bolt to bolt over the
      // top, branching, with sparks where it ends.
      const zap = (path: Array<[number, number]>, life: number) => {
        arcs.push({ path, life });
        const [ex, ey] = path[path.length - 1]!;
        for (let i = 0; i < 5; i++)
          sparks.push({
            x: ex,
            y: ey,
            vx: (Math.random() - 0.5) * 50,
            vy: -Math.random() * 40,
            life: 0.3 + Math.random() * 0.4,
          });
      };
      if (live && !calm) {
        nextArc -= dt;
        nextSurge -= dt;
        const lx = ox - 6;
        const rx = ox + sw + 5;
        if (nextSurge <= 0) {
          nextSurge = 2.4 + Math.random() * 2.2;
          let path: Array<[number, number]> = [];
          const pts: Array<[number, number]> = [[lx, cy - 3]];
          for (let i = 1; i <= 5; i++)
            pts.push([ox + (sw * i) / 6 + (Math.random() - 0.5) * 6, oy - 4 - Math.random() * 7]);
          pts.push([rx, cy - 3]);
          for (let i = 1; i < pts.length; i++)
            path = path.concat(
              bolt(pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1], Math.random),
            );
          zap(path, 0.2);
          for (let i = 0; i < 2; i++) {
            const [bx, by] = path[Math.floor(path.length * (0.25 + Math.random() * 0.5))]!;
            zap(
              bolt(
                bx,
                by,
                bx + (Math.random() - 0.5) * 10,
                by - 3 - Math.random() * 4,
                Math.random,
              ),
              0.2,
            );
          }
          flash = 1;
        } else if (nextArc <= 0) {
          nextArc = 0.3 + Math.random() * 0.7;
          side = 1 - side;
          const sx = side ? rx : lx;
          const dir = side ? 1 : -1;
          const up = Math.random() < 0.65;
          const tx = up ? sx - dir * (2 + Math.random() * 12) : sx + dir * (2 + Math.random() * 5);
          const ty = up ? oy - 3 - Math.random() * 8 : cy + 5 + Math.random() * 10;
          zap(bolt(sx, cy - 3, tx, ty, Math.random), 0.14);
          flash = Math.max(flash, 0.5);
        }
      }

      // A dithered glow around the slab.
      const R = 8;
      for (let y = 0; y < P.h; y++)
        for (let x = 0; x < P.w; x++) {
          const dx = Math.max(ox - x, 0, x - (ox + sw - 1));
          const dy = Math.max(oy - y, 0, y - (oy + sh - 1));
          if (dx === 0 && dy === 0) continue;
          const d = Math.hypot(dx, dy);
          if (d > R) continue;
          const s = (1 - d / R) * (live ? 0.3 + 0.6 * pulse : 0.12);
          if (s > bayer(x, y)) P.set(x, y, ooze, 0.4);
        }

      // The neck bolts.
      for (const s of [0, 1]) {
        const shaft = s ? ox + sw : ox - 3;
        const head = s ? ox + sw + 3 : ox - 5;
        for (let y = cy - 2; y <= cy + 2; y++)
          for (let x = shaft - 1; x <= shaft + 3; x++) P.set(x, y, INK);
        for (let y = cy - 1; y <= cy + 1; y++)
          for (let x = shaft; x < shaft + 3; x++)
            P.set(x, y, y === cy - 1 ? STEEL_HI : y === cy + 1 ? STEEL_LO : STEEL);
        for (let y = cy - 4; y <= cy + 4; y++)
          for (let x = head - 1; x <= head + 2; x++) {
            const edge = y === cy - 4 || y === cy + 4 || x === head - 1 || x === head + 2;
            P.set(
              x,
              y,
              edge ? INK : y === cy - 3 || x === head ? STEEL_HI : y >= cy + 2 ? STEEL_LO : STEEL,
            );
          }
      }

      // The slab: stepped corners, an inked outline, a rim of light, dithered flesh.
      const inside = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= sw || y >= sh) return false;
        const cx = Math.min(x, sw - 1 - x);
        const cyy = Math.min(y, sh - 1 - y);
        return !((cx < 2 && cyy < 1) || (cx < 1 && cyy < 2));
      };
      for (let y = 0; y < sh; y++)
        for (let x = 0; x < sw; x++) {
          if (!inside(x, y)) continue;
          let c: RGB;
          if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1))
            c = INK;
          else if (y === 1 || x === 1 || (y === 2 && (x === 2 || x === sw - 3))) c = RIM;
          else if (y >= sh - 3 || x === sw - 2) c = SHADE;
          else {
            const v = (y / (sh - 3)) * 3;
            const i = Math.min(2, Math.floor(v));
            c = v - i > bayer(x, y) ? HIDE[i + 1]! : HIDE[i]!;
          }
          P.set(ox + x, oy + y, live ? c : mix(c, BLACK, 0.35));
        }

      // Stitched seams near each end.
      for (const sx of [9, sw - 10]) {
        for (let y = 3; y < sh - 3; y++) {
          P.set(ox + sx, oy + y, SEAM);
          if (y % 3 === 1) {
            for (let x = -1; x <= 1; x++) P.set(ox + sx + x, oy + y, THREAD);
            P.set(ox + sx + 2, oy + y + 1, SEAM);
          }
        }
      }

      // Cracks glowing with the beat.
      for (const [x, y] of cracks) {
        if (!live) {
          P.set(ox + x, oy + y, SEAM);
          continue;
        }
        P.set(
          ox + x,
          oy + y,
          pulse > 0.75 ? mix(oozeHi, WHITE, (pulse - 0.75) * 2) : mix(oozeLo, ooze, pulse / 0.75),
        );
      }

      const wx = ox + Math.floor((sw - WORD.w) / 2);
      const wy = oy + Math.floor((sh - GH) / 2) + 1 - (pulse > 0.8 ? 1 : 0);
      if (live) {
        // A thick cap of ooze over the top edge, bubbling.
        for (let x = 0; x < sw; x++) {
          const end = Math.min(x, sw - 1 - x);
          const th =
            end < 2
              ? 1
              : Math.max(
                  2,
                  Math.min(
                    4,
                    Math.round(
                      2.6 +
                        1.1 * Math.sin(x * 0.37 + t * 0.9) +
                        0.8 * Math.sin(x * 1.07 - t * 1.6 + 1),
                    ),
                  ),
                );
          // its top swells and sinks a pixel as it rolls
          const lift = end >= 3 && Math.sin(x * 0.55 + t * 1.3) > 0.55 ? 1 : 0;
          for (let k = -lift; k <= th; k++)
            P.set(
              ox + x,
              oy - 2 + k,
              k === -lift ? oozeHi : k === th ? oozeLo : k === 1 && x % 5 === 2 ? oozeHi : ooze,
            );
        }
        for (let i = 0; i < 4; i++) {
          const bx = ox + Math.floor(sw * (0.14 + 0.24 * i)) + 2;
          const u = (t / 1.6 + i * 0.37) % 1;
          if (u < 0.45) P.set(bx, oy - 3, oozeHi);
          else if (u < 0.8) {
            for (const [x, y] of [
              [-1, -4],
              [0, -4],
              [-2, -3],
              [1, -3],
              [-1, -3],
              [0, -3],
            ] as const)
              P.set(bx + x, oy + y, y === -4 ? oozeHi : ooze);
          } else if (u < 0.92)
            for (const [x, y] of [
              [-3, -5],
              [2, -5],
              [-1, -7],
              [1, -6],
            ] as const)
              P.set(bx + x, oy + y, oozeHi, 0.85);
        }

        // Fat drips hanging from the cap down the face (short ones over the word).
        hangs.forEach((h, i) => {
          const over = ox + h.x >= wx - 2 && ox + h.x <= wx + WORD.w + 1;
          const top = oy + 1;
          const len = Math.round(
            (over ? 1 : h.len * 0.5) +
              (over ? 1.5 : h.len * 0.5) * (0.5 + 0.5 * Math.sin(t * 0.55 + i * 1.9)),
          );
          for (let k = 0; k < len; k++) {
            P.set(ox + h.x, top + k, k < 1 ? ooze : oozeHi);
            P.set(ox + h.x + 1, top + k, ooze);
            P.set(ox + h.x + 2, top + k, oozeLo);
          }
          // a round bulb at the end
          P.set(ox + h.x - 1, top + len - 1, ooze);
          P.set(ox + h.x + 3, top + len - 1, oozeLo);
          P.set(ox + h.x - 1, top + len, ooze);
          P.set(ox + h.x, top + len, oozeHi);
          P.set(ox + h.x + 1, top + len, ooze);
          P.set(ox + h.x + 2, top + len, ooze);
          P.set(ox + h.x + 3, top + len, oozeLo);
          P.set(ox + h.x, top + len + 1, oozeLo);
          P.set(ox + h.x + 1, top + len + 1, oozeLo);
          P.set(ox + h.x + 2, top + len + 1, oozeLo);
        });

        // Drips gathering under the slab, falling, and splashing.
        const base = oy + sh;
        const floor = P.h - 2;
        drips.forEach((d, i) => {
          const at = t + d.off;
          const k = Math.floor(at / d.period);
          const u = at % d.period;
          const max = 4 + Math.floor(hash(i, k) * 7);
          const grow = d.period * 0.6;
          const len =
            u < grow
              ? Math.round(max * Math.pow(u / grow, 1.5))
              : Math.max(1, max - Math.round((u - grow) * 20));
          for (let y = 0; y < len; y++) {
            P.set(ox + d.x, base + y, y === 0 ? ooze : oozeHi);
            P.set(ox + d.x + 1, base + y, ooze);
            P.set(ox + d.x + 2, base + y, y < len - 1 ? oozeLo : ooze);
          }
          if (u < grow && len >= 2) {
            for (let x = -1; x <= 3; x++)
              P.set(ox + d.x + x, base + len, x === 0 ? oozeHi : x === 3 ? oozeLo : ooze);
            for (let x = -1; x <= 3; x++)
              P.set(ox + d.x + x, base + len + 1, x <= 0 ? ooze : oozeLo);
            for (let x = 0; x <= 2; x++) P.set(ox + d.x + x, base + len + 2, oozeLo);
          } else if (u >= grow) {
            const f = u - grow;
            const y0 = base + max + 2;
            const y = y0 + 16 * f + 80 * f * f;
            if (y < floor) {
              for (const [x, yy, c] of [
                [0, -2, 0.4],
                [0, -1, 0.7],
                [-1, 0, 1],
                [0, 0, 1],
                [1, 0, 1],
                [2, 0, 1],
                [-1, 1, 1],
                [0, 1, 1],
                [1, 1, 1],
                [2, 1, 1],
                [0, 2, 1],
                [1, 2, 1],
              ] as const)
                P.set(
                  ox + d.x + x,
                  y + yy,
                  x === 0 && yy === 0 ? oozeHi : yy === 2 || x === 2 ? oozeLo : ooze,
                  c,
                );
            } else {
              const land = (-16 + Math.sqrt(256 + 320 * (floor - y0))) / 160;
              const s = f - land;
              if (s < 0.25) {
                const r = 1 + Math.round(s * 14);
                for (const [x, yy] of [
                  [-r, 0],
                  [r + 1, 0],
                  [-r + 1, -1],
                  [r, -1],
                  [0, 0],
                  [1, 0],
                ] as const)
                  P.set(ox + d.x + x, floor + yy, x === 0 || x === 1 ? ooze : oozeHi, 1 - s * 3);
              }
            }
          }
        });
      }

      // The word, inked, its lower rows lit by the ooze, trickling; it jumps a pixel on the beat.
      if (live) {
        for (const [x, y] of WORD.edge) P.set(wx + x, wy + y, INK);
        for (const [x, y] of WORD.fill) {
          const base = y < 2 ? BONE[0]! : y < 6 ? BONE[1]! : mix(BONE[2]!, ooze, 0.6);
          P.set(wx + x, wy + y, mix(base, oozeHi, pulse * 0.35));
        }
        WORD.feet.forEach(([x, y], i) => {
          if (i % 3 !== 1) return;
          const len = Math.round(1.5 + 1.5 * Math.sin(t * 0.9 + i * 2.3));
          for (let k = 1; k <= len; k++) P.set(wx + x, wy + y + k, k === len ? oozeLo : ooze);
        });
      }

      // Arcs and sparks over everything.
      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i]!;
        for (const [x, y] of a.path)
          for (const [nx, ny] of [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1],
          ] as const)
            if (P.empty(nx, ny)) P.set(nx, ny, ooze, 0.75);
        for (const [x, y] of a.path) P.set(x, y, WHITE);
        if ((a.life -= dt) <= 0) arcs.splice(i, 1);
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]!;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 90 * dt;
        P.set(s.x, s.y, s.life > 0.2 ? WHITE : oozeHi);
        if ((s.life -= dt) <= 0) sparks.splice(i, 1);
      }

      ctx.putImageData(img, 0, 0);
    };

    fit();
    const ro = new ResizeObserver(() => {
      fit();
      draw(Math.max(0, last) / FPS, 0);
    });
    ro.observe(b);
    let raf = 0;
    let last = -1;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const frame = Math.floor((now / 1000) * FPS);
      if (frame === last) return;
      const dt = last < 0 ? 0 : Math.min(0.2, (frame - last) / FPS);
      last = frame;
      draw(frame / FPS, dt);
    };
    if (calm || still || !ready) draw(0.1, 0);
    else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [spark, ready, still]);

  return (
    <button
      ref={btn}
      className={`awaken${ready ? '' : ' awaken-wait'}`}
      style={
        {
          '--ooze': withAlpha(AURA[spark?.replace('spark_', '') ?? ''] ?? AURA['lightning']!, 0.55),
        } as React.CSSProperties
      }
      onClick={onClick}
      disabled={!ready}
      data-testid="awaken-open"
    >
      <canvas ref={canvas} className="awaken-art" aria-hidden="true" />
      <span className={ready ? 'sr-only' : 'awaken-label'}>{label}</span>
    </button>
  );
}

/**
 * Drawing helpers shared by the rampage, the battle and the menu's scene: the spark's glow
 * colours, soft light sprites, debris colours from a sprite, and the night's ground tile.
 */
/** The spark of life chosen on the last night tints the creature's glow. */
export const AURA: Record<string, string> = {
  lightning: 'rgba(198, 242, 255, 0.9)',
  curse: 'rgba(120, 230, 80, 0.9)',
  moon: 'rgba(230, 60, 60, 0.9)',
  ghostfire: 'rgba(90, 160, 255, 0.95)',
  elixir: 'rgba(190, 90, 255, 0.95)',
};

/** The same rgba colour with another alpha. */
export function withAlpha(rgba: string, a: number): string {
  return rgba.replace(/[\d.]+\)\s*$/, `${a})`);
}

/** A soft round pool of light, to stamp out of the night or add onto it. */
export function lightSprite(inner: string, mid: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return c;
}

/** A few colours from a sprite, for its debris. */
export function palette(img: HTMLImageElement): string[] {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, 0, 0, 8, 8);
  const { data } = x.getImageData(0, 0, 8, 8);
  const out: string[] = [];
  for (let i = 0; i < data.length; i += 4 * 5) {
    if (data[i + 3]! > 128) out.push(`rgb(${data[i]}, ${data[i + 1]}, ${data[i + 2]})`);
  }
  return out.length ? out : ['#6b5a48'];
}

/** Night grass (or the stage's ground) as a small repeating pixel tile. */
export function makeGround(ctx: CanvasRenderingContext2D, stageId: string): CanvasPattern | null {
  const tones: Record<string, string[]> = {
    village: ['#1c2a1d', '#213222', '#192619', '#253825'],
    farms: ['#26301b', '#2c381f', '#212a17', '#33401f'],
    market: ['#262526', '#2c2b2c', '#212021', '#323032'],
    graveyard: ['#1b2420', '#1f2a25', '#17201c', '#243029'],
    estate: ['#1a2b22', '#1f3227', '#16251d', '#24392c'],
    city: ['#272628', '#2d2c2e', '#222123', '#333234'],
  };
  const pal = tones[stageId] ?? tones['village']!;
  const tile = document.createElement('canvas');
  tile.width = 16;
  tile.height = 16;
  const t = tile.getContext('2d')!;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const r = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      t.fillStyle = pal[Math.floor((r - Math.floor(r)) * pal.length)]!;
      t.fillRect(x, y, 1, 1);
    }
  const pattern = ctx.createPattern(tile, 'repeat');
  pattern?.setTransform(new DOMMatrix().scale(4));
  return pattern;
}

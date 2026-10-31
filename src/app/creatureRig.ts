/**
 * The creature everyone built, brought to life: each part it was stitched from moves on its own
 * joint. Legs stride, arms swing and claw, the third arm writhes, wings beat, the tail lashes, the
 * head bobs and throws itself back to roar, the chest breathes and swells as it grows. Everything
 * painted onto the head (horns, ears, eyes, brain) moves with the head, and everything on the chest
 * (its eye, heart, belly maw, second head, spines) with the chest. Joints are the husk's own, in
 * the 224x200 lab scene (layers.json: husk regions).
 */
import type { CreatureSprite } from './creatureSprite';

export interface Pose {
  /** Seconds, for idle motion. */
  t: number;
  /** Walk cycle phase (radians), and how far into its stride it is (0 standing, 1 walking). */
  walk: number;
  stride: number;
  /** A claw attack in progress (0..1), and with which arm (1 its right, -1 its left). */
  attack: number;
  side: 1 | -1;
  /** Rearing up to roar, arms spread (0..1). */
  roar: number;
  /** Swelling as it grows (0..1): the chest heaves (the whole body's swell is the caller's). */
  swell: number;
  /** Wings beating hard (0..1), e.g. in a leap. */
  beat: number;
  /** Parts lit up as their power wakes, and how brightly (0..1.5). */
  glowSlots?: readonly string[];
  glow?: number;
}

const NECK: [number, number] = [112, 66];
const WAIST: [number, number] = [113, 112];
const SHOULDER_R: [number, number] = [96, 72];
const SHOULDER_L: [number, number] = [129, 72];
const HIP_R: [number, number] = [97, 122];
const HIP_L: [number, number] = [125, 122];
const WING_ROOT: [number, number] = [113, 82];
const TAIL_ROOT: [number, number] = [120, 114];
const ARM3_ROOT: [number, number] = [98, 72];

const HEAD = new Set(['head', 'horns', 'ears', 'browEye', 'jaw', 'brain']);
const CHEST = new Set(['torso', 'chestEye', 'heart', 'maw', 'head2', 'spine', 'loincloth']);

/**
 * How far an arm swings out for a claw at progress a (0..1): raised high and wide, then slashed
 * down and across the body, then back. Positive swings the hand outward.
 */
export function clawSwing(a: number): number {
  if (a <= 0 || a >= 1) return 0;
  if (a < 0.3) return 2 * Math.sin(((a / 0.3) * Math.PI) / 2);
  if (a < 0.5) return 2 - 2.7 * ((a - 0.3) / 0.2);
  return -0.7 * (1 - (a - 0.5) / 0.5);
}

/** Draw the creature in the pose onto ctx, in the sprite's `glow` canvas pixel space. */
export function drawRig(ctx: CanvasRenderingContext2D, sprite: CreatureSprite, pose: Pose): void {
  const ox = sprite.originX;
  const oy = sprite.originY;
  const m = pose.stride;
  const s = Math.sin(pose.walk);
  const swing = clawSwing(pose.attack);
  // The chest heaves (small: the arms and legs stay on their joints).
  const breathe = Math.sin(pose.t * 2.2) * 0.015 + pose.swell * 0.03 + pose.roar * 0.03;
  const bob = Math.abs(s) * 2 * m;
  // Rearing up: arms spread wide, head thrown back.
  const spread = pose.roar * 1.1;

  const about = (p: [number, number], rot: number, sx = 1, sy = 1) => {
    ctx.translate(p[0] + ox, p[1] + oy);
    if (rot) ctx.rotate(rot);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.translate(-(p[0] + ox), -(p[1] + oy));
  };

  for (const slot of sprite.order) {
    const c = sprite.parts.get(slot);
    if (!c) continue;
    ctx.save();
    // The whole upper body rides the stride, and rises as it rears.
    if (slot !== 'legR' && slot !== 'legL') ctx.translate(0, -bob - pose.roar * 3);
    if (slot === 'legR') about(HIP_R, s * 0.26 * m);
    else if (slot === 'legL') about(HIP_L, -s * 0.26 * m);
    // Its right arm is on the left of the picture: a positive turn swings that hand outward.
    else if (slot === 'armR')
      about(SHOULDER_R, -s * 0.22 * m + spread + (pose.side === 1 ? swing : 0));
    else if (slot === 'armL')
      about(SHOULDER_L, s * 0.22 * m - spread - (pose.side === -1 ? swing : 0));
    else if (slot === 'arm3')
      about(ARM3_ROOT, Math.sin(pose.t * 2.6) * 0.22 + swing * 0.5 + spread * 0.6);
    else if (slot === 'wings')
      about(
        WING_ROOT,
        0,
        1 + Math.sin(pose.t * (3 + pose.beat * 9)) * (0.08 + pose.beat * 0.22) + pose.roar * 0.12,
        1 - pose.beat * 0.05,
      );
    else if (slot === 'tail')
      about(
        TAIL_ROOT,
        Math.sin(pose.t * (2.6 + pose.roar * 6) + 1) * (0.2 + pose.roar * 0.15) + s * 0.08 * m,
      );
    else if (HEAD.has(slot)) {
      about(WAIST, 0, 1 + breathe, 1 + breathe);
      about(
        NECK,
        Math.sin(pose.walk * 0.5) * 0.06 * m -
          pose.roar * 0.18 +
          Math.sin(pose.t * 30) * pose.roar * 0.04,
        1 + pose.roar * 0.1,
        1 + pose.roar * 0.1,
      );
    } else if (CHEST.has(slot)) about(WAIST, 0, 1 + breathe, 1 + breathe);
    ctx.drawImage(c, 0, 0);
    if (pose.glow && pose.glowSlots?.includes(slot)) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(0.75, pose.glow * 0.5);
      ctx.drawImage(c, 0, 0);
    }
    ctx.restore();
  }
}

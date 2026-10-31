/**
 * Story upgrades, bought with rubble: every run's rubble goes into the player's purse, and each
 * level costs more than the last (idle-game style, so the numbers run into the millions and
 * billions). Rubble Value multiplies everything a run earns, so the purse grows with it. Story
 * only: a battle is fair, nobody brings upgrades (only the power-ups lying about count there).
 * Pure; the levels and the purse live in the save (state.ts).
 */
import { BASE_SIZE, RUN_SECONDS } from './rampage';
import type { Boost } from './rampageRun';

export type UpgradeId = 'value' | 'claws' | 'stride' | 'birth' | 'time';

export interface UpgradeSpec {
  id: UpgradeId;
  name: string;
  /** What one level does. */
  text: string;
  base: number;
  growth: number;
  max: number;
}

export const UPGRADES: readonly UpgradeSpec[] = [
  {
    id: 'value',
    name: 'Rubble Value',
    text: '×1.5 rubble from everything',
    base: 400,
    growth: 2.1,
    max: 40,
  },
  { id: 'claws', name: 'Sharper Claws', text: 'Claws 10% faster', base: 900, growth: 2.6, max: 10 },
  { id: 'stride', name: 'Longer Stride', text: '6% faster', base: 900, growth: 2.6, max: 10 },
  { id: 'birth', name: 'Born Bigger', text: 'Starts 5% bigger', base: 2000, growth: 3, max: 10 },
  { id: 'time', name: 'More Time', text: '+5 seconds a run', base: 1500, growth: 3.2, max: 6 },
];

export type Levels = Partial<Record<UpgradeId, number>>;

export const level = (levels: Levels, id: UpgradeId): number => levels[id] ?? 0;

/** What the next level costs (Infinity once maxed). */
export function cost(spec: UpgradeSpec, at: number): number {
  return at >= spec.max ? Infinity : Math.round(spec.base * spec.growth ** at);
}

/** What the levels make of a story run. */
export function storyRun(levels: Levels): { boost: Boost; start: number; seconds: number } {
  return {
    boost: {
      value: 1.5 ** level(levels, 'value'),
      claw: 1 + 0.1 * level(levels, 'claws'),
      speed: 1 + 0.06 * level(levels, 'stride'),
    },
    start: Math.round(BASE_SIZE * (1 + 0.05 * level(levels, 'birth'))),
    seconds: RUN_SECONDS + 5 * level(levels, 'time'),
  };
}

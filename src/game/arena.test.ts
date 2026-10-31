import { describe, expect, it } from 'vitest';
import { Arena, BATTLE_SECONDS, EAT_RATIO, SEATS, SPAWN_SHIELD, botSeat, type Seat } from './arena';
import { POWERUPS } from './powerup';
import { BASE_SIZE, STAGES, buildWorld } from './rampage';

const world = buildWorld('arena', STAGES[5]);
const you: Seat = { id: 'you', name: 'You', bot: false, parts: {} };

function battle(seed: string, seconds = BATTLE_SECONDS) {
  const arena = new Arena(world, seed, seconds);
  arena.add(you);
  arena.fillWithBots(seed);
  const events = [];
  while (!arena.over) events.push(...arena.step(1 / 20));
  events.push(...arena.step(1 / 20));
  return { arena, events };
}

describe('a battle', () => {
  it('fills the empty seats with bots, the same ones for the same match', () => {
    const a = new Arena(world, 'm1');
    a.add(you);
    a.fillWithBots('m1');
    expect(a.fighters.size).toBe(SEATS);
    expect([...a.fighters.values()].filter((f) => f.seat.bot)).toHaveLength(SEATS - 1);
    expect(botSeat('m1', 3)).toEqual(botSeat('m1', 3));
    expect(Object.keys(botSeat('m1', 3).parts).length).toBeGreaterThan(10);
  });

  it('lasts three minutes; creatures grow, devour each other, come back, and are ranked by mass', () => {
    const { arena, events } = battle('full');
    expect(arena.time).toBeGreaterThanOrEqual(BATTLE_SECONDS);
    expect(events.at(-1)).toEqual({ type: 'end' });
    const devours = events.filter((e) => e.type === 'devour');
    expect(devours.length).toBeGreaterThan(0);
    expect(events.filter((e) => e.type === 'respawn').length).toBeGreaterThan(0);
    const table = arena.standings();
    expect(table.map((s) => s.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (let i = 1; i < table.length; i++)
      expect(table[i - 1]!.mass).toBeGreaterThanOrEqual(table[i]!.mass);
    // Big numbers: the winner's mass runs into the hundreds of thousands.
    expect(table[0]!.mass).toBeGreaterThan(100_000);
    // ...but the place is never flattened: the village rebuilds behind them.
    const standing = arena.field.props.filter((p) => p.alive).length;
    expect(standing / arena.field.props.length).toBeGreaterThan(0.15);
  });

  it('runs fast enough for a server room at 20 steps a second', () => {
    const t0 = performance.now();
    battle('speed', 60);
    const ms = performance.now() - t0;
    // A minute of battle (1,200 steps) well under the minute it covers.
    expect(ms).toBeLessThan(6000);
  });

  it('lets a creature devour one small enough, but not one in Iron Hide', () => {
    const a = new Arena(world, 'eat');
    const big = a.add({ id: 'big', name: 'Big', bot: false, parts: {} });
    const small = a.add({ id: 'small', name: 'Small', bot: false, parts: {} });
    delete big.beast.buffs.ironhide;
    big.beast.feed(200_000);
    expect(small.beast.size).toBeLessThanOrEqual(big.beast.might * EAT_RATIO);
    small.beast.x = big.beast.x + 5;
    small.beast.y = big.beast.y;
    // Just back from the dead: shielded.
    expect(small.beast.buffs.ironhide).toBe(SPAWN_SHIELD);
    let events = a.step(1 / 20);
    expect(events.some((e) => e.type === 'devour')).toBe(false);
    delete small.beast.buffs.ironhide;
    small.beast.x = big.beast.x + 5;
    small.beast.y = big.beast.y;
    events = a.step(1 / 20);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'devour', who: 'big', victim: 'small' }),
    );
    expect(small.beast.alive).toBe(false);
    // It comes back small, a few seconds later.
    for (let i = 0; i < 80; i++) a.step(1 / 20);
    expect(small.beast.alive).toBe(true);
    expect(small.beast.mass).toBeLessThan(5_000);
    expect(small.beast.size).toBeLessThan(BASE_SIZE * 1.1);
  });

  it('gives power-ups to whoever walks over them, and puts new ones out', () => {
    const a = new Arena(world, 'pick');
    const f = a.add(you);
    const pu = a.field.pickups.find((p) => POWERUPS[p.kind].seconds > 0)!;
    f.beast.x = pu.x;
    f.beast.y = pu.y;
    const events = a.step(1 / 20);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'run', who: 'you', event: { type: 'pickup', pickup: pu } }),
    );
    expect(f.beast.buffed(pu.kind)).toBe(true);
    expect(pu.alive).toBe(false);
    for (let i = 0; i < 20 * 7; i++) a.step(1 / 20);
    expect(pu.alive).toBe(true);
    expect(f.beast.buffed(pu.kind)).toBe(false);
  });
});

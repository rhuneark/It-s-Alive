import { describe, expect, it } from 'vitest';
import { SEATS } from './arena';
import { BattleHost, type HostMsg } from './battleHost';
import {
  JOIN_UNTIL,
  LOBBY_SECONDS,
  TICK_MS,
  unpackEvent,
  unpackFighters,
  unpackPickups,
} from './battleWire';

const run = (host: BattleHost, seconds: number) => {
  const out: HostMsg[] = [];
  for (let t = 0; t < seconds * 1000; t += TICK_MS) out.push(...host.tick());
  return out;
};

describe('a hosted battle', () => {
  it('seats players, waits in the lobby, fills the rest with bots, plays to the end', () => {
    const host = new BattleHost('host-1', 30);
    const a = host.join('alice', 'Alice', { head: 'head_werewolf', nonsense: 'x' });
    expect(a!.match.phase).toBe('lobby');
    expect(a!.match.seats[0]!.parts).toEqual({ head: 'head_werewolf' });
    host.join('bob', 'Bob', {});
    // The lobby, then the battle with every seat taken.
    const start = run(host, LOBBY_SECONDS + 0.1);
    expect(start).toContainEqual(expect.objectContaining({ type: 'phase', phase: 'battle' }));
    const roster = start.filter((m) => m.type === 'roster').at(-1)!;
    expect(roster.type === 'roster' && roster.seats).toHaveLength(SEATS);

    const play = run(host, 31);
    const snaps = play.filter((m) => m.type === 'snap');
    // Ten snapshots a second, every one of them readable.
    expect(snaps.length).toBeGreaterThan(280);
    for (const s of snaps) {
      if (s.type !== 'snap') continue;
      const fighters = unpackFighters(s.f);
      expect(fighters).toHaveLength(SEATS);
      for (const f of fighters) expect(f.i).toBeGreaterThanOrEqual(0);
      expect(unpackPickups(s.pu).length).toBeGreaterThan(0);
      for (const e of s.ev) expect(unpackEvent(e)).not.toBeNull();
    }
    const over = play.find((m) => m.type === 'over');
    expect(over && over.type === 'over' && over.table).toHaveLength(SEATS);
    expect(host.phase).toBe('over');
    expect(host.open).toBe(false);
  });

  it("lets a late player take a bot's seat, and plays on for a player who leaves", () => {
    const host = new BattleHost('host-2', 60);
    host.join('alice', 'Alice', {});
    run(host, LOBBY_SECONDS + 0.1);
    expect(host.open).toBe(true);
    const late = host.join('carol', 'Carol', {});
    expect(late!.match.phase).toBe('battle');
    const seats = late!.match.seats;
    expect(seats).toHaveLength(SEATS);
    expect(
      seats
        .filter((s) => !s.bot)
        .map((s) => s.id)
        .sort(),
    ).toEqual(['alice', 'carol']);
    const left = host.leave('alice');
    const after = left[0]!;
    expect(after.type === 'roster' && after.seats.find((s) => s.id === 'alice')!.bot).toBe(true);
    // Nobody joins in the last JOIN_UNTIL seconds.
    run(host, 60 - JOIN_UNTIL + 1);
    expect(host.open).toBe(false);
  });
});

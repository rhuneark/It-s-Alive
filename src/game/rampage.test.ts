import { describe, expect, it } from 'vitest';
import {
  BASE_SIZE,
  GROWTH,
  POWERS,
  PROPS,
  RUBBLE_BANDS,
  STAGES,
  WORLD_H,
  WORLD_W,
  bandValue,
  buildWorld,
  canSmash,
  communitySize,
  orient,
  powerParts,
  rankFor,
  rubbleBand,
  sizeAfter,
  totalFromBands,
  venueFor,
  venueWorld,
  type World,
} from './rampage';
import { BOUNTY_BONUS, bountiesFor, type Bounty } from './bounty';
import {
  CHAIN_GAP,
  CHAIN_STEP,
  HIT_SHARE,
  RampageRun,
  braveWith,
  chainMultiplier,
  type Steer,
} from './rampageRun';
import { rngFor } from './rng';
import { newSave, parseSave, recordRun } from './state';

/** Nothing it cannot smash stands between it and (x, y). */
function clearPath(run: RampageRun, x: number, y: number): boolean {
  const dx = x - run.x;
  const dy = y - run.y;
  const len2 = dx * dx + dy * dy || 1;
  const body = run.reach * 0.6;
  for (const p of run.props) {
    if (!p.alive || p.mover || canSmash(run.size, p.kind)) continue;
    const t = Math.max(0, Math.min(1, ((p.x - run.x) * dx + (p.y - run.y) * dy) / len2));
    if (Math.hypot(run.x + dx * t - p.x, run.y + dy * t - p.y) < p.r + body) return false;
  }
  return true;
}

/** A decent player: head for the nearest thing it can smash with nothing big in the way; give up on one it is stuck behind. */
function player(seed = 'player') {
  let target = -1;
  let stuck = 0;
  let lx = 0;
  let ly = 0;
  // Boxed in among big buildings: wander off a moment, as a player would steer around them.
  let wander = 0;
  let away: Steer = { x: 0, y: 0 };
  const turn = rngFor(seed);
  const banned = new Map<number, number>();
  return (run: RampageRun): Steer => {
    if (wander > 0) {
      wander--;
      lx = run.x;
      ly = run.y;
      return away;
    }
    stuck = Math.hypot(run.x - lx, run.y - ly) < (run.size * 0.2) / 30 ? stuck + 1 : 0;
    lx = run.x;
    ly = run.y;
    if (stuck > 20) {
      if (target >= 0) banned.set(target, run.time + 4);
      target = -1;
      stuck = 0;
      const a = turn() * Math.PI * 2;
      away = { x: Math.cos(a), y: Math.sin(a) };
      wander = 25;
    }
    if (!run.props[target]?.alive) target = -1;
    if (target < 0) {
      const options = run.props
        .filter((p) => p.alive && p.h <= run.size * 0.75 && (banned.get(p.id) ?? 0) <= run.time)
        .map((p) => ({ id: p.id, x: p.x, y: p.y, d: Math.hypot(p.x - run.x, p.y - run.y) }))
        .sort((a, b) => a.d - b.d);
      target = (options.slice(0, 12).find((o) => clearPath(run, o.x, o.y)) ?? options[0])?.id ?? -1;
    }
    const t = run.props[target];
    if (!t) return { x: 0, y: 0 };
    const d = Math.hypot(t.x - run.x, t.y - run.y) || 1;
    return { x: (t.x - run.x) / d, y: (t.y - run.y) / d };
  };
}

function play(world: World, start: number, seed?: string) {
  const run = new RampageRun(world, start, 'test');
  const steer = player(seed);
  const events = [];
  while (!run.over) events.push(...run.step(1 / 30, steer(run)));
  events.push(...run.step(1 / 30, { x: 0, y: 0 }));
  return { run, events };
}

describe('the village', () => {
  const world = buildWorld('day0');

  it('is the same for everyone on a day, and different the next', () => {
    expect(buildWorld('day0')).toEqual(world);
    expect(buildWorld('day1').props.map((p) => [p.x, p.y])).not.toEqual(
      world.props.map((p) => [p.x, p.y]),
    );
  });

  it('is full of things to smash, inside its walls, none on top of another', () => {
    expect(world.props.length).toBeGreaterThan(500);
    for (const p of world.props) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(WORLD_W);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(WORLD_H);
    }
    const stat = world.props.filter((p) => !PROPS[p.kind].mover);
    for (let i = 0; i < stat.length; i++)
      for (let j = i + 1; j < stat.length; j++) {
        const a = stat[i]!;
        const b = stat[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r);
      }
    const kinds = new Set(world.props.map((p) => p.kind));
    for (const k of ['lab', 'church', 'townhall', 'cottage', 'villager', 'pumpkin'] as const)
      expect(kinds.has(k)).toBe(true);
  });

  it('starts at the laboratory it broke out of, already rubble', () => {
    const lab = world.props.find((p) => p.kind === 'lab')!;
    expect(Math.hypot(lab.x - world.start.x, lab.y - world.start.y)).toBeLessThan(40);
    const run = new RampageRun(world, BASE_SIZE);
    expect(run.props.find((p) => p.kind === 'lab')!.alive).toBe(false);
  });
});

describe('a new venue every midnight', () => {
  it('starts with the village as it woke, then a new place lying another way round each day', () => {
    expect(venueFor(0)).toMatchObject({ turn: 0, mirror: false, gate: 'south' });
    expect(venueFor(0).stage.id).toBe('village');
    for (let d = 1; d < 60; d++) {
      const a = venueFor(d);
      const b = venueFor(d - 1);
      expect(a.stage.id === b.stage.id && a.turn === b.turn && a.mirror === b.mirror).toBe(false);
    }
    // every place comes round again (the city does not go on for ever), each a different way round
    const seen = new Set<string>();
    for (let d = 0; d < 24; d++)
      seen.add(`${venueFor(d).stage.id}:${venueFor(d).turn}:${venueFor(d).mirror}`);
    expect(seen.size).toBe(24);
    expect(new Set(Array.from({ length: 12 }, (_, d) => venueFor(d).stage.id)).size).toBe(
      STAGES.length,
    );
  });

  it('turns and mirrors a place without losing or moving anything out of it', () => {
    const world = buildWorld('turn');
    const gap = (w: World, i: number, j: number) =>
      Math.hypot(w.props[i]!.x - w.props[j]!.x, w.props[i]!.y - w.props[j]!.y);
    for (let d = 1; d < 8; d++) {
      const v = venueFor(d);
      const t = orient(world, v.turn, v.mirror);
      expect(t.props).toHaveLength(world.props.length);
      for (const p of t.props) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(WORLD_W);
        expect(p.y).toBeLessThanOrEqual(WORLD_H);
      }
      expect(gap(t, 3, 40)).toBeCloseTo(gap(world, 3, 40), 6);
    }
    const back = orient(orient(world, 1, false), 3, false);
    expect(back.props.map((p) => [p.x, p.y])).toEqual(world.props.map((p) => [p.x, p.y]));
    expect(orient(orient(world, 0, true), 0, true).start).toEqual(world.start);
    // the laboratory lies on the venue's gate side
    const west = venueWorld('gate', { stage: STAGES[0]!, turn: 1, mirror: false });
    expect(west.start.x).toBeLessThan(WORLD_W / 4);
  });
});

describe('size and smashing', () => {
  it('smashes what is small enough and grows by area', () => {
    expect(canSmash(BASE_SIZE, 'pumpkin')).toBe(true);
    expect(canSmash(BASE_SIZE, 'cottage')).toBe(false);
    expect(canSmash(BASE_SIZE * 2.2, 'cottage')).toBe(true);
    expect(sizeAfter(100, 0)).toBe(100);
    expect(sizeAfter(100, 30000 / GROWTH)).toBeCloseTo(200, 6);
  });

  it('grows for good by what the whole community smashed, never absurdly', () => {
    expect(communitySize(0)).toBe(BASE_SIZE);
    const sizes = [1e3, 1e4, 1e5, 1e6, 1e7].map(communitySize);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeGreaterThan(sizes[i - 1]!);
    expect(sizes.at(-1)!).toBeLessThan(BASE_SIZE * 3.5);
  });

  it('files each run under a rubble band the shared tally can count', () => {
    expect(rubbleBand(0)).toBe(0);
    expect(rubbleBand(249)).toBe(0);
    expect(rubbleBand(250)).toBe(1);
    expect(rubbleBand(1e9)).toBe(RUBBLE_BANDS - 1);
    for (const r of [300, 900, 2500, 7000, 40000]) {
      const v = bandValue(rubbleBand(r));
      expect(v / r).toBeGreaterThan(0.5);
      expect(v / r).toBeLessThan(2);
    }
    expect(totalFromBands([2, 1])).toBe(2 * 125 + 375);
  });

  it('names each power after the parts the village chose', () => {
    const parts = { legR: 'leg_bear', legL: 'leg_rooster', wings: 'wings_bat' };
    expect(powerParts(POWERS[0]!, parts)).toEqual(['Bear Leg', 'Chicken Leg']);
    expect(powerParts(POWERS.find((p) => p.id === 'wings')!, parts)).toEqual(['Bat Wings']);
  });
});

describe('a run', () => {
  const world = buildWorld('day0');

  it('lasts a minute, smashes a lot, grows, and wakes its parts one by one', () => {
    const { run, events } = play(world, BASE_SIZE);
    expect(run.over).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'end' });
    expect(run.smashed).toBeGreaterThan(150);
    expect(run.peak / BASE_SIZE).toBeGreaterThan(2.5);
    const woke = events.filter((e) => e.type === 'power').map((e) => e.power.id);
    expect(woke).toEqual(POWERS.map((p) => p.id).slice(0, woke.length));
    expect(woke.length).toBeGreaterThanOrEqual(5);
    expect(run.result().powers).toEqual(woke);
  });

  it('gives every place a full minute: a decent run wakes most of its parts but never flattens it', () => {
    // The middle of three tries, so one run boxed into a corner by the bot does not decide it.
    const middle = (xs: number[]) => xs.sort((a, b) => a - b)[1];
    for (const stage of STAGES) {
      const place = buildWorld('balance', stage);
      const runs = ['player', 'player:2', 'player:3'].map(
        (seed) => play(place, BASE_SIZE, seed).run,
      );
      expect(middle(runs.map((r) => r.powers.length)), stage.id).toBeGreaterThanOrEqual(4);
      expect(middle(runs.map((r) => r.smashed / place.props.length)), stage.id).toBeLessThan(0.6);
    }
  });

  it('is stopped by things too big for it, and topples them once it is big enough', () => {
    const church = world.props.find((p) => p.kind === 'church')!;
    const small = new RampageRun(world, BASE_SIZE);
    small.x = church.x;
    small.y = church.y + church.r + 40;
    const events = [];
    for (let i = 0; i < 30; i++) events.push(...small.step(1 / 30, { x: 0, y: -1 }));
    expect(events.some((e) => e.type === 'blocked' && e.prop.kind === 'church')).toBe(true);
    expect(small.props.find((p) => p.id === church.id)!.alive).toBe(true);

    const huge = new RampageRun(world, 520);
    huge.x = church.x;
    huge.y = church.y + church.r + 40;
    for (let i = 0; i < 30; i++) huge.step(1 / 30, { x: 0, y: -1 });
    expect(huge.props.find((p) => p.id === church.id)!.alive).toBe(false);
  });

  it('claws at the nearest thing it can smash on its own, arm after arm', () => {
    const run = new RampageRun(world, BASE_SIZE);
    const crate = run.props.find((p) => p.kind === 'crate')!;
    run.x = crate.x - run.reach * 1.5;
    run.y = crate.y;
    const events = [];
    for (let i = 0; i < 30; i++) events.push(...run.step(1 / 30, { x: 0, y: 0 }));
    const claws = events.filter((e) => e.type === 'attack');
    expect(claws.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'smash' && e.by === 'claw')).toBe(true);
    if (claws.length > 1) expect(claws[1]!.side).toBe(-claws[0]!.side);
  });

  it('frightens villagers into running away', () => {
    const run = new RampageRun(world, BASE_SIZE);
    const v = run.props.find((p) => p.mover)!;
    v.x = run.x + run.reach * 3;
    v.y = run.y;
    const before = Math.hypot(v.x - run.x, v.y - run.y);
    for (let i = 0; i < 15; i++) run.step(1 / 30, { x: 0, y: 0 });
    expect(Math.hypot(v.x - run.x, v.y - run.y)).toBeGreaterThan(before);
  });
});

describe('chains and bounties', () => {
  const world = buildWorld('chains');

  it('multiplies the rubble of a long chain of smashes, up to double', () => {
    expect(chainMultiplier(1)).toBe(1);
    expect(chainMultiplier(CHAIN_STEP)).toBe(1.25);
    expect(chainMultiplier(CHAIN_STEP * 2)).toBe(1.5);
    expect(chainMultiplier(10_000)).toBe(2);

    const run = new RampageRun(world, BASE_SIZE);
    const crates = run.props.filter((p) => p.kind === 'crate').slice(0, 3);
    const smashOn = (i: number) => {
      run.x = crates[i]!.x;
      run.y = crates[i]!.y;
      return run.step(1 / 30, { x: 0, y: 0 });
    };
    smashOn(0);
    expect(run.chain).toBeGreaterThanOrEqual(1);
    const before = run.chain;
    smashOn(1);
    expect(run.chain).toBeGreaterThan(before);
    // Too long without smashing anything: the chain starts again.
    run.x = 60;
    run.y = 60;
    for (let t = 0; t < CHAIN_GAP + 0.3; t += 1 / 30) run.step(1 / 30, { x: 0, y: 0 });
    const events = smashOn(2);
    // (it may smash a few things at once: the chain counts only those)
    expect(run.chain).toBe(events.filter((e) => e.type === 'smash').length);
    const smash = events.find((e) => e.type === 'smash');
    expect(smash && smash.type === 'smash' && smash.points).toBeGreaterThan(0);
    expect(run.bestChain).toBeGreaterThanOrEqual(2);
  });

  it('sets three bounties a day, the same for everyone, each possible in that place', () => {
    for (const stage of STAGES) {
      for (const day of [0, 1, 2]) {
        const seed = `s:r${day}:${stage.id}`;
        const place = buildWorld(seed, stage);
        const bounties = bountiesFor(seed, place);
        expect(bounties).toEqual(bountiesFor(seed, buildWorld(seed, stage)));
        expect(bounties).toHaveLength(3);
        expect(new Set(bounties.map((b) => b.id)).size).toBe(3);
        expect(bounties.map((b) => b.bonus)).toEqual([
          BOUNTY_BONUS.easy,
          BOUNTY_BONUS.middling,
          BOUNTY_BONUS.hard,
        ]);
        for (const b of bounties) {
          expect(b.text.length).toBeGreaterThan(5);
          if (b.prop) {
            const there = place.props.filter((p) => p.kind === b.prop).length;
            expect(there, b.id).toBeGreaterThanOrEqual(b.target);
          }
        }
      }
    }
  });

  it('ranks a run by how many times taller it grew', () => {
    expect(rankFor(100, 100)).toBe('A Stirring Thing');
    expect(rankFor(100, 200)).toBe('Terror of the Town');
    expect(rankFor(100, 900)).toBe('The End of All Things');
  });

  it('pays a bounty once per run, the moment it is done', () => {
    const one: Bounty = {
      id: 'smash:crate:2',
      kind: 'smash',
      target: 2,
      prop: 'crate',
      bonus: 150,
      text: 'Smash 2 crates',
    };
    const run = new RampageRun(world, BASE_SIZE, 'b', 60, [one]);
    const crates = run.props.filter((p) => p.kind === 'crate').slice(0, 3);
    const paid: string[] = [];
    for (const c of crates) {
      run.x = c.x;
      run.y = c.y;
      for (const e of run.step(1 / 30, { x: 0, y: 0 }))
        if (e.type === 'bounty') paid.push(e.bounty.id);
    }
    expect(paid).toEqual([one.id]);
    expect(run.result().bounties).toEqual([one.id]);
    expect(run.progress(one)).toBe(2);
  });

  it("a decent player can do most of a day's bounties, but not always all of them", () => {
    let done = 0;
    let all = 0;
    let total = 0;
    for (const stage of STAGES)
      for (const day of [0, 1]) {
        const seed = `s:r${day}:${stage.id}`;
        const place = buildWorld(seed, stage);
        const bounties = bountiesFor(seed, place);
        const run = new RampageRun(place, BASE_SIZE, 'x', 60, bounties);
        const steer = player();
        while (!run.over) run.step(1 / 30, steer(run));
        expect(run.done, `${seed}: the easy one`).toContain(bounties[0]!.id);
        done += run.done.length;
        total += bounties.length;
        if (run.done.length === bounties.length) all++;
      }
    expect(done / total).toBeGreaterThan(0.6);
    expect(all).toBeLessThan(STAGES.length * 2);
  });

  it("ticks off the day's bounties in the save, fresh each day", () => {
    let save = newSave('s', 25);
    save = recordRun(save, 5, 900, ['a', 'b']);
    save = recordRun(save, 5, 400, ['b', 'c']);
    expect(save.rampage.bounties).toEqual(['a', 'b', 'c']);
    expect(save.rampage.today).toBe(1300);
    save = recordRun(save, 6, 100, ['d']);
    expect(save.rampage.bounties).toEqual(['d']);
    const back = parseSave(JSON.stringify(save), 's', 25);
    expect(back.rampage.bounties).toEqual(['d']);
    const old = parseSave(
      JSON.stringify({ ...save, rampage: { ...save.rampage, bounties: 'x' } }),
      's',
      25,
    );
    expect(old.rampage.bounties).toEqual([]);
  });
});

describe('villagers who fight back', () => {
  const world = buildWorld('brave');

  /** A run with one brave villager placed near the creature, everyone else far away. */
  const standoff = (kind: 'villager' | 'farmer', start = BASE_SIZE) => {
    const run = new RampageRun(world, start, 'brave');
    const brave = run.props.find((p) => p.kind === kind && braveWith(p))!;
    for (const p of run.props) if (p.mover && p !== brave) p.alive = false;
    brave.x = run.x + run.reach * 4;
    brave.y = run.y;
    return { run, brave };
  };

  it('arm every third villager with a torch and every other farmer with a pitchfork', () => {
    expect(braveWith({ kind: 'villager', id: 9 })).toBe('torch');
    expect(braveWith({ kind: 'villager', id: 10 })).toBeNull();
    expect(braveWith({ kind: 'farmer', id: 4 })).toBe('pitchfork');
    expect(braveWith({ kind: 'chicken', id: 6 })).toBeNull();
  });

  it('stand their ground against a creature their size and throw: a hit knocks off mass and staggers it', () => {
    const { run } = standoff('villager');
    run.beast.feed(20_000);
    const before = run.beast.mass;
    const events = [];
    for (let i = 0; i < 30 * 5; i++) events.push(...run.step(1 / 30, { x: 0, y: 0 }));
    expect(events.some((e) => e.type === 'throw')).toBe(true);
    const hit = events.find((e) => e.type === 'hit');
    expect(hit && hit.type === 'hit' && hit.lost).toBeGreaterThanOrEqual(
      Math.min(300, before * HIT_SHARE),
    );
    expect(run.beast.mass).toBeLessThan(before);
  });

  it('can be dodged: a creature that keeps moving is not where the torch lands', () => {
    const { run } = standoff('villager');
    const events = [];
    let dir = 1;
    for (let i = 0; i < 30 * 5; i++) {
      if (i % 20 === 0) dir = -dir;
      events.push(...run.step(1 / 30, { x: 0, y: dir }));
    }
    const throws = events.filter((e) => e.type === 'throw').length;
    const hits = events.filter((e) => e.type === 'hit').length;
    expect(throws).toBeGreaterThan(0);
    expect(hits).toBeLessThan(throws);
  });

  it('run like everyone else from a creature far too big for them', () => {
    const { run, brave } = standoff('farmer', BASE_SIZE * 4);
    brave.x = run.x + run.reach * 3;
    const events = [];
    for (let i = 0; i < 30; i++) events.push(...run.step(1 / 30, { x: 0, y: 0 }));
    expect(events.some((e) => e.type === 'throw')).toBe(false);
    expect(brave.x - run.x).toBeGreaterThan(run.reach * 3);
  });
});

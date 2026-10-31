import { describe, expect, it } from 'vitest';
import { BASE_SIZE, RUN_SECONDS } from './rampage';
import { buyUpgrade, newSave, parseSave, recordRun } from './state';
import { UPGRADES, cost, storyRun } from './upgrades';

describe('story upgrades', () => {
  it('cost more every level, up to a cap', () => {
    for (const u of UPGRADES) {
      expect(cost(u, 1)).toBeGreaterThan(cost(u, 0));
      expect(cost(u, u.max)).toBe(Infinity);
    }
  });

  it('are paid for with the rubble runs earn, and change the next run', () => {
    let save = newSave('s', 25);
    save = recordRun(save, 5, 1000);
    expect(save.rampage.purse).toBe(1000);
    const value = UPGRADES.find((u) => u.id === 'value')!;
    save = buyUpgrade(save, 'value');
    expect(save.rampage.levels.value).toBe(1);
    expect(save.rampage.purse).toBe(1000 - cost(value, 0));
    // Not enough left for the next level: nothing changes.
    expect(buyUpgrade(save, 'value')).toBe(save);
    const run = storyRun({ value: 3, claws: 2, stride: 1, birth: 2, time: 1 });
    expect(run.boost.value).toBeCloseTo(3.375);
    expect(run.boost.claw).toBeCloseTo(1.2);
    expect(run.boost.speed).toBeCloseTo(1.06);
    expect(run.start).toBe(Math.round(BASE_SIZE * 1.1));
    expect(run.seconds).toBe(RUN_SECONDS + 5);
    expect(storyRun({}).boost).toEqual({ value: 1, claw: 1, speed: 1 });
    // Kept in the save; nonsense is dropped.
    const back = parseSave(JSON.stringify(save), 's', 25);
    expect(back.rampage.levels).toEqual({ value: 1 });
    const bad = parseSave(
      JSON.stringify({
        ...save,
        rampage: { ...save.rampage, purse: -5, levels: { value: 999, x: 2 } },
      }),
      's',
      25,
    );
    expect(bad.rampage.purse).toBe(0);
    expect(bad.rampage.levels).toEqual({ value: value.max });
  });

  it('let the numbers run into the billions', () => {
    const maxed = storyRun({ value: UPGRADES[0]!.max });
    expect(maxed.boost.value).toBeGreaterThan(1e6);
  });
});

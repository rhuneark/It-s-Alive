import { describe, expect, it } from 'vitest';
import {
  BOARD_MODES,
  REWARD_BASE,
  boardInstances,
  boardMode,
  rewardFor,
  rewardWaiting,
  streakToday,
  topOf,
} from './daily';
import { DAY_MS, SEASON } from './schedule';
import { claimDaily, newSave, parseSave } from './state';

describe("the day's board", () => {
  it('gives every game day a board of its own, even across the ends of months', () => {
    const used = new Map<string, number>();
    for (let d = 0; d < 800; d++) {
      const start = SEASON.startMs + d * DAY_MS;
      const mode = boardMode(start);
      expect(BOARD_MODES).toContain(mode);
      for (const t of boardInstances(start)) {
        const at = new Date(t);
        const key = `${mode}@${at.getUTCFullYear()}-${at.getUTCMonth()}`;
        // a mode's monthly instance holds one game day only
        expect(used.get(key) ?? d, key).toBe(d);
        used.set(key, d);
      }
    }
    expect(new Set(BOARD_MODES).size).toBe(62);
    // Halloween (it starts 05:00 UTC on Oct 31), and its small hours run into November
    const halloween = Date.UTC(2026, 9, 31, 5);
    expect(boardMode(halloween)).toBe('m31b');
    expect(boardInstances(halloween)).toHaveLength(2);
    expect(boardInstances(halloween + DAY_MS)).toHaveLength(1);
  });

  it('shows each player once, at their best, biggest first', () => {
    const top = topOf([
      [
        { id: 'a', name: 'Ann', score: 50 },
        { id: 'b', name: 'Bo', score: 900 },
      ],
      [
        { id: 'a', name: 'Ann', score: 700 },
        { id: 'c', name: 'Cy', score: 10 },
        { id: 'd', name: 'Di', score: 300 },
      ],
    ]);
    expect(top.map((e) => [e.id, e.score])).toEqual([
      ['b', 900],
      ['a', 700],
      ['d', 300],
    ]);
  });
});

describe('daily rewards', () => {
  it('wait once a day, and grow with a streak of days in a row', () => {
    expect(rewardWaiting({ day: -1, streak: 0 }, 20)).toBe(true);
    expect(rewardWaiting({ day: 20, streak: 3 }, 20)).toBe(false);
    expect(streakToday({ day: 19, streak: 3 }, 20)).toBe(4);
    expect(streakToday({ day: 17, streak: 3 }, 20)).toBe(1);
    expect(rewardFor(1, 0)).toBe(REWARD_BASE[0]);
    expect(rewardFor(7, 0)).toBeGreaterThan(rewardFor(6, 0));
    // the track goes round again after a week
    expect(rewardFor(8, 0)).toBe(rewardFor(1, 0));
    // and keeps up with a strong player's best run
    expect(rewardFor(7, 1_000_000)).toBe(1_500_000);
  });

  it('pay into the purse once a day, keep the streak, and survive a reload', () => {
    let save = newSave('s', 20);
    save = claimDaily(save, 20);
    expect(save.rampage.purse).toBe(REWARD_BASE[0]);
    expect(claimDaily(save, 20)).toBe(save);
    save = claimDaily(save, 21);
    expect(save.daily).toEqual({ day: 21, streak: 2 });
    expect(save.rampage.purse).toBe(REWARD_BASE[0] + REWARD_BASE[1]);
    // skipping a day starts the streak over
    save = claimDaily(save, 23);
    expect(save.daily.streak).toBe(1);
    expect(parseSave(JSON.stringify(save), 's', 23).daily).toEqual({ day: 23, streak: 1 });
  });
});

describe('the leaderboard config', () => {
  it('has a board for every game day, on a monthly period, with room for big numbers', async () => {
    const { readFileSync } = await import('node:fs');
    const cfg = JSON.parse(readFileSync('rundot/leaderboard.config.json', 'utf8')) as {
      modes: Record<string, unknown>;
      periods: Record<string, { type: string }>;
      maxScore: number;
    };
    expect(Object.keys(cfg.modes).sort()).toEqual([...BOARD_MODES].sort());
    expect(Object.values(cfg.periods).map((p) => p.type)).toEqual(['monthly']);
    expect(cfg.maxScore).toBe(Number.MAX_SAFE_INTEGER);
  });
});

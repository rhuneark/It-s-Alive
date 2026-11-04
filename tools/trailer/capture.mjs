// Trailer footage: records scenes of the dev build (npm run dev on :5173) at 1080x1920.
//
// Every frame is saved with its GAME time; assemble.py turns them into smooth 30 fps clips. The
// creature is the community's real one (?winners=live, mock only). Chromium screencasts only
// ~15 fps at 1080x1920, so either slow the page's clock (SLOW: its timers, requestAnimationFrame,
// Date and CSS / Web Animations run at SLOW of real time; fine for the waking scene and the home,
// but a run goes white under it) or record at 720x1280 in real time (DSF=1.6667 SLOW=1: ~40 fps;
// the run's canvas is phone-sized anyway). The trailer of Nov 4 2026 used:
//   node tools/trailer/capture.mjs awaken <dir>/awaken
//   node tools/trailer/capture.mjs home <dir>/home
//   DSF=1.6667 SLOW=1 node tools/trailer/capture.mjs rampage <dir>/rampage
//   DSF=1.6667 SLOW=1 node tools/trailer/capture.mjs battle <dir>/battle      (live, in the dev room server)
// then assemble.py clip for each, cards.mjs, and edit.py.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const SLOW = Number(process.env.SLOW ?? 0.35);
const BASE = 'http://127.0.0.1:5173/';
const [scene, out] = process.argv.slice(2);
if (!scene || !out) throw new Error('usage: capture.mjs <scene> <out dir>');
mkdirSync(out, { recursive: true });

const executablePath = ['/opt/pw-browsers/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: [
    `--force-device-scale-factor=${process.env.DSF ?? 2.5}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage({ viewport: { width: 432, height: 768 } });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.addInitScript((S) => {
  // Game time runs at S of real time.
  const pn = performance.now.bind(performance);
  const base = pn();
  const slow = (t) => base + (t - base) * S;
  performance.now = () => slow(pn());
  const RealDate = Date;
  const d0 = RealDate.now();
  const now = () => d0 + (RealDate.now() - d0) * S;
  // eslint-disable-next-line no-global-assign
  Date = class extends RealDate {
    constructor(...a) {
      if (a.length) super(...a);
      else super(now());
    }
    static now() {
      return now();
    }
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((ts) => cb(slow(ts)));
  const st = window.setTimeout.bind(window);
  const si = window.setInterval.bind(window);
  window.setTimeout = (fn, ms = 0, ...a) => st(fn, ms / S, ...a);
  window.setInterval = (fn, ms = 0, ...a) => si(fn, ms / S, ...a);
}, SLOW);

const cdp = await page.context().newCDPSession(page);
const slowCss = async () => {
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: SLOW });
};
/** Wait this long in game time. */
const wait = (ms) => page.waitForTimeout(ms / SLOW);
const go = async (query) => {
  await page.goto(BASE + query);
  await slowCss();
};

// ------------------------------------------------------------------ recording
const frames = [];
let recording = false;
let t0 = 0;
let n = 0;
cdp.on('Page.screencastFrame', async (f) => {
  if (recording) {
    if (!t0) t0 = f.metadata.timestamp;
    const name = `${String(n++).padStart(5, '0')}.jpg`;
    writeFileSync(`${out}/${name}`, Buffer.from(f.data, 'base64'));
    frames.push({ file: name, t: (f.metadata.timestamp - t0) * SLOW });
  }
  await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
const marks = [];
const mark = (label) => {
  marks.push({ label, t: frames.length ? frames[frames.length - 1].t : 0 });
  console.log('mark', label, marks.at(-1).t.toFixed(2));
};
const record = async () => {
  recording = true;
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: 1080,
    maxHeight: 1920,
    everyNthFrame: 1,
  });
};
const stop = async () => {
  await cdp.send('Page.stopScreencast');
  recording = false;
  writeFileSync(`${out}/index.json`, JSON.stringify({ scene, slow: SLOW, frames, marks }, null, 1));
  console.log(scene, 'frames', frames.length, 'game seconds', frames.at(-1)?.t.toFixed(1));
};

/** Arrive home: skip the waking scene if it shows, let the breakout play, take the daily reward. */
const home = async (query) => {
  await go(query);
  await page
    .getByTestId('awaken-skip')
    .click({ timeout: 30_000 })
    .catch(() => {});
  await page.getByTestId('daily-claim').click({ timeout: 30_000 / SLOW });
  await wait(800);
};

/**
 * A decent player (as in rampage.test.ts): head for the nearest thing it can smash with nothing too
 * big in the way, give up on one it is stuck behind and wander off a moment.
 */
const steerRampage = () =>
  page.evaluate(() => {
    let target = -1;
    let away = null;
    let awayUntil = 0;
    let lx = 0;
    let ly = 0;
    let lastCheck = 0;
    const banned = new Map();
    const clear = (r, x, y) => {
      const dx = x - r.x;
      const dy = y - r.y;
      const len2 = dx * dx + dy * dy || 1;
      const body = r.reach * 0.6;
      for (const p of r.props) {
        if (!p.alive || p.mover || p.h <= r.size * 0.75) continue;
        const t = Math.max(0, Math.min(1, ((p.x - r.x) * dx + (p.y - r.y) * dy) / len2));
        if (Math.hypot(r.x + dx * t - p.x, r.y + dy * t - p.y) < p.r + body) return false;
      }
      return true;
    };
    setInterval(() => {
      const r = window.__rampage;
      if (!r) return;
      const now = performance.now();
      if (away && now < awayUntil) {
        window.__steer = away;
        return;
      }
      away = null;
      if (now - lastCheck > 600) {
        if (lastCheck && Math.hypot(r.x - lx, r.y - ly) < r.size * 0.25) {
          if (target >= 0) banned.set(target, now + 4000);
          target = -1;
          const a = Math.random() * Math.PI * 2;
          away = { x: Math.cos(a), y: Math.sin(a) };
          awayUntil = now + 700;
        }
        lx = r.x;
        ly = r.y;
        lastCheck = now;
      }
      const cur = r.props[target];
      if (!cur || !cur.alive) target = -1;
      if (target < 0) {
        const options = r.props
          .filter((p) => p.alive && p.h <= r.size * 0.75 && (banned.get(p.id) ?? 0) <= now)
          .map((p) => ({ id: p.id, x: p.x, y: p.y, d: Math.hypot(p.x - r.x, p.y - r.y) }))
          .sort((a, b) => a.d - b.d);
        target = (options.slice(0, 12).find((o) => clear(r, o.x, o.y)) ?? options[0])?.id ?? -1;
      }
      const t = r.props[target];
      if (!t) return;
      const d = Math.hypot(t.x - r.x, t.y - r.y) || 1;
      window.__steer = { x: (t.x - r.x) / d, y: (t.y - r.y) / d };
    }, 60);
  });

const steerBattle = () =>
  page.evaluate(() => {
    setInterval(() => {
      const b = window.__battle;
      const me = b?.me;
      if (!me) return;
      let best = 1e9;
      let to = null;
      for (const p of b.pickups ?? [])
        if (p.alive) {
          const d = Math.hypot(p.x - me.x, p.y - me.y);
          if (d < best * 0.6) {
            best = d;
            to = p;
          }
        }
      for (const p of b.props)
        if (p.alive && p.h <= me.size * 0.75) {
          const d = Math.hypot(p.x - me.x, p.y - me.y);
          if (d < best) {
            best = d;
            to = p;
          }
        }
      if (!to) return;
      const d = Math.hypot(to.x - me.x, to.y - me.y) || 1;
      window.__steer = { x: (to.x - me.x) / d, y: (to.y - me.y) / d };
    }, 120);
  });

// ------------------------------------------------------------------ scenes
if (scene === 'awaken') {
  // Halloween: the waking, then it breaks out into the village.
  await go('?day=20&winners=live');
  const witness = page.getByTestId('awaken-start');
  await witness.waitFor({ timeout: 30_000 });
  await wait(1500);
  await record();
  await wait(400);
  mark('witness');
  await witness.click();
  await page.getByTestId('awaken-done').waitFor({ timeout: 20_000 / SLOW });
  mark('alive');
  await wait(1500);
  await page.getByTestId('awaken-done').click();
  mark('home');
  await wait(7000);
  await stop();
} else if (scene === 'home') {
  // A first visit after Halloween: it breaks out over the village, the daily reward, then home.
  await go('?day=21&winners=live');
  await page.getByTestId('awaken-skip').click({ timeout: 30_000 });
  await record();
  mark('breakout');
  await page.getByTestId('daily-reward').waitFor({ timeout: 30_000 / SLOW });
  mark('reward');
  await wait(2500);
  await page.getByTestId('daily-claim').click();
  mark('home');
  await wait(6000);
  mark('sheet');
  await page.getByTestId('awaken-open').click();
  await wait(2500);
  await stop();
} else if (scene === 'rampage') {
  await home('?day=22&winners=live');
  await page.getByTestId('awaken-open').click();
  await page.getByTestId('mode-story').click();
  await wait(600);
  await record();
  await page.getByTestId('rampage-start').click();
  mark('start');
  await page.waitForFunction(
    () => document.querySelector('[data-testid=rampage]')?.getAttribute('data-phase') === 'play',
    null,
    { timeout: 60_000 / SLOW },
  );
  mark('play');
  await steerRampage();
  await page.getByTestId('rampage-over').waitFor({ timeout: 200_000 / SLOW });
  mark('over');
  await wait(2500);
  await stop();
} else if (scene === 'battle') {
  // A live battle in the dev build's own room server (the empty seats are bots).
  await home('?day=21&winners=live');
  await page.getByTestId('awaken-open').click();
  await record();
  await page.getByTestId('mode-battle').click();
  mark('start');
  await page.waitForFunction(
    () => document.querySelector('[data-testid=battle]')?.getAttribute('data-status') === 'battle',
    null,
    { timeout: 60_000 },
  );
  mark('fight');
  await steerBattle();
  await wait(45_000);
  await stop();
} else throw new Error(`unknown scene ${scene}`);

await browser.close();

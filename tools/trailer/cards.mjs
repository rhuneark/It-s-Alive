// Trailer captions: transparent 1080x1920 PNGs in the game's pixel type (Pixelify Sans), drawn by
// the browser, for edit.sh to lay over the footage.
//
//   node tools/trailer/cards.mjs <out dir>
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

const out = process.argv[2];
mkdirSync(out, { recursive: true });

const CSS = `
  html, body { margin: 0; width: 432px; height: 768px; background: transparent; overflow: hidden; }
  body { font-family: 'Pixelify Sans', sans-serif; color: #fff4ea; display: flex; flex-direction: column;
         align-items: center; text-align: center; }
  .black { background: #050307; }
  .big { font-weight: 700; font-size: 58px; line-height: 1; letter-spacing: 1px;
         text-shadow: 4px 4px 0 #000, 0 0 22px rgba(255, 40, 40, 0.75); }
  .mid { font-weight: 700; font-size: 30px; line-height: 1.1;
         text-shadow: 3px 3px 0 #000, 0 0 14px rgba(255, 40, 40, 0.6); }
  .small { font-family: 'Rubik', sans-serif; font-weight: 600; font-size: 19px; line-height: 1.35; color: #e6d6c8;
           text-shadow: 2px 2px 0 #000; }
  .gold { color: #ffd24a; }
  .red { color: #ff5a4a; }
  .band { position: absolute; left: 0; right: 0; bottom: 0; height: 250px;
          background: linear-gradient(180deg, rgba(5,3,7,0), rgba(5,3,7,0.88) 38%, rgba(5,3,7,0.95));
          display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 8px;
          padding-top: 60px; box-sizing: border-box; }
  .stamp { position: absolute; left: 0; right: 0; bottom: 0; height: 64px; display: flex;
           align-items: center; justify-content: center;
           background: linear-gradient(180deg, rgba(5,3,7,0), rgba(5,3,7,0.92) 35%, rgba(5,3,7,1)); }
  .top { position: absolute; left: 0; right: 0; top: 0; height: 330px;
         background: linear-gradient(180deg, rgba(5,3,7,0.92), rgba(5,3,7,0.7) 60%, rgba(5,3,7,0));
         display: flex; flex-direction: column; align-items: center; gap: 10px; padding-top: 70px;
         box-sizing: border-box; }
`;

const CARDS = {
  open: `<body class="black" style="justify-content:center;gap:22px">
      <div class="big">19 NIGHTS.</div>
      <div class="mid">ONE MONSTER.</div>
      <div class="small" style="max-width:330px">Every night, everyone voted on one body part.</div>
    </body>`,
  smash: `<div class="band"><div class="mid">SMASH THE VILLAGE</div><div class="small">Grow with every house you flatten</div></div>`,
  wake: `<div class="band"><div class="mid">WAKE EVERY PART</div><div class="small">Each one a new power</div></div>`,
  topple: `<div class="band"><div class="mid">TOPPLE THE TOWN</div><div class="small">A new place every night</div></div>`,
  battle: `<div class="band"><div class="mid">LIVE BATTLES</div><div class="small">8 monsters · 60 seconds · biggest wins</div></div>`,
  devour: `<div class="band"><div class="mid red">DEVOUR OR BE DEVOURED</div></div>`,
  end: `<div class="top" style="height:200px;padding-top:34px;gap:8px">
      <div class="big" style="font-size:58px">IT'S ALIVE!</div>
      <div class="small gold" style="font-size:19px">A new place every night · Top 3 every day</div>
    </div>
    <div class="stamp"><div class="mid" style="font-size:24px">PLAY FREE ON RUN.WORLD</div></div>`,
  stamp: `<div class="stamp"></div>`,
};

const executablePath = ['/opt/pw-browsers/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({
  viewport: { width: 432, height: 768 },
  deviceScaleFactor: 2.5,
});
for (const [name, body] of Object.entries(CARDS)) {
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400..700&family=Rubik:wght@500;600&display=block" rel="stylesheet">
    <style>${CSS}</style></head>${body.startsWith('<body') ? body : `<body>${body}</body>`}</html>`;
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${out}/${name}.png`, omitBackground: true });
  console.log(name);
}
await browser.close();

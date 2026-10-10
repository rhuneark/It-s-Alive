// node tools/thumbnail/render.mjs  (needs the dev server on :5173)
import { chromium } from '@playwright/test';
import { statSync } from 'node:fs';

const out = new URL('../../public/thumbnail.jpg', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:5173/tools/thumbnail/index.html');
await page.waitForTimeout(2500);
await page.screenshot({ path: out, type: 'jpeg', quality: 86 });
await browser.close();
console.log(out, `${(statSync(out).size / 1024).toFixed(1)} KB`);

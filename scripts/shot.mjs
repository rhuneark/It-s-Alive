// Dev helper: screenshot the running dev server.
// node scripts/shot.mjs <url-query> <out.png> [width] [height] [clickTestId...]
import { chromium } from '@playwright/test';

const [query = '', out = 'shot.png', w = '390', h = '844', ...clicks] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
  deviceScaleFactor: 2,
});
page.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text()));
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(`http://127.0.0.1:5173/${query}`);
await page.waitForTimeout(2500);
for (const c of clicks) {
  await page
    .locator(c.startsWith('[') || c.startsWith('.') ? c : `[data-testid="${c}"]`)
    .first()
    .click();
  await page.waitForTimeout(1200);
}
await page.screenshot({ path: out, fullPage: process.env.FULL === '1' });
await browser.close();
console.log('saved', out);

import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.SHOTS_DIR;

async function noSidewaysScroll(page: Page) {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(scroll, 'page must not scroll sideways').toBeLessThanOrEqual(width);
}

/** Every picture on screen (monster layers, option art) actually loaded. */
async function imagesLoaded(page: Page) {
  await expect
    .poll(() =>
      page.$$eval('img', (els) =>
        els.filter((e) => !e.complete || e.naturalWidth === 0).map((e) => e.getAttribute('src')),
      ),
    )
    .toEqual([]);
}

async function framedButtons(page: Page) {
  // Measure at rest: a sheet still sliding in reports squashed buttons. (Endless effects run on.)
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) => a.effect?.getComputedTiming().endTime === Infinity || a.playState !== 'running',
      ),
  );
  const issues = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.btn')]
      .filter((b) => b.offsetParent !== null)
      .flatMap((b) => {
        const cs = getComputedStyle(b);
        const problems: string[] = [];
        if (parseFloat(cs.borderTopWidth) < 2) problems.push(`${b.textContent} has no frame`);
        if (parseFloat(cs.fontSize) < 14) problems.push(`${b.textContent} text too small`);
        if (b.getBoundingClientRect().height < 44)
          problems.push(`${b.textContent} too short to tap`);
        return problems;
      }),
  );
  expect(issues).toEqual([]);
}

async function percentagesSumTo100(page: Page) {
  await expect(page.locator('.result')).toHaveCount(5);
  const pcts = await page.locator('.result-pct').allTextContents();
  expect(pcts).toHaveLength(5);
  expect(pcts.reduce((a, t) => a + parseInt(t, 10), 0)).toBe(100);
}

async function openDay(page: Page, day: number, { reveal = 'skip' } = {}) {
  await page.goto(`/?day=${day}`);
  await page.getByTestId('start').click();
  if (reveal !== 'skip') return;
  // A returning player first sees the latest stitching; get it out of the way.
  const close = page.getByTestId('reveal-close');
  await close.waitFor({ state: 'visible', timeout: 2500 }).then(
    () => close.click(),
    () => {},
  );
}

async function voteFor(page: Page, nth: number) {
  const option = page.locator('.option').nth(nth);
  const name = (await option.locator('.option-name').textContent())!.trim();
  await option.click();
  await expect(page.locator('.option.selected')).toHaveCount(1);
  await expect(page.locator('.part.previewing, .monster.aura').first()).toBeVisible();
  await expect(page.getByTestId('cast')).toHaveText(`Vote: ${name}`);
  await page.getByTestId('cast').click();
  return name;
}

test('a whole season: vote every night, extra vote via ad, continue, awaken on Halloween', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name: string) => {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${info.project.name}-${name}.png` });
  };

  // Night 1: the head. The theme preloads on the title screen.
  const theme = page.waitForResponse((r) => r.url().includes('theme.mp3') && r.ok());
  await page.goto('/?day=0');
  await expect(page.getByTestId('start')).toHaveText('Enter the Laboratory');
  // A quiet title: enter, the Sketchbook and the music, nothing else.
  await expect(page.locator('.title-screen button:visible')).toHaveCount(3);
  await expect(page.getByTestId('sketch-open')).toBeVisible();
  await expect(page.getByTestId('title-music-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('title-music-volume')).toBeEnabled();
  await noSidewaysScroll(page);
  await framedButtons(page);
  await shot('title');
  await page.getByTestId('start').click();
  await theme;
  await expect(page.locator('.prompt')).toHaveText('Whose HEAD shall crown our creation?');
  await expect(page.locator('.option')).toHaveCount(5);
  await expect(page.locator('.result')).toHaveCount(0); // no peeking before voting
  await expect(page.getByTestId('cast')).toBeDisabled();
  await noSidewaysScroll(page);
  await framedButtons(page);
  await shot('vote');

  const first = await voteFor(page, 1);
  await expect(page.locator('.result')).toHaveCount(5);
  await percentagesSumTo100(page);
  await expect(page.locator('.result.mine .result-name')).toHaveText(first);
  // The hook for tomorrow: what gets stitched at midnight and what comes next.
  await expect(page.getByTestId('tomorrow')).toContainText('which head is stitched on');
  await expect(page.getByTestId('tomorrow')).toContainText('torso');
  await noSidewaysScroll(page);
  await shot('results');

  // One free vote; each rewarded ad unlocks one more, twice a night.
  for (const n of [2, 3]) {
    await expect(page.locator('.option')).toHaveCount(0);
    await page.getByTestId('ad-vote').click();
    await page.getByRole('button', { name: 'Close Ad' }).click();
    await expect(page.locator('.notice')).toBeVisible();
    await voteFor(page, 1);
    await expect(page.locator('.result.mine .chip').last()).toHaveText(`Your vote ×${n}`);
  }
  await expect(page.getByTestId('ad-vote')).toHaveCount(0);
  await expect(page.getByText("You've cast all 3 of tonight's votes")).toBeVisible();

  // Sound panel: music toggle and volume slider, both remembered.
  await page.getByTestId('music').click();
  const toggle = page.getByTestId('music-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('music-volume').fill('20');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('music-volume')).toBeDisabled();
  await page.locator('.sound-scrim').click();
  await expect(page.locator('.sound-panel')).toHaveCount(0);
  await page.waitForTimeout(900); // let the debounced save land

  // Continue where we left off.
  await page.reload();
  await expect(page.getByTestId('start')).toHaveText('Continue');
  await expect(page.getByTestId('tonight')).toContainText('Tonight: the Head');
  await expect(page.getByTestId('tonight')).toContainText(`You voted: ${first}`);
  await page.getByTestId('start').click();
  await expect(page.locator('.result')).toHaveCount(5);
  await expect(page.locator('.result.mine .chip').last()).toHaveText('Your vote ×3');
  await page.getByTestId('music').click();
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('music-volume')).toHaveValue('20');
  await page.getByTestId('music-toggle').click();
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.sound-scrim').click();

  // Nights 2..19: a new part painted in every night (husk regions give way to parts).
  let lastParts = await page
    .locator('.monster:not(.monster-mini) .part[data-layer^="parts/"]')
    .count();
  for (let day = 1; day <= 18; day++) {
    await openDay(page, day, { reveal: 'check' });
    // Back after midnight: the stitching is revealed first, with how my pick fared.
    const reveal = page.getByTestId('reveal');
    await expect(reveal).toBeVisible();
    await expect(reveal).toContainText(`Night ${day} ·`);
    await expect(reveal).toContainText('The village chose');
    await expect(page.getByTestId('reveal-mine')).toContainText(/won|came \d|did not vote/);
    if (day === 1) {
      await expect(page.locator('.reveal .part.fresh')).toHaveCount(1);
      await noSidewaysScroll(page);
      await framedButtons(page);
      await shot('reveal');
    }
    await page.getByTestId('reveal-close').click();
    await expect(reveal).toHaveCount(0);
    await expect(page.locator('.dayline')).toHaveText(`Night ${day + 1} of 19`);
    await expect(page.locator('.option')).toHaveCount(5);
    await expect(page.locator('.result')).toHaveCount(0);
    await expect
      .poll(() => page.locator('.monster:not(.monster-mini) .part[data-layer^="parts/"]').count())
      .toBeGreaterThan(lastParts);
    lastParts = await page
      .locator('.monster:not(.monster-mini) .part[data-layer^="parts/"]')
      .count();
    await imagesLoaded(page);
    await voteFor(page, day % 5);
    await percentagesSumTo100(page);
    await noSidewaysScroll(page);
    if (day === 10) await shot('midseason');
  }
  await expect(page.locator('.prompt')).toHaveText("What SPARK shall wake it on All Hallows' Eve?");

  // Chronicle lists every resolved night.
  await page.getByTestId('chronicle').click();
  await expect(page.locator('.chron-done')).toHaveCount(18);
  await expect(page.locator('.chron-now')).toHaveCount(1);
  await shot('chronicle');
  await page.getByRole('button', { name: 'Close chronicle' }).click();

  // The vigil (Oct 30): every part is chosen, nothing to vote on, it waits for midnight.
  await openDay(page, 19);
  await expect(page.locator('.dayline')).toHaveText('The vigil');
  await expect(page.getByTestId('vigil')).toBeVisible();
  await expect(page.locator('.option')).toHaveCount(0);
  await expect(page.locator('.countdown')).toContainText('It wakes in');
  await expect(page.locator('.monster.alive')).toHaveCount(0);
  // the spark chosen on the last night is an effect, not a layer: its aura now plays
  await expect(page.locator('.monster:not(.monster-mini).aura')).toBeVisible();
  await expect(page.locator('.monster:not(.monster-mini) .part[data-layer^="parts/"]')).toHaveCount(
    lastParts,
  );
  await imagesLoaded(page);
  await noSidewaysScroll(page);
  await framedButtons(page);
  await shot('vigil');
  await page.getByTestId('chronicle').click();
  await expect(page.locator('.chron-done')).toHaveCount(19);
  await expect(page.locator('.chron-now')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close chronicle' }).click();

  // Halloween: it wakes.
  await openDay(page, 20);
  await expect(page.locator('.logo-alive')).toHaveText("IT'S ALIVE!");
  await expect(page.locator('.monster.alive')).toBeVisible();
  await imagesLoaded(page);
  await noSidewaysScroll(page);
  await shot('alive');
  await page.getByRole('button', { name: 'Chronicle' }).click();
  await expect(page.locator('.chron-done')).toHaveCount(19);

  expect(errors).toEqual([]);
});

test('every night of the season fits the phone without sideways scrolling', async ({ page }) => {
  for (const day of [0, 4, 9, 13, 16, 18]) {
    await openDay(page, day);
    await expect(page.locator('.option')).toHaveCount(5);
    await page.locator('.option').first().click();
    await noSidewaysScroll(page);
    await framedButtons(page);
  }
});

test('hidden diagnostics: tapping the build stamp 5 times shows device info', async ({ page }) => {
  await page.goto('/?day=2');
  await page.getByTestId('start').click();
  await expect(page.locator('.dayline')).toBeVisible();
  for (let i = 0; i < 5; i++) await page.getByTestId('build-stamp').click();
  const diag = page.getByTestId('diagnostics');
  await expect(diag).toContainText('Build');
  await expect(diag).toContainText('Signed in');
  await expect(diag).toContainText('Music file');
  await expect(diag).toContainText(/playing|paused/);
  await expect(diag).not.toContainText('Test Lab');
});

test('Sketchbook: try any parts, keep the design, and rebuild the monster from my votes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Night 5 is the third eye, which grows on the night-1 head.
  await openDay(page, 4);
  await page.getByTestId('sketch-open').click();
  const book = page.getByTestId('sketchbook');
  const painted = book.locator('.part[data-layer^="parts/"]');
  const layer = (key: string) => book.locator(`.part[data-layer="parts/${key}"]`);
  await expect(book).toContainText('Nothing here is a vote');
  await expect(page.getByTestId('sketch-mine')).toBeDisabled(); // no votes yet
  await noSidewaysScroll(page);
  await framedButtons(page);

  // From a bare husk: a head, horns painted onto that head, then a different head.
  await page.getByTestId('sketch-clear').click();
  await expect(painted).toHaveCount(0);
  await book.locator('[data-sketch-part="horns"]').click();
  await expect(book).toContainText('Choose a head first');
  await book.locator('[data-sketch-part="head"]').click();
  await book.locator('[data-sketch-option="head_raven"]').click();
  await expect(layer('head_raven')).toHaveCount(1);
  await book.locator('[data-sketch-part="horns"]').click();
  await book.locator('[data-sketch-option="horns_ram"]').click();
  await expect(layer('horns_ram@head_raven')).toHaveCount(1);
  await book.locator('[data-sketch-part="head"]').click();
  await book.locator('[data-sketch-option="head_croc"]').click();
  await expect(layer('horns_ram@head_croc')).toHaveCount(1);
  await expect(book).toContainText('2 of 19 parts');
  await imagesLoaded(page);

  // Random fills every part; nothing was voted.
  await page.getByTestId('sketch-random').click();
  await expect(book).toContainText('19 of 19 parts');
  await imagesLoaded(page);
  await noSidewaysScroll(page);
  await book.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.result')).toHaveCount(0);
  await page.waitForTimeout(900); // let the debounced save land

  // The design is kept.
  await page.reload();
  await page.getByTestId('start').click();
  await page.getByTestId('sketch-open').click();
  await expect(book).toContainText('19 of 19 parts');
  await book.getByRole('button', { name: 'Close' }).click();

  // After voting, "My votes" shows my pick on the real monster's head.
  const pick = await page.locator('.option').nth(3).getAttribute('data-option');
  await voteFor(page, 3);
  await page.getByTestId('sketch-open').click();
  await page.getByTestId('sketch-mine').click();
  await expect(book.locator(`.part[data-layer^="parts/${pick}@head_"]`)).toHaveCount(1);
  await expect(book).toContainText('5 of 19 parts');
  await imagesLoaded(page);
  expect(errors).toEqual([]);
});

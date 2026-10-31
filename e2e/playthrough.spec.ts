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

  // October Jam: RUN's sandbox blocks new tabs, so the glowing button copies the vote link.
  const JAM = 'https://run.world/jams/octoberjam?game=GORVjkIRThUz5n2tmAms';
  const jam = page.getByTestId('jam-vote');
  await expect(jam).toHaveAttribute('href', JAM);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  let tabs = 0;
  page.on('popup', () => tabs++);
  await jam.click();
  await expect(page.locator('.toast')).toContainText('Link copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(JAM);
  expect(tabs).toBe(0);
  await expect(page.getByTestId('start')).toBeVisible(); // still on the title screen
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 6000 });

  await page.getByTestId('start').click();
  await theme;
  await expect(page.locator('.prompt')).toHaveText('Whose HEAD shall crown our creation?');
  await expect(page.locator('.option')).toHaveCount(5);
  await expect(page.locator('.result')).toHaveCount(0); // no peeking before voting
  await expect(page.getByTestId('cast')).toBeDisabled();
  await expect(page.getByTestId('bonus-banner')).toHaveCount(0); // a first visit: one vote
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
  await expect(page.getByTestId('tomorrow')).toContainText('streak earns you +1 vote tomorrow');
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
    await page.goto(`/?day=${day}`);
    // Voted last night: a streak vote, announced by a ribbon (not a card). Night 7 is skipped,
    // so night 8 brings no bonus, and voting on night 8 earns it back for night 9.
    await expect(page.getByTestId('tonight')).toContainText('Your vote is waiting');
    if (day === 7) await expect(page.getByTestId('bonus-banner')).toHaveCount(0);
    else
      await expect(page.getByTestId('bonus-banner')).toContainText('Streak bonus! +1 vote tonight');
    await page.getByTestId('start').click();
    // Back after midnight: the stitching is revealed first, with how my pick fared.
    const reveal = page.getByTestId('reveal');
    await expect(reveal).toBeVisible();
    await expect(reveal).toContainText(`Night ${day} ·`);
    await expect(reveal).toContainText('The village chose');
    await expect(page.getByTestId('reveal-mine')).toContainText(
      day === 7 ? 'did not vote' : /won|came \d/,
    );
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
    if (day === 6) continue; // night 7: no vote
    await voteFor(page, day % 5);
    if (day === 1) {
      await expect(page.getByTestId('bonus-banner')).toContainText('Your streak vote is waiting');
      await voteFor(page, day % 5);
      await expect(page.getByTestId('bonus-banner')).toHaveCount(0);
      await expect(page.locator('.result.mine .chip').last()).toHaveText('Your vote ×2');
    }
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
  // A storm gathers over the tower: lightning in the window, the room and page flash.
  await expect(page.locator('.lab-strike')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('.storm-flash')).toHaveCount(1);
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

  // Halloween: it wakes, in a scene everyone sees once (dark lab, the spark, the strike, colour).
  // (runSeconds: mock only, a short rampage run.)
  await page.goto('/?day=20&runSeconds=6');
  const wake = page.getByTestId('awakening');
  await expect(wake).toHaveAttribute('data-stage', 'intro');
  await expect(wake).toContainText('19 nights');
  await noSidewaysScroll(page);
  await framedButtons(page);
  await shot('awakening-intro');
  await page.getByTestId('awaken-start').click();
  await expect(wake).toHaveAttribute('data-stage', 'dark');
  await expect(wake.locator('.awaken-caption')).toContainText(/19 nights\. [\d,]+ votes\./);
  await expect(wake).toHaveAttribute('data-stage', 'strike', { timeout: 6000 });
  await expect(wake).toHaveAttribute('data-stage', 'alive', { timeout: 6000 });
  await expect(wake.locator('.monster.alive.aura')).toBeVisible();
  await expect(wake.locator('.awaken-title')).toHaveText("IT'S ALIVE!");
  // ...and breaks out of the laboratory into the rampage menu: the creature the village built,
  // loose over the village.
  await expect(page.getByTestId('awaken-done')).toHaveText('It breaks out! ⚡', { timeout: 6000 });
  await page.getByTestId('awaken-done').click();
  await expect(wake).toHaveCount(0);
  const menu = page.getByTestId('rampage-menu');
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('loose-title')).toHaveText("IT'S LOOSE!", { timeout: 5000 });
  await expect(page.getByTestId('loose-scene')).toHaveAttribute('data-loose', 'true');
  await expect(menu).toContainText('Loose in The Village');
  await expect(page.getByTestId('rampage-card')).toContainText('Rampage day 1');
  await expect(page.getByTestId('reveal')).toHaveCount(0); // the scene showed the last stitching
  await noSidewaysScroll(page);
  await framedButtons(page);
  await shot('rampage-menu');
  // A run: it grows as it smashes (steered here like a player), then the end panel.
  await page.getByTestId('rampage-start').click();
  const rampage = page.getByTestId('rampage');
  await expect(page.getByTestId('rampage-title')).toHaveText('RAMPAGE!', { timeout: 10_000 });
  await expect(rampage).toHaveAttribute('data-phase', 'play', { timeout: 5000 });
  await shot('rampage');
  await page.keyboard.down('ArrowUp');
  await expect(rampage).toHaveAttribute('data-phase', 'over', { timeout: 15_000 });
  await page.keyboard.up('ArrowUp');
  await expect(page.getByTestId('rampage-score')).toHaveText(/\d/);
  await expect(page.getByTestId('rampage-count')).toContainText('Added to the creature');
  await framedButtons(page);
  await shot('rampage-over');
  // Again starts a fresh run; back to the lab returns to the menu, with the player's best.
  await page.getByTestId('rampage-again').click();
  await expect(rampage).toHaveAttribute('data-phase', 'play', { timeout: 10_000 });
  await expect(rampage).toHaveAttribute('data-phase', 'over', { timeout: 15_000 });
  await page.getByTestId('rampage-quit').click();
  await expect(rampage).toHaveCount(0);
  await expect(page.getByTestId('rampage-card')).toContainText('Your best');
  // The waking can be watched again, and skipped.
  await page.getByTestId('awaken-replay').click();
  await expect(wake).toHaveAttribute('data-stage', 'dark');
  await page.getByTestId('awaken-skip').click();
  await expect(wake).toHaveCount(0);
  // Coming back: straight to the menu, no waking and no breakout this time.
  await page.goto('/?day=20&runSeconds=4');
  await expect(menu).toBeVisible();
  await expect(wake).toHaveCount(0);
  await expect(page.getByTestId('loose-scene')).toHaveAttribute('data-loose', 'true');
  await expect(page.getByTestId('loose-title')).toHaveCount(0);
  await imagesLoaded(page);
  await noSidewaysScroll(page);
  await shot('alive');
  await page.getByRole('button', { name: 'Chronicle' }).click();
  await expect(page.locator('.chron-done')).toHaveCount(19);
  await page.getByRole('button', { name: 'Close chronicle' }).click();

  // The next day it is loose somewhere new, and taller for what everyone smashed.
  await page.goto('/?day=21&runSeconds=4');
  await expect(menu).toContainText('Loose in The Farmlands');
  await expect(page.getByTestId('rampage-card')).toContainText(/grew \d+ ft last night/);

  expect(errors).toEqual([]);
});

test('the awakening skips the flashes and shaking for players who ask for less motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?day=20');
  await page.getByTestId('awaken-start').click();
  const wake = page.getByTestId('awakening');
  await expect(wake).toHaveAttribute('data-stage', 'alive');
  await expect(wake.locator('.awaken-title')).toBeVisible();
  await page.getByTestId('awaken-done').click({ timeout: 3000 });
  await expect(wake).toHaveCount(0);
  // The menu's breakout skips its shaking and flash too: the creature is simply loose.
  await expect(page.getByTestId('rampage-menu')).toBeVisible();
  await expect(page.getByTestId('loose-scene')).toHaveAttribute('data-loose', 'true');
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

test('owner test mode: jump to Halloween with a throwaway save, then back to the real day', async ({
  page,
}) => {
  await page.goto('/?day=2');
  await page.getByTestId('start').click();
  await expect(page.locator('.dayline')).toHaveText('Night 3 of 19');
  for (let i = 0; i < 5; i++) await page.getByTestId('build-stamp').click();
  await expect(page.getByTestId('test-mode')).toBeVisible();
  await page.getByTestId('preview-20').click();
  await expect(page.getByTestId('preview-bar')).toContainText('TEST MODE · Halloween');
  const wake = page.getByTestId('awakening');
  await expect(wake).toHaveAttribute('data-stage', 'intro');
  await page.getByTestId('awaken-skip').click();
  await expect(page.getByTestId('rampage-menu')).toBeVisible();
  await expect(page.getByTestId('rampage-card')).toContainText('Rampage day 1');
  await framedButtons(page);
  // Jump again, to a later day of the rampage.
  for (let i = 0; i < 5; i++) await page.getByTestId('build-stamp').click();
  await page.getByTestId('preview-22').click();
  await expect(page.getByTestId('preview-bar')).toContainText('Rampage day 3');
  await page.getByTestId('awaken-skip').click();
  await expect(page.getByTestId('rampage-menu')).toContainText('Loose in The Market Town');
  // Exit: back to the real day, on its own save.
  await page.getByTestId('preview-bar').getByRole('button', { name: 'Exit' }).click();
  await expect(page.getByTestId('preview-bar')).toHaveCount(0);
  await expect(page.getByTestId('start')).toHaveText('Continue');
  await expect(page.getByTestId('tonight')).toContainText('Night 3 of 19');
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

import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.SHOTS_DIR;

async function noSidewaysScroll(page: Page) {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(scroll, 'page must not scroll sideways').toBeLessThanOrEqual(width);
}

async function framedButtons(page: Page) {
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

async function openDay(page: Page, day: number) {
  await page.goto(`/?day=${day}`);
  await page.getByTestId('start').click();
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

  // Night 1: the head.
  await page.goto('/?day=0');
  await expect(page.getByTestId('start')).toHaveText('Enter the Laboratory');
  await noSidewaysScroll(page);
  await framedButtons(page);
  await shot('title');
  const theme = page.waitForResponse((r) => r.url().includes('theme.mp3') && r.ok());
  await page.getByTestId('start').click();
  await theme; // the main theme loads from cdn-assets once the player enters
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
  await noSidewaysScroll(page);
  await shot('results');

  // One free vote only; a rewarded ad unlocks one more.
  await expect(page.locator('.option')).toHaveCount(0);
  await page.getByTestId('ad-vote').click();
  await page.getByRole('button', { name: 'Close Ad' }).click();
  await expect(page.locator('.notice')).toBeVisible();
  await voteFor(page, 1);
  await expect(page.locator('.result.mine .chip').last()).toHaveText('Your vote ×2');
  await expect(page.getByTestId('ad-vote')).toHaveCount(0);
  await expect(page.getByText("You've cast all 2 of tonight's votes")).toBeVisible();

  // Music toggle is framed, flips, and is remembered.
  const music = page.getByTestId('music');
  await expect(music).toHaveAttribute('aria-pressed', 'true');
  await music.click();
  await expect(music).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(400); // let the save land

  // Continue where we left off.
  await page.reload();
  await expect(page.getByTestId('start')).toHaveText('Continue');
  await page.getByTestId('start').click();
  await expect(page.locator('.result')).toHaveCount(5);
  await expect(page.locator('.result.mine .chip').last()).toHaveText('Your vote ×2');
  await expect(page.getByTestId('music')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('music').click();
  await expect(page.getByTestId('music')).toHaveAttribute('aria-pressed', 'true');

  // Nights 2..21: a new part every night, the monster grows.
  let lastParts = await page.locator('.monster:not(.monster-mini) .part').count();
  for (let day = 1; day <= 20; day++) {
    await openDay(page, day);
    await expect(page.locator('.dayline')).toHaveText(`Night ${day + 1} of 21`);
    await expect(page.locator('.option')).toHaveCount(5);
    await expect(page.locator('.result')).toHaveCount(0);
    await expect
      .poll(() => page.locator('.monster:not(.monster-mini) .part').count())
      .toBeGreaterThan(lastParts);
    lastParts = await page.locator('.monster:not(.monster-mini) .part').count();
    await voteFor(page, day % 5);
    await percentagesSumTo100(page);
    await noSidewaysScroll(page);
    if (day === 10) await shot('midseason');
  }
  await expect(page.locator('.prompt')).toHaveText("What SPARK shall wake it on All Hallows' Eve?");

  // Chronicle lists every resolved night.
  await page.getByTestId('chronicle').click();
  await expect(page.locator('.chron-done')).toHaveCount(20);
  await expect(page.locator('.chron-now')).toHaveCount(1);
  await shot('chronicle');
  await page.getByRole('button', { name: 'Close chronicle' }).click();

  // Halloween: it wakes.
  await openDay(page, 21);
  await expect(page.locator('.logo-alive')).toHaveText("IT'S ALIVE!");
  await expect(page.locator('.monster.alive')).toBeVisible();
  await noSidewaysScroll(page);
  await shot('alive');
  await page.getByRole('button', { name: 'Chronicle' }).click();
  await expect(page.locator('.chron-done')).toHaveCount(21);

  expect(errors).toEqual([]);
});

test('every night of the season fits the phone without sideways scrolling', async ({ page }) => {
  for (const day of [0, 4, 9, 13, 18, 20]) {
    await openDay(page, day);
    await expect(page.locator('.option')).toHaveCount(5);
    await page.locator('.option').first().click();
    await noSidewaysScroll(page);
    await framedButtons(page);
  }
});

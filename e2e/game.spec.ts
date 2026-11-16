import { type Page, expect, test } from '@playwright/test';
import { cardCode, parseCard } from '../src/engine/cards.ts';
import { LOSING_CARD, ONE_MOVE_FROM_LOST, STACKS } from '../src/engine/fixtures.ts';
import type { Layout } from '../src/engine/notation.ts';
import type { GameState } from '../src/engine/state.ts';

interface Handle {
  ready: boolean;
  won: boolean;
  moveCount: number;
  state: GameState;
  view: GameState;
  hintMove: { from: number; to: number; count: number } | null;
  loadPosition(state: GameState): Promise<void>;
}
declare global {
  interface Window {
    freecell: Handle;
    freecellLayout(layout: Layout): GameState;
  }
}

const card = (page: Page, code: string) => page.locator(`[data-card="${code}"]`);
const drawer = (page: Page) => page.locator('.drawer');

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.freecell?.ready);
}

/** Waits for the moves of the last action to finish playing out on screen. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => JSON.stringify(window.freecell.view) === JSON.stringify(window.freecell.state));
  await page.waitForTimeout(60);
}

async function load(page: Page, layout: Layout): Promise<void> {
  await page.evaluate((l) => window.freecell.loadPosition(window.freecellLayout(l)), layout);
  await settled(page);
}

const state = (page: Page) => page.evaluate(() => window.freecell.state);
const moveCount = (page: Page) => page.evaluate(() => window.freecell.moveCount);
const codes = (cards: number[]) => cards.map(cardCode);

/** Clicks the strip of a card that stays visible when other cards sit on it. */
async function clickCard(page: Page, code: string): Promise<void> {
  await card(page, code).click({ position: { x: 20, y: 8 } });
  await settled(page);
}

/** Drags a card by its visible strip so that it lands squarely over `target`. */
async function dragOnto(page: Page, code: string, target: { x: number; y: number }): Promise<void> {
  const box = (await card(page, code).boundingBox())!;
  const grab = { x: box.x + box.width / 2, y: box.y + 8 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 12, grab.y + 12, { steps: 2 });
  await page.mouse.move(grab.x + target.x - box.x, grab.y + target.y - box.y, { steps: 6 });
  await page.mouse.up();
  await settled(page);
}

async function topLeft(page: Page, selector: string, index = 0): Promise<{ x: number; y: number }> {
  const box = (await page.locator(selector).nth(index).boundingBox())!;
  return { x: box.x, y: box.y };
}

test('deals the numbered game', async ({ page }) => {
  await open(page, '?deal=1');
  await expect(page.locator('[data-card]')).toHaveCount(52);
  await expect(page.getByRole('button', { name: 'Deal #1' })).toBeVisible();
  const dealt = await state(page);
  expect(codes(dealt.cascades[0])).toEqual(['JD', 'KD', '2S', '4C', '3S', '6D', '6S']);
});

test('a click moves a card, undo takes it back, and a reload resumes', async ({ page }) => {
  await open(page, '?deal=1');
  await clickCard(page, '6H');
  expect((await state(page)).cells[0]).toBe(parseCard('6H'));

  await page.reload();
  await page.waitForFunction(() => window.freecell?.ready);
  expect(await moveCount(page)).toBe(1);
  expect((await state(page)).cells[0]).toBe(parseCard('6H'));

  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await state(page)).cells[0]).toBeNull();
  await page.keyboard.press('r');
  expect((await state(page)).cells[0]).toBe(parseCard('6H'));
});

test('clicking a card inside a run moves the whole stack', async ({ page }) => {
  await open(page, '?deal=1');
  await load(page, STACKS);
  await clickCard(page, 'JC');
  const after = await state(page);
  expect(codes(after.cascades[2])).toEqual(['9D', 'KS', 'QD', 'JC', 'TH']);
  expect(after.cascades[4]).toEqual([]);
  expect(await moveCount(page)).toBe(1);
});

test('an impossible stack move explains itself on the second click', async ({ page }) => {
  await open(page, '?deal=1');
  await load(page, STACKS);
  await clickCard(page, 'QS');
  await expect(drawer(page)).toHaveCount(0);
  await clickCard(page, 'QS');
  await expect(drawer(page)).toContainText('A stack of 3 needs 2 free cells, and you have 1 open.');
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toHaveCount(0);
  expect(await moveCount(page)).toBe(0);
});

test('cards can be dragged to a chosen pile', async ({ page }) => {
  await open(page, '?deal=1');
  await load(page, STACKS);

  await dragOnto(page, 'TS', await topLeft(page, '.slot.cell', 3));
  expect((await state(page)).cells[3]).toBe(parseCard('TS'));

  await dragOnto(page, 'TS', await topLeft(page, '[data-card="JH"]'));
  expect(codes((await state(page)).cascades[0])).toEqual(['9S', 'KD', 'QS', 'JH', 'TS']);

  await dragOnto(page, 'JC', await topLeft(page, '[data-card="QD"]'));
  expect(codes((await state(page)).cascades[2])).toEqual(['9D', 'KS', 'QD', 'JC', 'TH']);

  const before = await moveCount(page);
  await dragOnto(page, 'KC', await topLeft(page, '[data-card="KH"]'));
  expect(await moveCount(page)).toBe(before);
  expect(codes((await state(page)).cascades[6])).toEqual(['KC']);
});

test('hints lead all the way to a win', async ({ page }) => {
  await open(page, '?deal=1');
  let steps = 0;
  while (!(await page.evaluate(() => window.freecell.won))) {
    expect(++steps).toBeLessThan(200);
    const panel = await page.evaluate(() => document.querySelector<HTMLElement>('.drawer')?.dataset.panel ?? null);
    if (panel !== 'steps') {
      await page.keyboard.press('h');
      await expect(drawer(page)).toHaveAttribute('data-panel', /goal|steps/);
      continue;
    }
    const head = await page.evaluate(() => {
      const { state, hintMove } = window.freecell;
      if (!hintMove) return null;
      if (hintMove.from >= 8) return state.cells[hintMove.from - 8];
      const cascade = state.cascades[hintMove.from];
      return cascade[cascade.length - hintMove.count];
    });
    expect(head).not.toBeNull();
    const before = await moveCount(page);
    await dragOnto(page, cardCode(head!), await topLeft(page, '.landing'));
    expect(await moveCount(page)).toBe(before + 1);
  }
  await expect(drawer(page)).toContainText('You won!');
});

test('a lost game is announced after the delay and can be rolled back', async ({ page }) => {
  await open(page, '?deal=1&stuckDelay=2');
  await load(page, ONE_MOVE_FROM_LOST);
  await clickCard(page, LOSING_CARD);
  await page.waitForTimeout(1000);
  await expect(drawer(page)).toHaveCount(0);

  await expect(drawer(page)).toContainText("can't be won from here", { timeout: 5000 });
  await page.getByRole('button', { name: 'Roll back 1 move' }).click();
  expect(await moveCount(page)).toBe(0);
  await expect(drawer(page)).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

  test('a tap moves a card and the drawer fits', async ({ page }) => {
    await open(page, '?deal=1');
    await card(page, '6H').tap({ position: { x: 10, y: 8 } });
    await settled(page);
    expect((await state(page)).cells[0]).toBe(parseCard('6H'));

    await page.getByRole('button', { name: 'Hint' }).tap();
    const box = (await drawer(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
  });
});

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures.js';
import { api, registerUser, signIn } from './shared.js';

const password = 'preference-test-password';
const username = `prefs${Date.now().toString(36)}`;
let noteText: string;
let userId: string;

test.use({
	baseURL: 'http://localhost:61812',
	launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
		? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
		: {},
});

test.beforeAll(async () => {
	const user = await registerUser('http://localhost:61812', username, password);
	userId = user.id;
	await api('http://localhost:61812', 'i/registry/set', {
		i: user.token, key: 'accountSetupWizard', value: -1, scope: ['client', 'base'],
	});
	const marker = Date.now().toString(36);
	noteText = `Preference note ${marker}`;
	for (let i = 0; i < 25; i++) {
		await api('http://localhost:61812', 'notes/create', {
			i: user.token,
			text: i === 24 ? noteText : `Scrollable profile note ${marker} ${i}\nSecond line of scrolling content.\nThird line of scrolling content.\nFourth line of scrolling content.`,
			visibility: 'public',
		});
	}
});

test.beforeEach(async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.addInitScript(() => localStorage.setItem('lang', 'en-US'));
	await signIn(page, 'http://localhost:61812', username, password);
	await expect(mobileMenu(page)).toBeVisible();
	await expect.poll(() => page.evaluate(() => {
		const saved = localStorage.getItem('account');
		return saved == null ? null : JSON.parse(saved).id;
	})).toBe(userId);
	await page.goto(`/@${username}/notes`);
	await expect(page.getByText(noteText, { exact: true })).toBeVisible();
});

async function openAccessibility(page: Page): Promise<void> {
	await page.goto('/settings/preferences');
	await page.getByText('Accessibility', { exact: true }).click();
}

function preferenceSwitch(page: Page, label: string): Locator {
	return page.getByText(label, { exact: true });
}

async function expectPreference(page: Page, key: string, value: boolean): Promise<void> {
	await expect.poll(() => page.evaluate((preference) => {
		const saved = localStorage.getItem('preferences');
		if (saved == null) return undefined;
		return JSON.parse(saved).preferences[preference]?.[0]?.[1];
	}, key)).toBe(value);
}

async function textMetrics(page: Page): Promise<{ fontSize: number; lineHeight: number }> {
	const note = page.getByText(noteText, { exact: true });
	await expect(note).toBeVisible();
	return note.evaluate(element => {
		const style = getComputedStyle(element);
		return { fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight) };
	});
}

function mobileMenu(page: Page): Locator {
	return page.getByRole('button').filter({ has: page.locator('.ti-menu-2') }).locator('..');
}

async function profileScrollOwner(page: Page): Promise<Locator> {
	const note = page.getByText(noteText, { exact: true });
	await expect(note).toBeVisible();
	const found = await note.evaluate(element => {
		let parent = element.parentElement;
		while (parent != null) {
			const style = getComputedStyle(parent);
			if (['auto', 'scroll'].includes(style.overflowY) && parent.scrollHeight > parent.clientHeight) {
				parent.setAttribute('data-test-profile-scroll-owner', '');
				return true;
			}
			parent = parent.parentElement;
		}
		return false;
	});
	if (!found) throw new Error('Profile note has no scrollable ancestor');
	return page.locator('[data-test-profile-scroll-owner]');
}

async function scrollMenu(page: Page, scrollable: Locator, hide: boolean): Promise<void> {
	const menu = mobileMenu(page);
	await expect(menu).toHaveCount(1);
	await expect(menu).toBeVisible();
	await expect.poll(() => scrollable.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(550);
	await expect(page.locator('html')).not.toHaveClass(/_themeChanging_/);
	const box = await scrollable.boundingBox();
	if (box == null) throw new Error('Profile scroll owner is not visible');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, 200);
	await expect.poll(() => scrollable.evaluate(el => el.scrollTop)).toBeGreaterThanOrEqual(200);
	await page.mouse.wheel(0, 350);
	await expect.poll(() => scrollable.evaluate(el => el.scrollTop)).toBeGreaterThan(500);
	if (hide) await expect(menu).toBeHidden();
	else await expect(menu).toBeVisible();
}

test('large note text preference persists and changes profile note metrics', async ({ page }) => {
	await openAccessibility(page);
	await preferenceSwitch(page, 'Slightly enlarge note texts').click();
	await expectPreference(page, 'largeNoteText', false);
	await page.reload();
	await expectPreference(page, 'largeNoteText', false);
	await page.goto(`/@${username}/notes`);
	const normal = await textMetrics(page);
	await openAccessibility(page);
	await preferenceSwitch(page, 'Slightly enlarge note texts').click();
	await expectPreference(page, 'largeNoteText', true);
	await page.reload();
	await expectPreference(page, 'largeNoteText', true);
	await page.goto(`/@${username}/notes`);
	const enlarged = await textMetrics(page);
	expect(enlarged.fontSize / normal.fontSize).toBeCloseTo(1.1, 1);
	expect(enlarged.lineHeight / enlarged.fontSize).toBeCloseTo(1.4, 1);
});

test('hide footer preference persists while mobile footer behavior remains controlled by the preference', async ({ page }) => {
	await openAccessibility(page);
	await preferenceSwitch(page, 'Automatically hide footer buttons on mobile devices').click();
	await expectPreference(page, 'hideNavFooter', true);
	await page.reload();
	await expectPreference(page, 'hideNavFooter', true);
	await page.goto(`/@${username}/notes`);
	let scrollable = await profileScrollOwner(page);
	await scrollMenu(page, scrollable, true);
	await page.mouse.wheel(0, -100_000);
	await expect.poll(() => scrollable.evaluate(el => el.scrollTop)).toBe(0);
	await expect(mobileMenu(page)).toBeVisible();
	await openAccessibility(page);
	await preferenceSwitch(page, 'Automatically hide footer buttons on mobile devices').click();
	await expectPreference(page, 'hideNavFooter', false);
	await page.reload();
	await expectPreference(page, 'hideNavFooter', false);
	await page.goto(`/@${username}/notes`);
	scrollable = await profileScrollOwner(page);
	await scrollMenu(page, scrollable, false);
});

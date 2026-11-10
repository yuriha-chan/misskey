/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures.js';
import { closeUserSetupDialog, registerUser, resetState, signIn } from './shared.js';

type LayoutPreferences = Partial<Record<'hideNavFooter' | 'animation' | 'experimental.stackingRouterView' | 'enableInfiniteScroll', boolean>>;

async function configureLayout(page: Page, preferences: LayoutPreferences): Promise<void> {
	await page.evaluate((values) => {
		const saved = localStorage.getItem('preferences');
		if (saved == null) throw new Error('The signed-in session has no preferences profile');
		const profile = JSON.parse(saved);
		for (const [key, value] of Object.entries(values)) {
			profile.preferences[key] = [[{}, value, {}]];
		}
		profile.modifiedAt = Date.now();
		localStorage.setItem('preferences', JSON.stringify(profile));
	}, preferences);
}

function mobileMenu(page: Page): Locator {
	return page.getByRole('button').filter({ has: page.locator('.ti-menu-2') }).locator('..');
}

async function scrollPage(page: Page, container: Locator, deltaY: number): Promise<void> {
	await expect(container).toHaveCount(1);
	await expect(page.locator('html')).not.toHaveClass(/_themeChanging_/);
	const box = await container.boundingBox();
	if (box == null) throw new Error('The page scroll container is not visible');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, deltaY);
}

async function expectMenuCoverage(content: Locator, menu: Locator): Promise<void> {
	await expect(content).toBeVisible();
	await expect.poll(async () => {
		const contentBox = await content.boundingBox();
		if (contentBox == null || contentBox.height <= 0) return Infinity;
		if (!await menu.isVisible()) return 0;
		const menuBox = await menu.boundingBox();
		if (menuBox == null) return 0;
		const overlapWidth = Math.min(contentBox.x + contentBox.width, menuBox.x + menuBox.width) - Math.max(contentBox.x, menuBox.x);
		if (overlapWidth <= 0) return 0;
		const coveredHeight = Math.max(0, Math.min(contentBox.y + contentBox.height, menuBox.y + menuBox.height) - Math.max(contentBox.y, menuBox.y));
		return coveredHeight / contentBox.height;
	}, { message: 'The floating menu wrapper must cover at most 10% of the bottom content height' }).toBeLessThanOrEqual(0.1);
}

async function postTimelineNote(page: Page, text: string): Promise<void> {
	await page.getByTestId('open-post-form').click();
	await expect(page.getByTestId('post-form-text')).toHaveCount(1);
	await page.getByTestId('post-form-text').fill(text);
	const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/notes/create');
	await page.getByTestId('post-form-submit').click();
	expect((await created).status()).toBe(200);
	await expect(page.getByTestId('post-form-text')).toHaveCount(0);
	await expect(page.getByText(text, { exact: true })).toBeVisible();
}

function labeledInput(page: Page, label: string): Locator {
	return page.locator('._selectable').filter({ has: page.getByText(label, { exact: true }) }).getByRole('textbox');
}

async function createLongArticle(page: Page): Promise<string> {
	await page.goto('/pages/new');
	await labeledInput(page, 'Title').fill('Scrolling article');
	await page.getByText('Contents', { exact: true }).click();
	await expect(page.locator('textarea')).toHaveCount(1);
	await page.locator('textarea').fill(Array.from({ length: 50 }, (_, i) => `Article paragraph ${i}: content for scrolling through a long Page.`).join('\n\n'));
	const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/pages/create');
	await page.getByRole('button', { name: /(?:^|\s)Save$/ }).click();
	const response = await saved;
	expect(response.status()).toBe(200);
	const article: { name: string } = await response.json();
	return `/@alice/pages/${article.name}`;
}

async function expectMenuScrollBehavior(page: Page, scrollable: Locator, hide: boolean): Promise<void> {
	const menu = mobileMenu(page);
	await expect(menu).toBeVisible();
	await expect.poll(() => scrollable.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(550);
	await scrollPage(page, scrollable, 200);
	await expect.poll(() => scrollable.evaluate(el => el.scrollTop)).toBeGreaterThanOrEqual(200);
	await scrollPage(page, scrollable, 350);
	await expect.poll(() => scrollable.evaluate(el => el.scrollTop)).toBeGreaterThan(500);
	if (hide) {
		await expect(menu).toBeHidden();
	} else {
		await expect(menu).toBeVisible();
	}
}

async function expectScrollRestoredAtTop(page: Page, scrollable: Locator): Promise<void> {
	await scrollPage(page, scrollable, -100_000);
	await expect.poll(() => scrollable.evaluate(el => el.scrollTop)).toBe(0);
	await expect(mobileMenu(page)).toBeVisible();
}

test.describe('Frontend tweaks', () => {
	test.beforeEach(async ({ page, baseURL }) => {
		if (baseURL == null) throw new Error('A Playwright baseURL is required');
		await page.setViewportSize({ width: 1440, height: 900 });
		await resetState(baseURL);
		await registerUser(baseURL, 'admin', 'admin1234', true);
		await registerUser(baseURL, 'alice', 'alice1234');
		await signIn(page, baseURL, 'alice', 'alice1234');
		const setupSaved = page.waitForResponse(response =>
			new URL(response.url()).pathname === '/api/i/registry/set'
			&& response.request().postDataJSON()?.key === 'accountSetupWizard');
		await closeUserSetupDialog(page);
		expect((await setupSaved).status()).toBe(204);
		await expect(page.getByTestId('user-setup-dialog')).toBeHidden();
	});

	for (const ui of ['universal', 'deck'] as const) {
		for (const viewport of [
			{ name: 'mobile', width: 390, height: 844 },
			{ name: 'tablet', width: 768, height: 1024 },
			{ name: 'narrow PC', width: 1024, height: 768 },
			{ name: 'wide PC', width: 1440, height: 900 },
		]) {
			test(`renders timeline, navigation and widgets in ${ui} on ${viewport.name}`, async ({ page }) => {
				const text = `Responsive ${ui} ${viewport.name} timeline`;
				await postTimelineNote(page, text);
				await configureLayout(page, { animation: false, hideNavFooter: false });
				await page.evaluate(() => {
					const profile = JSON.parse(localStorage.getItem('preferences')!);
					const clock = { id: 'responsive-clock', name: 'digitalClock', data: {} };
					const values = {
						widgets: [{ ...clock, place: 'right' }],
						'deck.navbarPosition': 'left',
						'deck.profile': 'Responsive',
						'deck.profiles': [{
							id: 'responsive-profile', name: 'Responsive',
							columns: [
								{ id: 'responsive-timeline', type: 'tl', tl: 'home', name: 'Responsive timeline', width: 330 },
								{ id: 'responsive-widgets', type: 'widgets', name: 'Responsive widgets', width: 330, widgets: [clock] },
							],
							layout: [['responsive-timeline', 'responsive-widgets']],
						}],
					};
					for (const [key, value] of Object.entries(values)) {
						profile.preferences[key] = profile.preferences[key].map(([scope]: [unknown]) => [scope, value, {}]);
					}
					profile.modifiedAt = Date.now();
					localStorage.setItem('preferences', JSON.stringify(profile));
				});
				await page.setViewportSize({ width: viewport.width, height: viewport.height });
				await page.goto(`/?ui=${ui}`);
				await expect(page.getByText(text, { exact: true })).toBeVisible();
				await expect(page.getByText(text, { exact: true })).toBeInViewport();
				const clock = page.getByTestId('mkw-digitalClock');
				const mobile = viewport.width <= 500;
				if (ui === 'universal' && viewport.width < 1100) {
					await expect(clock).toHaveCount(0);
					const widgetsButton = page.getByRole('button').filter({ has: page.locator('.ti-apps') });
					await expect(widgetsButton).toHaveCount(1);
					await widgetsButton.click();
				}
				await expect(clock).toHaveCount(1);
				await expect(clock).toBeVisible();
				await expect(clock).toBeInViewport();
				if (ui === 'universal' && viewport.width < 1100) {
					await expect(page.locator('._modalBg')).toHaveCount(1);
					await page.locator('._modalBg').click({ position: { x: viewport.width - 5, y: 10 } });
					await expect(clock).toHaveCount(0);
				}
				if (mobile) {
					await expect(mobileMenu(page)).toBeVisible();
					await expect(page.getByRole('link').and(page.locator('a[href="/settings"]'))).toHaveCount(0);
					await mobileMenu(page).getByRole('button').filter({ has: page.locator('.ti-menu-2') }).click();
				} else {
					await expect(mobileMenu(page)).toHaveCount(0);
					await expect(page.getByTestId('open-post-form')).toBeVisible();
				}
				const settings = page.getByRole('link').and(page.locator('a[href="/settings"]'));
				await expect(settings).toHaveCount(1);
				await expect(settings).toBeVisible();
				await expect(settings).toBeInViewport();
			});
		}
	}

	for (const stacking of [false, true]) {
		test(`defers secondary content until the main settings content is ready (${stacking ? 'stacking' : 'normal'} router)`, async ({ page }) => {
			await configureLayout(page, { 'experimental.stackingRouterView': stacking });
			let release!: () => void;
			const released = new Promise<void>(resolve => { release = resolve; });
			let requested!: () => void;
			const pending = new Promise<void>(resolve => { requested = resolve; });
			await page.route('**/api/users/lists/list', async route => {
				requested();
				await released;
				await route.continue();
			});
			try {
				await page.goto('/settings/notifications');
				await pending;
				await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
				await expect(page.getByRole('link', { name: /^Notification sound settings(?:\s|$)/ })).toHaveCount(0);
				await expect(page.getByTestId('open-post-form')).toHaveCount(0);
				await expect(page.getByTestId('widget-edit')).toHaveCount(0);
				release();
				await expect(page.getByRole('link', { name: /^Notification sound settings(?:\s|$)/ })).toBeVisible();
				await expect(page.getByTestId('open-post-form')).toBeVisible();
				await expect(page.getByTestId('widget-edit')).toBeVisible();
			} finally {
				release();
				await page.unrouteAll({ behavior: 'wait' });
			}
		});
	}

	for (const menuPosition of ['right', 'bottom'] as const) {
		for (const viewport of [{ width: 390, height: 844 }, { width: 500, height: 390 }]) {
			test(`clears mobile Deck bottom controls with ${menuPosition} toolbar at ${viewport.width}x${viewport.height}`, async ({ page }) => {
				for (let i = 0; i < 8; i++) await postTimelineNote(page, `Deck overlap note ${i}`);
				await configureLayout(page, { animation: false, hideNavFooter: false });
				await page.goto('/chat');
				await page.getByRole('button', { name: /Start chat$/ }).click();
				await page.getByRole('menuitem', { name: /Room Chat/ }).click();
				const dialog = page.getByTestId('chat-room-editor');
				await dialog.getByTestId('chat-room-name').getByRole('textbox').fill('Deck overlap room');
				const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/chat/rooms/create');
				await dialog.getByRole('button', { name: 'Create', exact: true }).click();
				expect((await created).status()).toBe(200);
				await expect(page.getByPlaceholder('Enter message here', { exact: true })).toBeVisible();
				const roomPath = new URL(page.url()).pathname;
				await page.evaluate((position) => {
					const profile = JSON.parse(localStorage.getItem('preferences')!);
					const values = {
						'deck.menuPosition': position,
						'deck.navWindow': false,
						'deck.useSimpleUiForNonRootPages': false,
						'deck.profile': 'Overlap',
						'deck.profiles': [{
							id: 'overlap-profile', name: 'Overlap',
							columns: [
								{ id: 'overlap-timeline', type: 'tl', tl: 'home', name: 'Overlap timeline', width: 330 },
								{ id: 'overlap-main', type: 'main', name: null, width: 330 },
							],
							layout: [['overlap-timeline'], ['overlap-main']],
						}],
					};
					for (const [key, value] of Object.entries(values)) {
						profile.preferences[key] = profile.preferences[key].map(([scope]: [unknown]) => [scope, value, {}]);
					}
					profile.modifiedAt = Date.now();
					localStorage.setItem('preferences', JSON.stringify(profile));
				}, menuPosition);
				await page.setViewportSize(viewport);
				await page.goto(`${roomPath}?ui=deck`);
				const menu = mobileMenu(page);
				await expect(menu).toBeVisible();
				const settings = page.getByRole('button').filter({ has: page.locator('.ti-settings-2') });
				await expect(settings).toHaveCount(1);
				await expectMenuCoverage(settings, menu);
				const timeline = page.locator('section').filter({ has: page.getByText('Overlap timeline', { exact: true }) });
				const scrollable = timeline.locator(':scope > div > div').filter({ has: page.locator('article') });
				await expect(scrollable).toHaveCount(1);
				await scrollPage(page, scrollable, 100_000);
				await expect.poll(() => scrollable.evaluate(el => el.scrollTop + el.clientHeight >= el.scrollHeight - 1)).toBe(true);
				const reply = timeline.locator('article').filter({ hasText: 'Deck overlap note 0' }).getByRole('button').filter({ has: page.locator('.ti-arrow-back-up') });
				await expectMenuCoverage(reply, menu);
				await reply.click();
				await expect(page.getByTestId('post-form-text')).toBeVisible();
				await page.keyboard.press('Escape');
				const main = page.locator('section').filter({ has: page.getByPlaceholder('Enter message here', { exact: true }) });
				await main.locator(':scope > div > header').scrollIntoViewIfNeeded();
				const composer = main.getByPlaceholder('Enter message here', { exact: true });
				const send = main.getByTitle('Send', { exact: true });
				await expectMenuCoverage(composer, menu);
				await expectMenuCoverage(send, menu);
				await composer.fill('Deck message above menu');
				const sent = page.waitForResponse(response => new URL(response.url()).pathname === '/api/chat/messages/create-to-room');
				await send.click();
				expect((await sent).status()).toBe(200);
				await expect(main.getByText('Deck message above menu', { exact: true })).toBeVisible();
				await expectMenuCoverage(settings, menu);
				await settings.click();
				await expect(page.getByText('Deck menu position', { exact: true })).toBeVisible();
			});
		}
	}

	test('keeps the last timeline note controls reachable above the floating mobile menu', async ({ page }) => {
		for (let i = 0; i < 16; i++) {
			await postTimelineNote(page, `Overlay timeline note ${i}`);
		}
		await configureLayout(page, { hideNavFooter: false, animation: false, enableInfiniteScroll: false });
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');
		const menu = mobileMenu(page);
		const scrollable = page.locator('._pageScrollable');
		await expect(menu).toHaveCount(1);
		await expect(page.getByText('Overlay timeline note 15', { exact: true })).toBeVisible();
		if (await page.getByText('Overlay timeline note 0', { exact: true }).count() === 0) {
			await scrollable.getByRole('button', { name: /Load more/ }).click();
		}
		await expect(page.getByText('Overlay timeline note 0', { exact: true })).toBeVisible();
		const [viewport, overlay] = await Promise.all([scrollable.boundingBox(), menu.boundingBox()]);
		expect(viewport).not.toBeNull();
		expect(overlay).not.toBeNull();
		expect(viewport!.y + viewport!.height).toBeGreaterThan(overlay!.y);
		await expect.poll(() => scrollable.evaluate(el => el.scrollHeight - el.clientHeight), { message: 'The timeline must have scrollable history' }).toBeGreaterThan(0);
		await scrollPage(page, scrollable, 100_000);
		await expect.poll(() => scrollable.evaluate(el => el.scrollTop + el.clientHeight >= el.scrollHeight - 1)).toBe(true);
		const oldestNote = page.locator('article').filter({ has: page.getByText('Overlay timeline note 0', { exact: true }) });
		const reply = oldestNote.getByRole('button').filter({ has: page.locator('.ti-arrow-back-up') });
		await expectMenuCoverage(oldestNote, menu);
		await reply.click();
		await expect(page.getByTestId('post-form-text')).toBeVisible();
	});

	test('hides the mobile menu while scrolling and restores it at the top', async ({ page }) => {
		for (let i = 0; i < 16; i++) {
			await postTimelineNote(page, `Scroll timeline note ${i}`);
		}
		await configureLayout(page, { hideNavFooter: true, animation: false });
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');
		const menu = mobileMenu(page);
		const scrollable = page.locator('._pageScrollable');
		await expect(page.getByText('Scroll timeline note 15', { exact: true })).toBeVisible();
		await expect(menu).toBeVisible();
		await expect.poll(() => scrollable.evaluate(el => el.scrollHeight - el.clientHeight), { message: 'The timeline must have enough history for two scroll gestures' }).toBeGreaterThan(750);
		await scrollPage(page, scrollable, 350);
		await expect.poll(() => scrollable.evaluate(el => el.scrollTop)).toBeGreaterThanOrEqual(350);
		await scrollPage(page, scrollable, 400);
		await expect(menu).toBeHidden();
		await scrollPage(page, scrollable, -100_000);
		await expect.poll(() => scrollable.evaluate(el => el.scrollTop)).toBe(0);
		await expect(menu).toBeVisible();
	});

	for (const hide of [false, true]) {
		test(`scrolls a Pages article to its actions and back with ${hide ? 'autohiding' : 'fixed'} mobile menu`, async ({ page }) => {
			const path = await createLongArticle(page);
			await configureLayout(page, { hideNavFooter: hide, animation: false });
			await page.setViewportSize({ width: 390, height: 844 });
			await page.goto(path);
			const heading = page.getByRole('heading', { name: 'Scrolling article', exact: true }).and(page.locator('h1:not([title])'));
			await expect(heading).toBeVisible();
			const scrollable = page.locator('._pageScrollable');
			await expectMenuScrollBehavior(page, scrollable, hide);
			await scrollPage(page, scrollable, 100_000);
			await expect.poll(() => scrollable.evaluate(el => el.scrollTop + el.clientHeight >= el.scrollHeight - 1)).toBe(true);
			const actions = scrollable.getByRole('button').filter({ has: page.locator('.ti-dots') });
			await expectMenuCoverage(actions, mobileMenu(page));
			await actions.click();
			await expect(page.getByRole('menuitem', { name: /Pin to profile$/ })).toBeVisible();
			await page.keyboard.press('Escape');
			await expectScrollRestoredAtTop(page, scrollable);
			await expect(heading).toBeInViewport();
		});

		test(`scrolls configuration to its last link and back with ${hide ? 'autohiding' : 'fixed'} mobile menu`, async ({ page }) => {
			await configureLayout(page, { hideNavFooter: hide, animation: false });
			await page.setViewportSize({ width: 390, height: 844 });
			await page.goto('/settings/profile');
			const scrollable = page.locator('._pageScrollable');
			await expect(page.getByRole('button', { name: 'Change banner', exact: true })).toBeVisible();
			await expectMenuScrollBehavior(page, scrollable, hide);
			await scrollPage(page, scrollable, 100_000);
			await expect.poll(() => scrollable.evaluate(el => el.scrollTop + el.clientHeight >= el.scrollHeight - 1)).toBe(true);
			const qr = scrollable.getByRole('link').and(page.locator('a[href="/qr"]'));
			await expectMenuCoverage(qr, mobileMenu(page));
			await expectScrollRestoredAtTop(page, scrollable);
			await expect(page.getByRole('button', { name: 'Change banner', exact: true })).toBeInViewport();
			await scrollPage(page, scrollable, 100_000);
			await qr.click();
			await expect(page).toHaveURL(/\/qr$/);
		});

		test(`scrolls reversed chat history and returns to the composer with ${hide ? 'autohiding' : 'fixed'} menu preference`, async ({ page }) => {
			await configureLayout(page, { hideNavFooter: hide, animation: false });
			await page.goto('/chat');
			await page.getByRole('button', { name: /Start chat$/ }).click();
			await page.getByRole('menuitem', { name: /Room Chat/ }).click();
			const dialog = page.getByTestId('chat-room-editor');
			await dialog.getByTestId('chat-room-name').getByRole('textbox').fill('Scroll history room');
			const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/chat/rooms/create');
			await dialog.getByRole('button', { name: 'Create', exact: true }).click();
			expect((await created).status()).toBe(200);
			await page.setViewportSize({ width: 390, height: 844 });
			const composer = page.getByPlaceholder('Enter message here', { exact: true });
			const send = page.getByTitle('Send', { exact: true });
			for (let i = 0; i < 18; i++) {
				await composer.fill(`Chat scrolling message ${i}`);
				const sent = page.waitForResponse(response => new URL(response.url()).pathname === '/api/chat/messages/create-to-room');
				await send.click();
				expect((await sent).status()).toBe(200);
				await expect(composer).toHaveValue('');
			}
			const scrollable = page.locator('._pageScrollableReversed');
			await expect(mobileMenu(page)).toHaveCount(0);
			await expect.poll(() => scrollable.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
			await scrollPage(page, scrollable, -100_000);
			await expect.poll(() => scrollable.evaluate(el => Math.abs(el.scrollTop + el.scrollHeight - el.clientHeight) <= 1)).toBe(true);
			await expect(page.getByText('Chat scrolling message 0', { exact: true })).toBeInViewport();
			await scrollPage(page, scrollable, 100_000);
			await expect.poll(() => scrollable.evaluate(el => Math.abs(el.scrollTop))).toBeLessThanOrEqual(1);
			await expect(page.getByText('Chat scrolling message 17', { exact: true })).toBeInViewport();
			await expectMenuCoverage(composer, mobileMenu(page));
			await expectMenuCoverage(send, mobileMenu(page));
			await composer.fill('Message after scrolling');
			const sent = page.waitForResponse(response => new URL(response.url()).pathname === '/api/chat/messages/create-to-room');
			await send.click();
			expect((await sent).status()).toBe(200);
			await expect(page.getByText('Message after scrolling', { exact: true })).toBeInViewport();
			await expect(mobileMenu(page)).toHaveCount(0);
		});
	}

	test('keeps the Drive bulk-move control usable above the mobile menu', async ({ page }) => {
		await configureLayout(page, { hideNavFooter: false, animation: false });
		await page.goto('/my/drive');
		const scrollable = page.locator('._pageScrollable');
		await expect(scrollable).toHaveCount(1);
		const driveMenu = scrollable.locator('nav').getByRole('button');
		await driveMenu.click();
		const chooser = page.waitForEvent('filechooser');
		await page.getByRole('menuitem', { name: /Upload$/ }).click();
		const uploaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/drive/files/create');
		await (await chooser).setFiles({ name: 'overlay-reachability.txt', mimeType: 'text/plain', buffer: Buffer.from('Mobile Drive reachability') });
		await page.getByRole('button', { name: /(?:^|\s)Upload$/ }).click();
		expect((await uploaded).status()).toBe(200);
		const file = page.getByTitle(/^overlay-reachability\.txt\n/);
		await expect(file).toHaveCount(1);
		await file.click({ modifiers: ['Shift'] });
		await page.setViewportSize({ width: 390, height: 844 });
		const menu = mobileMenu(page);
		const move = page.getByRole('button', { name: /Move\.\.\.$/ });
		await expectMenuCoverage(move, menu);
		await move.click();
		await expect(page.getByRole('button', { name: /(?:^|\s)Select a folder$/ })).toBeVisible();
	});
});

test('keeps the last control-panel menu entry reachable above the floating mobile menu', async ({ page, baseURL }) => {
	if (baseURL == null) throw new Error('A Playwright baseURL is required');
	await resetState(baseURL);
	await registerUser(baseURL, 'admin', 'admin1234', true);
	await signIn(page, baseURL, 'admin', 'admin1234');
	const setupSaved = page.waitForResponse(response =>
		new URL(response.url()).pathname === '/api/i/registry/set'
		&& response.request().postDataJSON()?.key === 'accountSetupWizard');
	await closeUserSetupDialog(page);
	expect((await setupSaved).status()).toBe(204);
	await expect(page.getByTestId('user-setup-dialog')).toBeHidden();
	await configureLayout(page, { hideNavFooter: false, animation: false });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/admin');
	const database = page.getByRole('link').and(page.locator('a[href="/admin/database"]'));
	await expect(database).toHaveCount(1);
	const scrollable = page.locator('._pageContainer:has(> .hiyeyicy)');
	await expect(mobileMenu(page)).toBeVisible();
	await expect.poll(() => scrollable.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
	await scrollPage(page, scrollable, 100_000);
	await expect.poll(() => scrollable.evaluate(el => el.scrollTop + el.clientHeight >= el.scrollHeight - 1)).toBe(true);
	await expectMenuCoverage(database, mobileMenu(page));
	await database.click();
	await expect(page).toHaveURL(/\/admin\/database$/);
});

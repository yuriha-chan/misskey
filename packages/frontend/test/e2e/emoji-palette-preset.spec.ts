/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.js';
import { api } from './shared.js';
import { BASE_URL, closeUserSetupDialog, registerUser, signIn } from './utils.js';
import type { RegisteredUser } from './utils.js';

const recommendationLabel = 'おすすめの絵文字パレット';
const paletteStepLabel = '絵文字パレット初期設定';

test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } });

async function dismissSetup(page: Page) {
	await expect(page.getByTestId('user-setup-dialog').getByTestId('user-setup-continue')).toBeVisible();
	const saved = wizardSaved(page, -1);
	await closeUserSetupDialog(page);
	await saved;
	await expect(page.getByTestId('user-setup-dialog')).toHaveCount(0);
}

function wizardSaved(page: Page, value: number) {
	return page.waitForResponse(response => {
		if (!response.url().endsWith('/api/i/registry/set') || response.status() !== 204) return false;
		const body = response.request().postDataJSON();
		return body.key === 'accountSetupWizard' && body.value === value;
	});
}

async function reachR18Step(page: Page) {
	const dialog = page.getByTestId('user-setup-dialog');
	await expect(dialog.getByTestId('user-setup-continue')).toBeVisible();
	await dialog.getByTestId('user-setup-continue').click();
	await expect(dialog.getByTestId('user-setup-user-name')).toBeVisible();
	await dialog.getByTestId('user-setup-continue').click();
	await expect(dialog.getByTestId('user-setup-user-name')).toHaveCount(0);
	await expect(dialog.getByRole('button', { name: /Follow requests require approval/ })).toBeVisible();
	const saved = wizardSaved(page, 3);
	await dialog.getByTestId('user-setup-continue').click();
	await expect(dialog.getByTestId('radio-over18')).toHaveCount(1);
	await expect(dialog.getByTestId('user-setup-continue')).toBeDisabled();
	await saved;
	return dialog;
}

async function reachPaletteStep(page: Page, adult = true) {
	const dialog = await reachR18Step(page);
	await dialog.locator(`label[for="${adult ? 'r18-over18' : 'r18-under17'}"]`).first().click();
	await expect(dialog.getByTestId(adult ? 'radio-over18' : 'radio-under17')).toBeChecked();
	await dialog.getByTestId('user-setup-continue').click();
	return dialog;
}

async function finishSetup(page: Page) {
	const dialog = page.getByTestId('user-setup-dialog');
	await expect(dialog.locator('.ti-user-plus')).toBeVisible();
	await expect(dialog.getByTestId('folder-header').filter({ hasText: 'Recommended' })).toBeVisible();
	await dialog.getByTestId('user-setup-continue').click();
	await expect(dialog.locator('.ti-bell-ringing-2')).toBeVisible();
	await dialog.getByTestId('user-setup-continue').click();
	await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
	const saved = wizardSaved(page, -1);
	await dialog.getByRole('button', { name: 'Close', exact: true }).click();
	await saved;
	await expect(dialog).toHaveCount(0);
}

test.describe('Recommended emoji palettes', () => {
	let admin: RegisteredUser;
	let username: string;
	let flaggedNote: { id: string; text: string };

	test.beforeAll(async () => {
		admin = await registerUser('admin', 'pass', true);
		await api(BASE_URL, 'admin/update-meta', { i: admin.token, r18Filter: ['palette-r18-probe'] });
		flaggedNote = (await api(BASE_URL, 'notes/create', { i: admin.token, text: 'palette-r18-probe' })).createdNote;
		expect((await api(BASE_URL, 'notes/show', { i: admin.token, noteId: flaggedNote.id })).isR18).toBe(true);
	});

	test.afterAll(async () => {
		if (admin) await api(BASE_URL, 'admin/update-meta', { i: admin.token, r18Filter: [], recommendedEmojiPalettes: [] });
	});

	test.beforeEach(async () => {
		username = `palette_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
		await registerUser(username, 'alice1234');
		await api(BASE_URL, 'admin/update-meta', { i: admin.token, recommendedEmojiPalettes: [] });
	});

	test('admin edits and an onboarding selection persist after reload', async ({ page }) => {
		await api(BASE_URL, 'admin/update-meta', {
			i: admin.token,
			recommendedEmojiPalettes: [
				{ name: 'Woodland', emojis: ['😺', '🦊'] },
				{ name: 'Ocean', emojis: ['🐙', '🐬'] },
			],
		});
		await signIn(page, 'admin', 'pass');
		await dismissSetup(page);
		await page.goto('/admin/settings');
		await page.getByTestId('folder-header').filter({ hasText: recommendationLabel }).click();
		const editor = page.getByTestId('folder-header').filter({ hasText: /^Woodland$/ }).locator('xpath=ancestor::*[@role="group"][1]');
		await expect(editor).toHaveCount(1);
		const otherEditor = page.getByTestId('folder-header').filter({ hasText: /^Ocean$/ }).locator('xpath=ancestor::*[@role="group"][1]');
		await expect(otherEditor).toHaveCount(1);
		await editor.getByRole('button', { name: /Rename$/ }).click();
		await page.getByTestId('modal-dialog-ok').locator('xpath=ancestor::div[descendant::input][1]').getByRole('textbox').fill('Forest friends');
		await page.getByTestId('modal-dialog-ok').click();
		const saved = page.waitForResponse(response => response.url().endsWith('/api/admin/update-meta') && response.status() === 204);
		await page.getByRole('button', { name: /Save$/ }).click();
		await saved;
		await page.reload();
		await page.getByTestId('folder-header').filter({ hasText: recommendationLabel }).click();
		await expect(page.getByTestId('folder-header').filter({ hasText: /^Forest friends$/ })).toBeVisible();
		await expect(page.locator('[alt="🦊"]')).toBeVisible();
		await expect(otherEditor).toBeVisible();
		await expect(otherEditor.locator('[alt="🐙"]')).toBeVisible();
		await expect(otherEditor.locator('[alt="🐬"]')).toBeVisible();
		const meta = await api(BASE_URL, 'meta', {});
		expect(meta.recommendedEmojiPalettes).toEqual([
			{ name: 'Forest friends', emojis: ['😺', '🦊'] },
			{ name: 'Ocean', emojis: ['🐙', '🐬'] },
		]);

		await page.context().clearCookies();
		await page.evaluate(() => localStorage.clear());
		await signIn(page, username, 'alice1234');
		const dialog = await reachPaletteStep(page);
		await expect(dialog.getByText(paletteStepLabel, { exact: true })).toBeVisible();
		await dialog.getByRole('button', { name: /Forest friends/ }).click();
		await dialog.getByRole('button', { name: /Ocean/ }).click();
		const progressSaved = wizardSaved(page, 4);
		await dialog.getByTestId('user-setup-back').click();
		await expect(dialog.getByTestId('radio-over18')).toBeChecked();
		await dialog.getByTestId('user-setup-continue').click();
		await progressSaved;
		await page.reload();
		await expect(dialog.getByText(paletteStepLabel, { exact: true })).toBeVisible();
		await expect(dialog.getByRole('button', { name: /Forest friends/ })).toBeVisible();
		await dialog.getByTestId('user-setup-continue').click();
		await finishSetup(page);
		await page.goto('/settings/emoji-palette');
		await expect(page.getByRole('button', { name: /Rename$/ })).toHaveCount(1);
		await expect(page.locator('[alt="🐙"]')).toBeVisible();
		await expect(page.locator('[alt="🐬"]')).toBeVisible();
		await expect(page.locator('[alt="😺"]')).toHaveCount(0);
		await expect(page.locator('[alt="🦊"]')).toHaveCount(0);
		await page.reload();
		await expect(page.locator('[alt="🐙"]')).toBeVisible();
		await expect(page.locator('[alt="🐬"]')).toBeVisible();
		await expect(page.locator('[alt="😺"]')).toHaveCount(0);
		await expect(page.locator('[alt="🦊"]')).toHaveCount(0);
		await page.goto(`/notes/${flaggedNote.id}`);
		await expect(page.getByRole('article').filter({ has: page.locator(`footer a[href="/notes/${flaggedNote.id}"]`) }).getByText(flaggedNote.text, { exact: true })).toBeVisible();
	});

	test('wide emojis fit their tiles and wrap inside the palette card', async ({ page, request }) => {
		const names: string[] = [];
		for (const width of [160, 1600]) {
			const image = await page.evaluate((imageWidth) => {
				const canvas = document.createElement('canvas');
				canvas.width = imageWidth;
				canvas.height = 32;
				const context = canvas.getContext('2d')!;
				context.fillStyle = 'green';
				context.fillRect(0, 0, imageWidth, 32);
				return canvas.toDataURL('image/png').split(',')[1];
			}, width);
			const upload = await request.post(`${BASE_URL}/api/drive/files/create`, {
				multipart: {
					i: admin.token,
					file: { name: `wide-${width}.png`, mimeType: 'image/png', buffer: Buffer.from(image, 'base64') },
				},
			});
			expect(upload.ok()).toBeTruthy();
			const file = await upload.json();
			const name = `wide_${width}_${randomUUID().replaceAll('-', '')}`;
			await api(BASE_URL, 'admin/emoji/add', { i: admin.token, fileId: file.id, name });
			names.push(name);
		}
		await api(BASE_URL, 'admin/update-meta', {
			i: admin.token,
			recommendedEmojiPalettes: [{ name: 'Wide emojis', emojis: ['😺', ...names.map(name => `:${name}:`)] }],
		});
		await signIn(page, username, 'alice1234');
		const dialog = await reachPaletteStep(page);
		const card = dialog.getByRole('button', { name: /Wide emojis/ });
		await expect(card).toBeVisible();
		for (const width of [390, 1280]) {
			await page.setViewportSize({ width, height: 844 });
			await expect.poll(async () => card.locator('img').evaluateAll(images => {
				return images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0);
			})).toBe(true);
			const layout = await card.evaluate(element => {
				const images = Array.from(element.querySelectorAll('img'));
				return images.map(image => {
					const rect = image.getBoundingClientRect();
					const tile = image.parentElement!.getBoundingClientRect();
					const grid = image.parentElement!.parentElement!.getBoundingClientRect();
					return {
						width: rect.width, height: rect.height, tileWidth: tile.width, top: tile.top,
						contained: rect.left >= tile.left && rect.right <= tile.right && tile.left >= grid.left && tile.right <= grid.right,
						objectFit: getComputedStyle(image).objectFit,
					};
				});
			});
			expect(layout).toHaveLength(3);
			expect(layout.every(image => image.contained)).toBe(true);
			expect(layout[1].tileWidth).toBeGreaterThan(layout[0].tileWidth);
			expect(layout[1].width / layout[1].height).toBeCloseTo(5, 1);
			expect(layout[2].objectFit).toBe('contain');
			expect(layout[2].top).toBeGreaterThan(layout[1].top);
		}
		await card.click();
		await dialog.getByTestId('user-setup-continue').click();
		await finishSetup(page);
	});

	test('no recommendations keeps the ordinary onboarding sequence', async ({ page }) => {
		await signIn(page, username, 'alice1234');
		await page.getByTestId('user-setup-dialog').getByRole('button', { name: 'Later', exact: true }).click();
		const deferred = wizardSaved(page, 0);
		await page.getByTestId('modal-dialog-ok').click();
		await deferred;
		await expect(page.getByTestId('user-setup-dialog')).toHaveCount(0);
		await page.reload();
		const dialog = await reachPaletteStep(page, false);
		await expect(dialog.locator('.ti-user-plus')).toBeVisible();
		await expect(dialog.getByText(paletteStepLabel, { exact: true })).toHaveCount(0);
		await finishSetup(page);
		await page.reload();
		await expect(page.getByTestId('open-post-form')).toBeVisible();
		await expect(dialog).toHaveCount(0);
		await page.goto(`/notes/${flaggedNote.id}`);
		await expect(page.getByText('このノートは成人向けの内容を含むため、表示しません。', { exact: true })).toBeVisible();
		await expect(page.getByRole('article').filter({ has: page.locator(`footer a[href="/notes/${flaggedNote.id}"]`) })).toHaveCount(0);
	});

	test('resumes the R18 step and returns through privacy without saving an age choice', async ({ page }) => {
		await signIn(page, username, 'alice1234');
		const dialog = await reachR18Step(page);
		await dialog.locator('label[for="r18-over18"]').first().click();
		await expect(dialog.getByTestId('radio-over18')).toBeChecked();
		await page.reload();
		await expect(dialog.getByTestId('radio-over18')).not.toBeChecked();
		await expect(dialog.getByTestId('radio-under17')).not.toBeChecked();
		await expect(dialog.getByTestId('user-setup-continue')).toBeDisabled();
		const privacySaved = wizardSaved(page, 2);
		await dialog.getByTestId('user-setup-back').click();
		await expect(dialog.getByRole('button', { name: /Follow requests require approval/ })).toBeVisible();
		await privacySaved;
		const r18Saved = wizardSaved(page, 3);
		await dialog.getByTestId('user-setup-continue').click();
		await expect(dialog.getByTestId('radio-under17')).toHaveCount(1);
		await expect(dialog.getByTestId('user-setup-continue')).toBeDisabled();
		await r18Saved;
		await dialog.locator('label[for="r18-under17"]').first().click();
		await expect(dialog.getByTestId('radio-under17')).toBeChecked();
		await dialog.getByTestId('user-setup-continue').click();
		await expect(dialog.getByText(paletteStepLabel, { exact: true })).toHaveCount(0);
		await finishSetup(page);
		await page.reload();
		await expect(page.getByTestId('open-post-form')).toBeVisible();
		await expect(dialog).toHaveCount(0);
		await page.goto(`/notes/${flaggedNote.id}`);
		await expect(page.getByText('このノートは成人向けの内容を含むため、表示しません。', { exact: true })).toBeVisible();
		await expect(page.getByRole('article').filter({ has: page.locator(`footer a[href="/notes/${flaggedNote.id}"]`) })).toHaveCount(0);
	});
});

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

async function reachPaletteStep(page: Page) {
	const dialog = page.getByTestId('user-setup-dialog');
	await expect(dialog.getByTestId('user-setup-continue')).toBeVisible();
	await dialog.getByTestId('user-setup-continue').click();
	await expect(dialog.getByTestId('user-setup-user-name')).toBeVisible();
	await dialog.getByTestId('user-setup-continue').click();
	await expect(dialog.getByTestId('user-setup-user-name')).toHaveCount(0);
	await expect(dialog.getByRole('button', { name: /Follow requests require approval/ })).toBeVisible();
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

	test.beforeAll(async () => {
		admin = await registerUser('admin', 'pass', true);
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
		const progressSaved = wizardSaved(page, 3);
		await dialog.getByTestId('user-setup-back').click();
		await expect(dialog.getByRole('button', { name: /Follow requests require approval/ })).toBeVisible();
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
	});

	test('no recommendations keeps the ordinary onboarding sequence', async ({ page }) => {
		await signIn(page, username, 'alice1234');
		const dialog = await reachPaletteStep(page);
		await expect(dialog.locator('.ti-user-plus')).toBeVisible();
		await expect(dialog.getByText(paletteStepLabel, { exact: true })).toHaveCount(0);
		await finishSetup(page);
		await page.reload();
		await expect(page.getByTestId('open-post-form')).toBeVisible();
		await expect(dialog).toHaveCount(0);
	});
});

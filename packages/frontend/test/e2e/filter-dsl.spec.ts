/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.js';
import { api, registerUser, signIn, locateMkSwitch, setupTestAdmin } from './shared.js';
import type { RegisteredUser } from './shared.js';

const baseUrl = 'http://localhost:61812';
const hiddenMessage = 'このノートは成人向けの内容を含むため、表示しません。';
const hideLabel = '成人向けコンテンツを完全に非表示にする';
const marker = `dsl${Date.now().toString(36)}`;
test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } });
let admin: RegisteredUser;
let author: RegisteredUser;
let flagged: { id: string; text: string };
let control: { id: string; text: string };

async function openConsent(page: Page) {
	await page.goto(`${baseUrl}/settings/preferences`);
	await page.getByText('タイムラインとノート', { exact: true }).click();
	await page.getByRole('button', { name: hideLabel }).click();
	const dialog = page.getByTestId('r18-consent-dialog');
	await expect(dialog.getByTestId('modal-window-close')).toBeVisible();
	await expect(dialog.getByRole('button', { name: '完了' })).toBeDisabled();
	return dialog;
}

async function assertFiltered(page: Page, hidden: boolean) {
	await page.goto(`${baseUrl}/notes/${control.id}`);
	await expect(noteArticle(page, control.id, true)).toBeVisible();
	await expect(noteArticle(page, control.id, true).getByText('safe', { exact: true })).toBeVisible();
	await page.goto(`${baseUrl}/notes/${flagged.id}`);
	if (hidden) {
		await expect(page.getByText(hiddenMessage, { exact: true })).toBeVisible();
		await expect(noteArticle(page, flagged.id)).toHaveCount(0);
	} else {
		await expect(noteArticle(page, flagged.id, true).getByText(flagged.text, { exact: true })).toBeVisible();
	}
	await page.goto(`${baseUrl}/@${marker}/notes`);
	await expect(noteArticle(page, control.id)).toBeVisible();
	const flaggedNote = noteArticle(page, flagged.id);
	if (hidden) await expect(flaggedNote).toHaveCount(0);
	else await expect(flaggedNote).toBeVisible();
}

function noteArticle(page: Page, id: string, detailed = false) {
	return page.getByRole('article').filter({ has: page.locator(`${detailed ? 'footer ' : ''}a[href="/notes/${id}"]`) });
}

test.describe('Filter DSL R18 visibility and consent', () => {
	test.beforeAll(async () => {
		admin = await setupTestAdmin(baseUrl, `${marker}admin`, 'test-password');
		author = await registerUser(baseUrl, marker, 'test-password');
		await api(baseUrl, 'admin/update-meta', { i: admin.token, r18Filter: [`(and (text ${marker}) (not (cw safe)))`] });
		flagged = (await api(baseUrl, 'notes/create', { i: author.token, text: `${marker} flagged` })).createdNote;
		control = (await api(baseUrl, 'notes/create', { i: author.token, text: `${marker} control`, cw: 'safe' })).createdNote;
		expect((await api(baseUrl, 'notes/show', { i: author.token, noteId: flagged.id })).isR18).toBe(true);
		expect((await api(baseUrl, 'notes/show', { i: author.token, noteId: control.id })).isR18).not.toBe(true);
	});

	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => localStorage.setItem('lang', 'ja-JP'));
	});

	test.afterAll(async () => {
		if (admin) await api(baseUrl, 'admin/update-meta', { i: admin.token, r18Filter: [] });
	});

	test('default hiding, cancellation, adult save, reload, and underage save', async ({ page }) => {
		const username = `${marker}reader`;
		const reader = await registerUser(baseUrl, username, 'test-password');
		await api(baseUrl, 'i/registry/set', { i: reader.token, scope: ['client', 'base'], key: 'accountSetupWizard', value: -1 });
		await signIn(page, baseUrl, username, 'test-password');
		await expect(page.getByTestId('open-post-form')).toBeVisible();
		await assertFiltered(page, true);

		let dialog = await openConsent(page);
		await dialog.locator('label[for="r18-over18"]').first().click();
		await expect(dialog.getByTestId('radio-over18')).toBeChecked();
		const hiddenSwitchClass = await locateMkSwitch(page, 'r18-hide-content').getAttribute('class');
		expect(hiddenSwitchClass).not.toBeNull();
		await locateMkSwitch(page, 'r18-hide-content').click();
		await expect(locateMkSwitch(page, 'r18-hide-content')).not.toHaveClass(hiddenSwitchClass!);
		await dialog.getByTestId('modal-window-close').click();
		await expect(dialog).toHaveCount(0);
		await page.reload();
		await assertFiltered(page, true);

		dialog = await openConsent(page);
		await dialog.locator('label[for="r18-over18"]').first().click();
		await expect(locateMkSwitch(page, 'r18-hide-content')).toHaveClass(hiddenSwitchClass!);
		await locateMkSwitch(page, 'r18-hide-content').click();
		await dialog.getByRole('button', { name: '完了' }).click();
		await expect(dialog).toHaveCount(0);
		await page.reload();
		await assertFiltered(page, false);

		dialog = await openConsent(page);
		await dialog.locator('label[for="r18-under17"]').first().click();
		await expect(dialog.getByTestId('radio-under17')).toBeChecked();
		await dialog.getByRole('button', { name: '完了' }).click();
		await expect(dialog).toHaveCount(0);
		await page.reload();
		await assertFiltered(page, true);
	});

	test('visitor document context hides a flagged note but renders the control', async ({ page }) => {
		const response = await page.goto(`${baseUrl}/notes/${flagged.id}`);
		expect(response?.ok()).toBe(true);
		const context = await page.locator('#misskey_clientCtx').textContent();
		expect(JSON.parse(context ?? '{}').note.isR18).toBe(true);
		await expect(page.getByText(hiddenMessage, { exact: true })).toBeVisible();
		await expect(noteArticle(page, flagged.id)).toHaveCount(0);
		await page.goto(`${baseUrl}/notes/${control.id}`);
		await expect(noteArticle(page, control.id, true)).toBeVisible();
		await expect(noteArticle(page, control.id, true).getByText('safe', { exact: true })).toBeVisible();
	});
});

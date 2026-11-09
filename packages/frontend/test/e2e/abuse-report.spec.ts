/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures.js';
import { api, registerUser, setupTestAdmin, signIn } from './shared.js';

const BASE_URL = 'http://localhost:61812';
const password = 'abuse-report-password';
const marker = Date.now().toString(36);
const reporterUsername = `abuse${marker}`;
const targetUsername = `abuset${marker}`;
const reportCompletedText = 'Your report has been sent. Thank you very much :)';

interface AbuseReport {
	id: string;
	comment: string;
	resolvedAs: 'accept' | 'reject' | null;
	assigneeId: string | null;
}

const cases = [
	{ reasonLabel: 'Spam', reasonValue: 'spam', resolvedAs: 'accept' as const, resolvedIcon: 'ti-check', resolveAction: 'Accept', saveModerationNote: true },
	{ reasonLabel: 'Technical help needed', reasonValue: 'technical', resolvedAs: 'reject' as const, resolvedIcon: 'ti-x', resolveAction: 'Reject', saveModerationNote: false },
	{ reasonLabel: 'I observed ethically outstanding conduct', reasonValue: 'ethical', resolvedAs: null, resolvedIcon: 'ti-slash', resolveAction: 'Other', saveModerationNote: false },
];

let reporter: { id: string; token: string };
let target: { id: string; token: string };
let admin: { id: string; token: string };
let noteId: string;
let noteText: string;
let noteUrl: string;

test.use({
	baseURL: BASE_URL,
	launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
		? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
		: {},
});

test.beforeAll(async () => {
	admin = await setupTestAdmin(BASE_URL, 'admin', 'pass');
	reporter = await registerUser(BASE_URL, reporterUsername, password);
	target = await registerUser(BASE_URL, targetUsername, password);
	await api(BASE_URL, 'i/registry/set', {
		i: reporter.token, key: 'accountSetupWizard', value: -1, scope: ['client', 'base'],
	});
	await api(BASE_URL, 'i/registry/set', {
		i: admin.token, key: 'accountSetupWizard', value: -1, scope: ['client', 'base'],
	});
	noteText = `Abuse report target note ${marker}`;
	const created = await api(BASE_URL, 'notes/create', {
		i: target.token,
		text: noteText,
		visibility: 'public',
	});
	noteId = created.createdNote.id;
	noteUrl = `${BASE_URL}/notes/${noteId}`;
});

function storedAccountId(page: Page): Promise<string | null> {
	return page.evaluate(() => {
		const saved = localStorage.getItem('account');
		if (saved == null) return null;
		return (JSON.parse(saved) as { id: string }).id;
	});
}

function selectByLabel(page: Page, label: string): Locator {
	return page.getByText(label, { exact: true }).locator('..').locator('[tabindex="0"]');
}

async function signInReporter(page: Page): Promise<void> {
	await page.addInitScript(() => localStorage.setItem('lang', 'en-US'));
	await signIn(page, BASE_URL, reporterUsername, password);
	await expect.poll(() => storedAccountId(page)).toBe(reporter.id);
	await expect(page.getByTestId('open-post-form')).toBeVisible();
}

async function submitReport(page: Page, reasonLabel: string, reasonValue: string, commentToken: string): Promise<string> {
	await page.goto(noteUrl);
	const article = page.locator('article').filter({ hasText: noteText }).first();
	await expect(article).toBeVisible();
	await expect(article.getByText(noteText, { exact: true })).toBeVisible();

	const menuButton = article.locator('footer button').filter({ has: page.locator('.ti-dots') });
	await expect(menuButton).toHaveCount(1);
	await menuButton.click();
	await page.getByRole('menuitem', { name: /Contact admin$/ }).click();

	const textarea = page.locator('textarea');
	await expect(textarea).toBeVisible();
	await expect(textarea).toHaveValue(`Local Note: ${noteUrl}\n-----\n`);

	const sendButton = page.getByRole('button', { name: 'Send', exact: true });
	await textarea.fill('');
	await expect(sendButton).toBeDisabled();

	const comment = `${commentToken}\n${noteUrl}`;
	await textarea.fill(comment);
	await expect(sendButton).toBeEnabled();

	const reasonSelect = selectByLabel(page, 'Choose reason');
	await reasonSelect.click();
	await page.getByRole('menuitem', { name: reasonLabel, exact: true }).click();

	const responsePromise = page.waitForResponse((response) => {
		return response.url().endsWith('/api/users/report-abuse') && response.request().method() === 'POST';
	});
	await sendButton.click();
	const response = await responsePromise;
	expect(response.status()).toBe(204);
	expect(response.request().postDataJSON()).toMatchObject({
		userId: target.id,
		reason: reasonValue,
		comment,
	});

	await expect(page.getByText(reportCompletedText, { exact: true })).toBeVisible();
	await page.getByTestId('modal-dialog-ok').click();
	await expect(page.locator('textarea')).toHaveCount(0);

	return comment;
}

async function findReportGroup(page: Page, commentToken: string): Promise<{ header: Locator; group: Locator }> {
	const header = page.getByTestId('folder-header').filter({ hasText: commentToken });
	await expect(header).toHaveCount(1);
	const group = header.locator('xpath=ancestor::*[@role="group"][1]');
	return { header, group };
}

async function saveModerationNote(page: Page, group: Locator, reportId: string, moderationNote: string): Promise<void> {
	const moderationHeader = group.getByTestId('folder-header').filter({ hasText: 'Moderation note' });
	await expect(moderationHeader).toBeVisible();
	await moderationHeader.click();
	const moderationGroup = moderationHeader.locator('xpath=ancestor::*[@role="group"][1]');
	const textarea = moderationGroup.locator('textarea');
	await expect(textarea).toBeVisible();
	await textarea.fill(moderationNote);

	const saveButton = moderationGroup.getByRole('button', { name: /Save$/ });
	await expect(saveButton).toBeVisible();
	const responsePromise = page.waitForResponse((response) => {
		return response.url().endsWith('/api/admin/update-abuse-user-report') && response.status() === 204;
	});
	await saveButton.click();
	const response = await responsePromise;
	expect(response.request().postDataJSON()).toMatchObject({ reportId, moderationNote });
}

for (const testCase of cases) {
	test(`reporter files a ${testCase.reasonValue} report and admin resolves it as ${testCase.resolveAction}`, async ({ page, browser }) => {
		await signInReporter(page);
		const commentToken = `abuse-report-${marker}-${testCase.reasonValue}`;
		const comment = await submitReport(page, testCase.reasonLabel, testCase.reasonValue, commentToken);

		const adminContext = await browser.newContext({ locale: 'en-US' });
		try {
			await adminContext.addInitScript(() => {
				localStorage.setItem('lang', 'en-US');
				(window as unknown as { isPlaywright?: boolean }).isPlaywright = true;
			});
			const adminPage = await adminContext.newPage();
			await signIn(adminPage, BASE_URL, 'admin', 'pass');
			await expect.poll(() => storedAccountId(adminPage)).toBe(admin.id);
			await expect(adminPage.getByTestId('open-post-form')).toBeVisible();
			await adminPage.goto(`${BASE_URL}/admin/abuses`);

			let { header, group } = await findReportGroup(adminPage, commentToken);
			await expect(group).toContainText(`@${targetUsername}`);
			await expect(group).toContainText(`@${reporterUsername}`);
			await expect(header).toContainText(testCase.reasonLabel);
			await header.click();
			await expect(group.getByTestId('folder-header').filter({ hasText: 'Moderation note' })).toBeVisible();
			await expect(group.getByRole('button', { name: /Forward/ })).toHaveCount(0);

			const reports = await api(BASE_URL, 'admin/abuse-user-reports', {
				i: admin.token, limit: 100, state: 'unresolved',
			}) as AbuseReport[];
			const report = reports.find((item) => item.comment === comment);
			if (report == null) throw new Error('Report was not returned by the admin API');

			if (testCase.saveModerationNote) {
				const moderationNote = `Moderation note ${marker}`;
				await saveModerationNote(adminPage, group, report.id, moderationNote);

				const reloadResponse = adminPage.waitForResponse((response) => {
					if (!response.url().endsWith('/api/admin/abuse-user-reports') || response.status() !== 200) return false;
					return response.request().postDataJSON()?.state === 'unresolved';
				});
				await adminPage.reload();
				await reloadResponse;
				({ header, group } = await findReportGroup(adminPage, commentToken));
				await header.click();
				const reloadedModerationHeader = group.getByTestId('folder-header').filter({ hasText: 'Moderation note' });
				await expect(reloadedModerationHeader).toBeVisible();
				await reloadedModerationHeader.click();
				const reloadedModerationGroup = reloadedModerationHeader.locator('xpath=ancestor::*[@role="group"][1]');
				await expect(reloadedModerationGroup.locator('textarea')).toHaveValue(moderationNote);
			}

			const resolveButton = group.getByRole('button', { name: new RegExp(`Resolve \\(${testCase.resolveAction}\\)`) });
			await expect(resolveButton).toHaveCount(1);
			const resolveResponse = adminPage.waitForResponse((response) => {
				return response.url().endsWith('/api/admin/resolve-abuse-user-report') && response.status() === 204;
			});
			await resolveButton.click();
			expect((await resolveResponse).request().postDataJSON()).toMatchObject({
				reportId: report.id,
				resolvedAs: testCase.resolvedAs,
			});
			await expect(adminPage.getByTestId('folder-header').filter({ hasText: commentToken })).toHaveCount(0);

			const unresolvedResponse = adminPage.waitForResponse((response) => {
				if (!response.url().endsWith('/api/admin/abuse-user-reports') || response.status() !== 200) return false;
				return response.request().postDataJSON()?.state === 'unresolved';
			});
			await adminPage.reload();
			await unresolvedResponse;
			await expect(selectByLabel(adminPage, 'State')).toContainText('Unresolved');
			await expect(adminPage.getByTestId('folder-header').filter({ hasText: commentToken })).toHaveCount(0);

			const resolvedResponse = adminPage.waitForResponse((response) => {
				if (!response.url().endsWith('/api/admin/abuse-user-reports') || response.status() !== 200) return false;
				return response.request().postDataJSON()?.state === 'resolved';
			});
			const stateSelect = selectByLabel(adminPage, 'State');
			await stateSelect.click();
			await adminPage.getByRole('menuitem', { name: 'Resolved', exact: true }).click();
			await resolvedResponse;

			const resolved = await findReportGroup(adminPage, commentToken);
			await expect(resolved.header.locator(`.${testCase.resolvedIcon}`)).toHaveCount(1);
			await expect(resolved.header).toContainText(testCase.reasonLabel);
			await expect(resolved.header).toContainText(commentToken);
			await resolved.header.click();
			await expect(resolved.group.getByRole('button', { name: /Resolve \(/ })).toHaveCount(0);

			const resolvedReports = await api(BASE_URL, 'admin/abuse-user-reports', {
				i: admin.token, limit: 100, state: 'resolved',
			}) as AbuseReport[];
			const resolvedReport = resolvedReports.find((item) => item.id === report.id);
			if (resolvedReport == null) throw new Error('Resolved report was not returned by the admin API');
			expect(resolvedReport.resolvedAs).toBe(testCase.resolvedAs);
			expect(resolvedReport.assigneeId).toBe(admin.id);
		} finally {
			await adminContext.close();
		}
	});
}

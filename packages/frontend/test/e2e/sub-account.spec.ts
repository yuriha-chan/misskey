/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Page } from 'playwright';
import { test, expect } from './fixtures.js';
import { ADMIN_SETUP_PASSWORD, BASE_URL, registerUser, signIn } from './utils.js';
import type { RegisteredUser } from './utils.js';
import { api, setupTestAdmin } from './shared.js';

const PASSWORD = 'sub-account-test-password';
const CURRENT_ACCOUNT_LABEL = '現在ログイン中のアカウント';
const SUB_ACCOUNT_LABEL = '現在ログイン中のアカウントのサブアカウント';
let admin: RegisteredUser;

test.use({
	launchOptions: {
		executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
	},
});

test.beforeAll(async () => {
	admin = await setupTestAdmin(BASE_URL, 'admin', ADMIN_SETUP_PASSWORD);
});

async function completeSetup(user: RegisteredUser): Promise<void> {
	await api(BASE_URL, 'i/registry/set', {
		i: user.token,
		scope: ['client', 'base'],
		key: 'accountSetupWizard',
		value: -1,
	});
}

async function currentIdentityAfterSwitch(page: Page, username: string, switchAction: () => Promise<void>): Promise<void> {
	const identityResponse = page.waitForResponse(async response => response.url().endsWith('/api/i') && response.request().method() === 'POST' && response.status() === 200 && (await response.json()).username === username);
	await switchAction();
	const identity = await (await identityResponse).json() as { username: string };
	expect(identity.username).toBe(username);
}

function accountCard(page: Page, label: string) {
	return page.getByText(label, { exact: true }).locator('..');
}

async function switchFromAccountCard(page: Page, username: string): Promise<void> {
	await page.getByText(`@${username}`, { exact: true }).click();
	await page.getByText('Switch', { exact: true }).click();
}

async function expectCurrentAccount(page: Page, username: string): Promise<void> {
	const card = accountCard(page, CURRENT_ACCOUNT_LABEL);
	await expect(card).toBeVisible();
	await expect(card.getByText(`@${username}`, { exact: true })).toBeVisible();
}

async function expectSigninDialog(page: Page, username?: string): Promise<void> {
	const signinInput = page.getByTestId('signin-page-input');
	await expect(signinInput).toBeVisible();
	const usernameInput = page.getByTestId('signin-username').locator('input');
	if (username !== undefined) await expect(usernameInput).toHaveValue(username);
}

async function continueSignin(page: Page, username: string, password: string): Promise<void> {
	await expectSigninDialog(page);
	const usernameInput = page.getByTestId('signin-username').locator('input');
	if (await usernameInput.inputValue() !== username) await usernameInput.fill(username);
	await page.getByTestId('signin-page-input-continue').click();
	await page.getByTestId('signin-page-password').waitFor({ state: 'visible' });
	await page.getByTestId('signin-password').locator('input').fill(password);
	const signinResponse = page.waitForResponse(response => response.url().endsWith('/api/signin-flow') && response.request().method() === 'POST' && response.status() === 200);
	await page.getByTestId('signin-page-password-continue').click();
	await signinResponse;
}

async function closeSigninDialog(page: Page): Promise<void> {
	await page.getByText('Sign In', { exact: true }).locator('..').getByRole('button').click();
	await page.getByTestId('signin-page-input').waitFor({ state: 'detached' });
}

async function activeCredential(page: Page): Promise<{ id: string; token: string }> {
	return page.evaluate(() => {
		const account = JSON.parse(localStorage.getItem('account')!) as { id: string; token: string };
		return { id: account.id, token: account.token };
	});
}

async function removeAccountParentsFromStoredMetadata(page: Page): Promise<void> {
	await page.evaluate(async () => {
		const account = JSON.parse(localStorage.getItem('account')!) as Record<string, unknown>;
		delete account.accountParents;
		localStorage.setItem('account', JSON.stringify(account));

		const databases = await indexedDB.databases();
		let foundAccountInfos = false;
		for (const databaseInfo of databases) {
			if (databaseInfo.name == null) continue;
			const database = await new Promise<IDBDatabase>((resolve, reject) => {
				const request = indexedDB.open(databaseInfo.name!);
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
				request.onblocked = () => reject(new Error('IndexedDB open was blocked'));
			});
			try {
				for (const storeName of Array.from(database.objectStoreNames)) {
					await new Promise<void>((resolve, reject) => {
						const transaction = database.transaction(storeName, 'readwrite');
						const store = transaction.objectStore(storeName);
						const request = store.get('pizzax::base');
						transaction.oncomplete = () => resolve();
						transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
						transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
						request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
						request.onsuccess = () => {
							const state = request.result as { accountInfos?: Record<string, Record<string, unknown>> } | undefined;
							if (state?.accountInfos == null) return;
							foundAccountInfos = true;
							for (const user of Object.values(state.accountInfos)) {
								if (user && typeof user === 'object') delete user.accountParents;
							}
							const putRequest = store.put(state, 'pizzax::base');
							putRequest.onerror = () => reject(putRequest.error ?? new Error('IndexedDB write failed'));
						};
					});
				}
			} finally {
				database.close();
			}
		}
		if (!foundAccountInfos) throw new Error('Could not find accountInfos in IndexedDB');
	});
}

async function addExistingAccount(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Add account' }).click();
	await page.getByText('Existing account', { exact: true }).click();
}

async function rotateToken(user: RegisteredUser): Promise<void> {
	await api(BASE_URL, 'i/regenerate-token', { i: user.token, password: PASSWORD });
}

test('creates, switches, persists, and signs out of a sub-account', async ({ page }) => {
	const parent = await registerUser('subparentui', PASSWORD);
	await completeSetup(parent);
	await signIn(page, 'subparentui', PASSWORD);
	await expect(page.getByTestId('open-post-form')).toBeVisible();

	await page.goto(`${BASE_URL}/settings/accounts`);
	await page.getByRole('button', { name: 'Add account' }).click();
	await page.getByText('現在のアカウントのサブアカウントを作成', { exact: true }).click();

	const signupDialog = page.locator('form').filter({ has: page.locator('input[autocomplete="username"]') });
	await signupDialog.locator('input[autocomplete="username"]').fill('subchildui');
	const createSubAccountResponse = page.waitForResponse(response => response.url().endsWith('/api/i/create-sub-account') && response.request().method() === 'POST');
	await signupDialog.getByRole('button', { name: 'Begin', exact: true }).click();
	const createResponse = await createSubAccountResponse;
	expect(createResponse.status()).toBe(200);
	const createdSubAccount = await createResponse.json() as { id: string; i: string };
	expect(createdSubAccount.id).toBeTruthy();
	const child = { id: createdSubAccount.id, token: createdSubAccount.i };
	await completeSetup(child);

	await expectCurrentAccount(page, 'subparentui');
	const childCard = accountCard(page, SUB_ACCOUNT_LABEL);
	await expect(childCard).toBeVisible();
	await expect(childCard.getByText('@subchildui', { exact: true })).toBeVisible();
	await page.reload();
	await expectCurrentAccount(page, 'subparentui');
	await expect(accountCard(page, SUB_ACCOUNT_LABEL).getByText('@subchildui', { exact: true })).toBeVisible();

	await currentIdentityAfterSwitch(page, 'subchildui', () => switchFromAccountCard(page, 'subchildui'));
	await expectCurrentAccount(page, 'subchildui');
	await page.reload();
	await expectCurrentAccount(page, 'subchildui');

	await currentIdentityAfterSwitch(page, 'subparentui', () => switchFromAccountCard(page, 'subparentui'));
	await expectCurrentAccount(page, 'subparentui');

	await page.goto(`${BASE_URL}/settings`);
	await page.getByText('Sign Out', { exact: true }).click();
	await page.getByTestId('modal-dialog-ok').click();
	await page.getByTestId('signin').waitFor({ state: 'visible' });
	const remainingAccountState = await page.evaluate(() => ({
		currentAccountPresent: localStorage.getItem('account') !== null,
		accountKeyCount: Object.keys(localStorage).filter(key => key.toLowerCase().includes('account')).length,
	}));
	expect(remainingAccountState.currentAccountPresent).toBe(false);
	expect(remainingAccountState.accountKeyCount).toBe(0);
});

test('cancels and recovers an active revoked token', async ({ page }) => {
	const parent = await registerUser('subactiverevoke', PASSWORD);
	await completeSetup(parent);
	const childResponse = await api(BASE_URL, 'i/create-sub-account', { i: parent.token, username: 'subactiverevchild' }) as { id: string; i: string };
	const child = { id: childResponse.id, token: childResponse.i };
	await completeSetup(child);
	await signIn(page, 'subactiverevoke', PASSWORD);
	await expect(page.getByTestId('open-post-form')).toBeVisible();
	const before = await activeCredential(page);
	await rotateToken(parent);
	await expectSigninDialog(page, 'subactiverevoke');
	await closeSigninDialog(page);
	expect(await activeCredential(page)).toEqual(before);
	await page.reload();
	await expectSigninDialog(page, 'subactiverevoke');
	await Promise.all([
		page.waitForEvent('load'),
		continueSignin(page, 'subactiverevoke', PASSWORD),
	]);
	await expect(page.getByTestId('open-post-form')).toBeVisible();
	await page.goto(`${BASE_URL}/settings/accounts`);
	await expectCurrentAccount(page, 'subactiverevoke');
	await currentIdentityAfterSwitch(page, 'subactiverevchild', () => switchFromAccountCard(page, 'subactiverevchild'));
	await expectCurrentAccount(page, 'subactiverevchild');
	await page.reload();
	await expectCurrentAccount(page, 'subactiverevchild');
});

test('cancels recovery after reloading with an invalid active token', async ({ page }) => {
	const parent = await registerUser('subreloadrevoke', PASSWORD);
	await completeSetup(parent);
	await signIn(page, 'subreloadrevoke', PASSWORD);
	await expect(page.getByTestId('open-post-form')).toBeVisible();
	const before = await activeCredential(page);
	await rotateToken(parent);
	await page.reload();
	await expectSigninDialog(page, 'subreloadrevoke');
	await closeSigninDialog(page);
	expect(await activeCredential(page)).toEqual(before);
});

test('reauthenticates a stale saved child while another root account is active', async ({ page }) => {
	const parent = await registerUser('substaleparet', PASSWORD);
	await completeSetup(parent);
	const childResponse = await api(BASE_URL, 'i/create-sub-account', { i: parent.token, username: 'substalechild' }) as { id: string; i: string };
	const child = { id: childResponse.id, token: childResponse.i };
	await completeSetup(child);
	const other = await registerUser('substaleother', PASSWORD);
	await completeSetup(other);

	await signIn(page, 'substaleparet', PASSWORD);
	await expect(page.getByTestId('open-post-form')).toBeVisible();
	await page.goto(`${BASE_URL}/settings/accounts`);
	await currentIdentityAfterSwitch(page, 'substalechild', () => switchFromAccountCard(page, 'substalechild'));
	await expectCurrentAccount(page, 'substalechild');
	await addExistingAccount(page);
	await continueSignin(page, 'substaleother', PASSWORD);
	await expectCurrentAccount(page, 'substalechild');
	await currentIdentityAfterSwitch(page, 'substaleother', () => switchFromAccountCard(page, 'substaleother'));
	await expectCurrentAccount(page, 'substaleother');
	await rotateToken(parent);

	await switchFromAccountCard(page, 'substaleparet');
	await expectSigninDialog(page, 'substaleparet');
	const unrelatedCredential = await activeCredential(page);
	await closeSigninDialog(page);
	expect(await activeCredential(page)).toEqual(unrelatedCredential);
	await switchFromAccountCard(page, 'substaleparet');
	await continueSignin(page, 'substaleparet', PASSWORD);
	await expectCurrentAccount(page, 'substaleparet');
	await currentIdentityAfterSwitch(page, 'substalechild', () => switchFromAccountCard(page, 'substalechild'));
	await expectCurrentAccount(page, 'substalechild');
	await page.reload();
	await expectCurrentAccount(page, 'substalechild');
});

test('reauthenticates the root for a stale nested grandchild token', async ({ page }) => {
	const root = await registerUser('subnestedroot', PASSWORD);
	await completeSetup(root);
	const childResponse = await api(BASE_URL, 'i/create-sub-account', { i: root.token, username: 'subnestedchild' }) as { id: string; i: string };
	const child = { id: childResponse.id, token: childResponse.i };
	await completeSetup(child);
	const grandchildResponse = await api(BASE_URL, 'i/create-sub-account', { i: child.token, username: 'subnestedgrand' }) as { id: string; i: string };
	const grandchild = { id: grandchildResponse.id, token: grandchildResponse.i };
	await completeSetup(grandchild);
	const other = await registerUser('subnestedother', PASSWORD);
	await completeSetup(other);

	await signIn(page, 'subnestedroot', PASSWORD);
	await expect(page.getByTestId('open-post-form')).toBeVisible();
	await page.goto(`${BASE_URL}/settings/accounts`);
	await expect(accountCard(page, SUB_ACCOUNT_LABEL).getByText('@subnestedchild', { exact: true })).toBeVisible();
	await currentIdentityAfterSwitch(page, 'subnestedchild', () => switchFromAccountCard(page, 'subnestedchild'));
	await expectCurrentAccount(page, 'subnestedchild');
	await page.goto(`${BASE_URL}/settings/accounts`);
	await expect(accountCard(page, SUB_ACCOUNT_LABEL).getByText('@subnestedgrand', { exact: true })).toBeVisible();
	await addExistingAccount(page);
	await continueSignin(page, 'subnestedother', PASSWORD);
	await expectCurrentAccount(page, 'subnestedchild');
	await currentIdentityAfterSwitch(page, 'subnestedother', () => switchFromAccountCard(page, 'subnestedother'));
	await expectCurrentAccount(page, 'subnestedother');
	const { password: childPassword } = await api(BASE_URL, 'admin/reset-password', { i: admin.token, userId: child.id }) as { password: string };
	await api(BASE_URL, 'i/regenerate-token', { i: child.token, password: childPassword });
	await rotateToken(root);

	await switchFromAccountCard(page, 'subnestedgrand');
	await expectSigninDialog(page, 'subnestedroot');
	const unrelatedCredential = await activeCredential(page);
	await closeSigninDialog(page);
	expect(await activeCredential(page)).toEqual(unrelatedCredential);
	await switchFromAccountCard(page, 'subnestedgrand');
	await continueSignin(page, 'subnestedroot', PASSWORD);
	await expectCurrentAccount(page, 'subnestedgrand');
	await page.reload();
	await expectCurrentAccount(page, 'subnestedgrand');
});

test('does not add a duplicate account and recovers a stale inactive account', async ({ page }) => {
	const parent = await registerUser('subduplicateparent', PASSWORD);
	await completeSetup(parent);
	const childResponse = await api(BASE_URL, 'i/create-sub-account', { i: parent.token, username: 'subduplicatechild' }) as { id: string; i: string };
	const child = { id: childResponse.id, token: childResponse.i };
	await completeSetup(child);
	const other = await registerUser('subduplicateother', PASSWORD);
	await completeSetup(other);

	await signIn(page, 'subduplicateparent', PASSWORD);
	await expect(page.getByTestId('open-post-form')).toBeVisible();
	await page.goto(`${BASE_URL}/settings/accounts`);
	await addExistingAccount(page);
	await expectSigninDialog(page);
	await page.getByTestId('signin-username').locator('input').fill('subduplicateparent');
	await page.getByTestId('signin-page-input-continue').click();
	await expect(page.getByText('このアカウントには既にログインしています。', { exact: true })).toBeVisible();
	const original = await activeCredential(page);
	expect(original.id).toBe(parent.id);
	await expect(page.getByRole('button', { name: 'Add account' }).locator('../..').getByText('@subduplicateparent', { exact: true })).toHaveCount(1);
	await page.getByTestId('modal-dialog-ok').click();
	await expectCurrentAccount(page, 'subduplicateparent');
	expect(await activeCredential(page)).toEqual(original);

	await addExistingAccount(page);
	await continueSignin(page, 'subduplicateother', PASSWORD);
	await expectCurrentAccount(page, 'subduplicateparent');
	await currentIdentityAfterSwitch(page, 'subduplicateother', () => switchFromAccountCard(page, 'subduplicateother'));
	await expectCurrentAccount(page, 'subduplicateother');
	await rotateToken(parent);
	await addExistingAccount(page);
	await expectSigninDialog(page);
	await page.getByTestId('signin-username').locator('input').fill('subduplicateparent');
	await page.getByTestId('signin-page-input-continue').click();
	await expect(page.getByText('This token has expired. Please log in again.', { exact: true })).toBeVisible();
	await expectSigninDialog(page, 'subduplicateparent');
	await continueSignin(page, 'subduplicateparent', PASSWORD);
	await expectCurrentAccount(page, 'subduplicateother');
	const unrelatedCredential = await activeCredential(page);
	expect(unrelatedCredential.id).toBe(other.id);
	await currentIdentityAfterSwitch(page, 'subduplicatechild', () => switchFromAccountCard(page, 'subduplicatechild'));
	await expectCurrentAccount(page, 'subduplicatechild');
});

test('recovers a legacy child account without cached parent metadata', async ({ page }) => {
	const parent = await registerUser('sublegacyroot', PASSWORD);
	await completeSetup(parent);
	const childResponse = await api(BASE_URL, 'i/create-sub-account', { i: parent.token, username: 'sublegacychild' }) as { id: string; i: string };
	const child = { id: childResponse.id, token: childResponse.i };
	await completeSetup(child);

	await signIn(page, 'sublegacyroot', PASSWORD);
	await expect(page.getByTestId('open-post-form')).toBeVisible();
	await page.goto(`${BASE_URL}/settings/accounts`);
	await currentIdentityAfterSwitch(page, 'sublegacychild', () => switchFromAccountCard(page, 'sublegacychild'));
	await expectCurrentAccount(page, 'sublegacychild');

	await page.goto(`${BASE_URL}/favicon.ico`);
	await removeAccountParentsFromStoredMetadata(page);
	await rotateToken(parent);
	await page.goto(`${BASE_URL}/settings/accounts`);
	await expectSigninDialog(page, '');
	const before = await activeCredential(page);
	await closeSigninDialog(page);
	expect(await activeCredential(page)).toEqual(before);

	await page.reload();
	await expectSigninDialog(page, '');
	await continueSignin(page, 'sublegacyroot', PASSWORD);
	await expectCurrentAccount(page, 'sublegacychild');
	await page.reload();
	await expectCurrentAccount(page, 'sublegacychild');
});

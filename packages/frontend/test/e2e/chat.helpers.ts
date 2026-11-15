/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Browser, BrowserContext, Page } from '@playwright/test';
import { test as fixtureTest, expect } from './fixtures.js';
import { IGNORABLE_ERROR_MESSAGES, isIgnorableErrorMessage } from './ignorable-errors.js';
import {
	api as sharedApi,
	closeUserSetupDialog,
	registerUser,
	resetState,
	signIn,
	type RegisteredUser,
} from './shared.js';

export { expect };
export const test = fixtureTest;

export type ChatUser = RegisteredUser & {
	username: string;
	password: string;
};

export type ChatEnvironment = {
	alice: ChatUser;
	bob: ChatUser;
	carol: ChatUser;
	open(user: ChatUser): Promise<Page>;
	api<T>(user: ChatUser, endpoint: string, body?: Record<string, unknown>): Promise<T>;
	close(): Promise<void>;
};

export async function createChatEnvironment(browser: Browser, baseURL = 'http://localhost:61812'): Promise<ChatEnvironment> {
	await resetState(baseURL);
	await registerUser(baseURL, 'admin', 'admin1234', true);

	const createUser = async (username: string): Promise<ChatUser> => ({
		...(await registerUser(baseURL, username, `${username}1234`)),
		username,
		password: `${username}1234`,
	});

	const [alice, bob, carol] = await Promise.all([
		createUser('alice'),
		createUser('bob'),
		createUser('carol'),
	]);
	const contexts: BrowserContext[] = [];

	return {
		alice,
		bob,
		carol,
		async open(user) {
			const context = await browser.newContext({ locale: 'en-US' });
			contexts.push(context);
			await context.addInitScript((messages) => {
				function includesIgnorableMessage(message: unknown): boolean {
					return typeof message === 'string' && messages.some(text => message.includes(text));
				}

				window.addEventListener('error', event => {
					if (includesIgnorableMessage(event.message)) event.preventDefault();
				});
				window.addEventListener('unhandledrejection', event => {
					const reason = event.reason;
					const message = reason instanceof Error ? reason.message : String(reason);
					if (includesIgnorableMessage(message)) event.preventDefault();
				});
				(window as Window & { isPlaywright?: boolean }).isPlaywright = true;
			}, [...IGNORABLE_ERROR_MESSAGES]);
			const page = await context.newPage();
			page.on('pageerror', error => {
				if (!isIgnorableErrorMessage(error.message)) throw error;
			});
			await signIn(page, baseURL, user.username, user.password);
			const setupSaved = page.waitForResponse(response =>
				response.url().endsWith('/api/i/registry/set') &&
				response.request().postDataJSON()?.key === 'accountSetupWizard',
			);
			await closeUserSetupDialog(page);
			expect((await setupSaved).status()).toBe(204);
			await expect(page.getByTestId('user-setup-dialog')).toBeHidden();
			return page;
		},
		async api<T>(user: ChatUser, endpoint: string, body: Record<string, unknown> = {}) {
			return await sharedApi(baseURL, endpoint, { i: user.token, ...body }) as T;
		},
		async close() {
			await Promise.all(contexts.map(context => context.close()));
		},
	};
}

export async function followEachOther(alicePage: Page, bobPage: Page, alice: ChatUser, bob: ChatUser): Promise<void> {
	const follow = async (page: Page, user: ChatUser) => {
		await page.goto(`/@${user.username}`);
		const followResponse = page.waitForResponse(response =>
			response.url().endsWith('/api/following/create') && response.request().method() === 'POST',
		);
		await page.getByRole('button').filter({ has: page.getByText('Follow', { exact: true }) }).click();
		await page.getByTestId('modal-dialog-ok').click();
		expect((await followResponse).status()).toBe(200);
		await expect(page.getByRole('button').filter({ has: page.getByText('Followed', { exact: true }) })).toBeVisible();
	};
	await Promise.all([follow(alicePage, bob), follow(bobPage, alice)]);
}

export async function createRoom(
	page: Page,
	baseURL: string | undefined,
	options: { name: string; isPublic?: boolean; description?: string },
): Promise<{ id: string }> {
	await page.goto(baseURL ? new URL('/chat', baseURL).toString() : '/chat');
	await page.getByRole('button', { name: 'Start chat' }).click();
	await page.getByRole('menuitem', { name: 'Room Chat' }).click();

	const dialog = page.getByTestId('chat-room-editor');
	await dialog.getByTestId('chat-room-name').getByRole('textbox').fill(options.name);

	if (options.description !== undefined) {
		await dialog.getByTestId('chat-room-description').getByRole('textbox').fill(options.description);
	}

	if (options.isPublic) {
		await dialog.getByTestId('chat-room-public').click();
	}

	const createResponse = page.waitForResponse(response =>
		response.url().endsWith('/api/chat/rooms/create') && response.request().method() === 'POST',
	);
	await dialog.getByRole('button', { name: 'Create', exact: true }).click();
	const response = await createResponse;
	const responseBody = await response.text();
	expect(response.status(), `chat/rooms/create response: ${responseBody}`).toBe(200);
	const room = JSON.parse(responseBody) as { id: string };

	await expect(page).toHaveURL(new RegExp(`/chat/room/${room.id}$`));
	await page.getByTestId('chat-composer').getByRole('textbox').waitFor({ state: 'visible' });
	return { id: room.id };
}

export async function joinRoom(page: Page, baseURL: string | undefined, roomId: string): Promise<void> {
	const joinResponse = page.waitForResponse(response =>
		response.url().endsWith('/api/chat/rooms/join') && response.request().method() === 'POST',
	);
	const roomPath = `/chat/room/${roomId}`;
	await page.goto(baseURL ? new URL(roomPath, baseURL).toString() : roomPath);
	const response = await joinResponse;
	expect(response.status(), `chat/rooms/join response status`).toBe(204);
	await page.getByTestId('chat-composer').getByRole('textbox').waitFor({ state: 'visible' });
}

export async function sendMessage(page: Page, text: string): Promise<void> {
	const composer = page.getByTestId('chat-composer');
	await composer.getByRole('textbox').fill(text);
	await composer.getByTitle('Send', { exact: true }).click();
	await page.getByText(text, { exact: true }).waitFor({ state: 'visible' });
}

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Page } from '@playwright/test';
import { test, expect, createChatEnvironment, createRoom, joinRoom, sendMessage, followEachOther } from './chat.helpers.js';

async function loadSeededHistory(page: Page, messages: string[]): Promise<void> {
	for (let index = messages.length - 2; index >= 0; index--) {
		const olderMessage = page.getByText(messages[index]!, { exact: true });
		const newerMessage = page.getByText(messages[index + 1]!, { exact: true });
		if (await olderMessage.count() === 0) {
			const loadMore = page.getByRole('button', { name: 'Load more' });
			await expect(loadMore).toBeVisible();
			await loadMore.click();
		}

		await expect(olderMessage).toBeVisible();
		await expect(newerMessage).toBeVisible();
		await expect(olderMessage).toHaveCount(1);
		await expect(newerMessage).toHaveCount(1);
		const newerHandle = await newerMessage.elementHandle();
		const followsOlder = await olderMessage.evaluate((older, newer) =>
			Boolean(older.compareDocumentPosition(newer) & Node.DOCUMENT_POSITION_FOLLOWING), newerHandle!);
		await newerHandle?.dispose();
		expect(followsOlder).toBe(true);
	}
}

async function assertUnreadIndicator(page: Page): Promise<void> {
	const chatNavigationItem = page.getByRole('link').and(page.locator('a[href="/chat"]'));
	await expect(chatNavigationItem).toBeVisible();
	await expect(chatNavigationItem.locator('._blink')).toBeVisible();
}

async function assertNoUnreadIndicator(page: Page): Promise<void> {
	const chatNavigationItem = page.getByRole('link').and(page.locator('a[href="/chat"]'));
	await expect(chatNavigationItem).toBeVisible();
	await expect(chatNavigationItem.locator('._blink')).toBeHidden();
}

test.describe('Chat messaging', () => {
	test('room messages stream live, show unread state, persist, and page older messages', async ({ browser, baseURL }) => {
		const chat = await createChatEnvironment(browser, baseURL);
		try {
			const [alice, bob] = await Promise.all([chat.open(chat.alice), chat.open(chat.bob)]);
			const room = await createRoom(alice, baseURL, { name: 'Test room', isPublic: true });
			await joinRoom(bob, baseURL, room.id);
			// The chat form is shown after initialize registers the channel; receiving the message below confirms the live subscription is delivering events.
			await Promise.all([
				alice.getByTestId('chat-composer').getByRole('textbox').waitFor({ state: 'visible' }),
				bob.getByTestId('chat-composer').getByRole('textbox').waitFor({ state: 'visible' }),
			]);

			await sendMessage(alice, 'room live message');
			await expect(bob.getByText('room live message', { exact: true })).toBeVisible();
			await assertNoUnreadIndicator(bob);

			await bob.goto(`${baseURL}/chat`);
			await expect(bob.getByRole('searchbox')).toBeVisible();
			await assertNoUnreadIndicator(bob);
			await sendMessage(alice, 'room unread message');
			await assertUnreadIndicator(bob);

			await bob.goto(`${baseURL}/chat/room/${room.id}`);
			await expect(bob.getByText('room unread message', { exact: true })).toBeVisible();
			await bob.reload();
			await expect(bob.getByText('room live message', { exact: true })).toBeVisible();
			await expect(bob.getByText('room unread message', { exact: true })).toBeVisible();

			const olderMessages = Array.from({ length: 35 }, (_, index) => `room history ${String(index).padStart(2, '0')}`);
			for (const text of olderMessages) {
				await sendMessage(alice, text);
			}
			await bob.reload();
			await expect(bob.getByText(olderMessages.at(-1)!, { exact: true })).toBeVisible();
			await loadSeededHistory(bob, ['room live message', 'room unread message', ...olderMessages]);
			await expect(bob.getByText('room live message', { exact: true })).toBeVisible();
			await expect(bob.getByText('room unread message', { exact: true })).toBeVisible();
		} finally {
			await chat.close();
		}
	});

	test('direct messages stream live, show unread state, persist, and page older messages', async ({ browser, baseURL }) => {
		const chat = await createChatEnvironment(browser, baseURL);
		try {
			const [alice, bob] = await Promise.all([chat.open(chat.alice), chat.open(chat.bob)]);
			await followEachOther(alice, bob, chat.alice, chat.bob);
			await Promise.all([
				alice.goto(`${baseURL}/chat/user/${chat.bob.id}`),
				bob.goto(`${baseURL}/chat/user/${chat.alice.id}`),
			]);
			await Promise.all([
				alice.getByTestId('chat-composer').getByRole('textbox').waitFor({ state: 'visible' }),
				bob.getByTestId('chat-composer').getByRole('textbox').waitFor({ state: 'visible' }),
			]);

			await sendMessage(alice, 'direct live message');
			await expect(bob.getByText('direct live message', { exact: true })).toBeVisible();
			await assertNoUnreadIndicator(bob);

			await bob.goto(`${baseURL}/chat`);
			await expect(bob.getByRole('searchbox')).toBeVisible();
			await assertNoUnreadIndicator(bob);
			await sendMessage(alice, 'direct unread message');
			await assertUnreadIndicator(bob);

			await bob.goto(`${baseURL}/chat/user/${chat.alice.id}`);
			await expect(bob.getByText('direct unread message', { exact: true })).toBeVisible();
			await bob.reload();
			await expect(bob.getByText('direct live message', { exact: true })).toBeVisible();
			await expect(bob.getByText('direct unread message', { exact: true })).toBeVisible();

			const olderMessages = Array.from({ length: 35 }, (_, index) => `direct history ${String(index).padStart(2, '0')}`);
			for (const text of olderMessages) {
				await sendMessage(alice, text);
			}
			await bob.reload();
			await expect(bob.getByText(olderMessages.at(-1)!, { exact: true })).toBeVisible();
			await loadSeededHistory(bob, ['direct live message', 'direct unread message', ...olderMessages]);
			await expect(bob.getByText('direct live message', { exact: true })).toBeVisible();
			await expect(bob.getByText('direct unread message', { exact: true })).toBeVisible();
		} finally {
			await chat.close();
		}
	});
});

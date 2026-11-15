/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Locator, Page } from '@playwright/test';
import { test, expect, createChatEnvironment, createRoom, joinRoom, sendMessage, followEachOther } from './chat.helpers.js';

const HEART_REACTION = '💛';

function messageBody(page: Page, messageText: string) {
	return page.getByTestId('chat-timeline-item').filter({ has: page.getByText(messageText, { exact: true }) });
}

function messageReactions(body: Locator) {
	return body.getByTestId('chat-reaction');
}

async function chooseHeartReaction(page: Page, messageText: string) {
	const body = messageBody(page, messageText);
	await body.getByTestId('chat-message-menu').click();
	await page.getByRole('menuitem', { name: /(?:^|\s)Reactions$/ }).click();
	const picker = page.locator('.omfetrab');
	await expect(picker).toHaveCount(1);
	await picker.getByRole('searchbox').fill('heart');
	const reaction = picker.locator('section.result').getByRole('button').filter({ has: page.getByAltText(HEART_REACTION, { exact: true }) });
	await expect(reaction).toHaveCount(1);
	await reaction.click();
	return messageReactions(body);
}

async function expectHeartReaction(reactions: Locator, username: string): Promise<void> {
	await expect(reactions).toHaveCount(1);
	await expect(reactions.getByAltText(HEART_REACTION, { exact: true })).toBeVisible();
	await expect(reactions.getByTitle(username, { exact: true })).toBeVisible();
}

test.describe('Chat reactions and polls', () => {
	test('room and direct-message reactions update in the other participant timeline', async ({ browser, baseURL }) => {
		const chat = await createChatEnvironment(browser, baseURL);
		try {
			const [alice, bob] = await Promise.all([chat.open(chat.alice), chat.open(chat.bob)]);
			const room = await createRoom(alice, baseURL, { name: 'Reaction room', isPublic: true });
			await joinRoom(bob, baseURL, room.id);
			await sendMessage(alice, 'room reaction target');
			await alice.getByText('room reaction target', { exact: true }).waitFor();
			await bob.getByText('room reaction target', { exact: true }).waitFor();

			const roomReactions = await chooseHeartReaction(bob, 'room reaction target');
			await expectHeartReaction(roomReactions, chat.bob.username);
			const aliceRoomReactions = messageReactions(messageBody(alice, 'room reaction target'));
			await expectHeartReaction(aliceRoomReactions, chat.bob.username);
			await roomReactions.click();
			await expect(roomReactions).toHaveCount(0);
			await expect(aliceRoomReactions).toHaveCount(0);

			await followEachOther(alice, bob, chat.alice, chat.bob);
			await Promise.all([
				alice.goto(`${baseURL}/chat/user/${chat.bob.id}`),
				bob.goto(`${baseURL}/chat/user/${chat.alice.id}`),
			]);
			await sendMessage(alice, 'direct reaction target');
			await alice.getByText('direct reaction target', { exact: true }).waitFor();
			await bob.getByText('direct reaction target', { exact: true }).waitFor();

			const directReactions = await chooseHeartReaction(bob, 'direct reaction target');
			await expectHeartReaction(directReactions, chat.bob.username);
			const aliceDirectReactions = messageReactions(messageBody(alice, 'direct reaction target'));
			await expectHeartReaction(aliceDirectReactions, chat.bob.username);
		} finally {
			await chat.close();
		}
	});

	test('direct-message unreact streams removal and persists after reload', async ({ browser, baseURL }) => {
		const chat = await createChatEnvironment(browser, baseURL);
		try {
			const [alice, bob] = await Promise.all([chat.open(chat.alice), chat.open(chat.bob)]);
			await followEachOther(alice, bob, chat.alice, chat.bob);
			await Promise.all([
				alice.goto(`${baseURL}/chat/user/${chat.bob.id}`),
				bob.goto(`${baseURL}/chat/user/${chat.alice.id}`),
			]);
			await sendMessage(alice, 'direct unreact target');
			await alice.getByText('direct unreact target', { exact: true }).waitFor();
			await bob.getByText('direct unreact target', { exact: true }).waitFor();

			const bobReaction = await chooseHeartReaction(bob, 'direct unreact target');
			const aliceReaction = messageReactions(messageBody(alice, 'direct unreact target'));
			await expectHeartReaction(bobReaction, chat.bob.username);
			await expectHeartReaction(aliceReaction, chat.bob.username);

			const unreactResponse = bob.waitForResponse(response => response.url().endsWith('/api/chat/messages/unreact'));
			await bobReaction.click();
			await unreactResponse;
			await expect.soft(bobReaction).toHaveCount(0);
			await expect.soft(aliceReaction).toHaveCount(0);

			await Promise.all([alice.reload(), bob.reload()]);
			await expect(alice.getByText('direct unreact target', { exact: true })).toBeVisible();
			await expect(bob.getByText('direct unreact target', { exact: true })).toBeVisible();
			await expect(messageReactions(messageBody(alice, 'direct unreact target'))).toHaveCount(0);
			await expect(messageReactions(messageBody(bob, 'direct unreact target'))).toHaveCount(0);
		} finally {
			await chat.close();
		}
	});

	test('room poll can be created, voted on, reloaded while active, and finished with results', async ({ browser, baseURL }) => {
		const chat = await createChatEnvironment(browser, baseURL);
		try {
			const [alice, bob] = await Promise.all([chat.open(chat.alice), chat.open(chat.bob)]);
			const room = await createRoom(alice, baseURL, { name: 'Poll room', isPublic: true });
			await joinRoom(bob, baseURL, room.id);
			await alice.getByTestId('chat-composer').getByRole('textbox').waitFor({ state: 'visible' });
			await bob.getByTestId('chat-composer').getByRole('textbox').waitFor({ state: 'visible' });

			const composer = alice.getByTestId('chat-composer');
			await composer.getByTitle('Attach', { exact: true }).click();
			await alice.getByRole('menuitem', { name: /(?:^|\s)投票を開始する$/ }).click();
			const editor = alice.getByTestId('chat-poll-editor');
			await editor.getByTestId('chat-poll-title').getByRole('textbox').fill('Favorite season');
			const choiceInputs = editor.getByTestId('chat-poll-choice').getByRole('textbox');
			await expect(choiceInputs).toHaveCount(2);
			await choiceInputs.nth(0).fill('Spring');
			await choiceInputs.nth(1).fill('Autumn');
			const duration = editor.getByTestId('chat-poll-duration');
			const minutes = duration.locator('._selectable').filter({ has: alice.getByText('Minute(s)', { exact: true }) }).getByRole('spinbutton');
			const seconds = duration.locator('._selectable').filter({ has: alice.getByText('Second(s)', { exact: true }) }).getByRole('spinbutton');
			await minutes.fill('5');
			await minutes.blur();
			await seconds.fill('0');
			await seconds.blur();
			await editor.getByRole('button', { name: 'Create', exact: true }).click();
			await composer.getByTitle('Send', { exact: true }).click();

			const aliceActivePoll = alice.getByTestId('chat-active-poll').filter({ hasText: 'Favorite season' });
			await expect(aliceActivePoll).toContainText('Favorite season');

			await bob.reload();
			const bobActivePoll = bob.getByTestId('chat-active-poll').filter({ hasText: 'Favorite season' });
			const bobVoteButton = bobActivePoll.getByRole('button', { name: '投票', exact: true });
			await expect(bobActivePoll).toContainText('Favorite season');
			await expect(bobVoteButton).toBeEnabled();
			await bobVoteButton.click();
			const voteDialog = bob.getByTestId('chat-poll-vote-dialog');
			await voteDialog.getByTestId('chat-poll-option').filter({ has: bob.getByText('Spring', { exact: true }) }).click();
			await voteDialog.getByRole('button', { name: '投票', exact: true }).click();
			await expect(bobActivePoll.getByRole('button', { name: '投票済み', exact: true })).toBeDisabled();
			await bob.reload();
			await expect(bobActivePoll.getByRole('button', { name: '投票済み', exact: true })).toBeDisabled();

			await aliceActivePoll.getByRole('button', { name: '投票を終了', exact: true }).click();
			const finishResponse = alice.waitForResponse(response => response.url().endsWith('/api/chat/polls/finish'));
			await alice.getByTestId('modal-dialog-ok').click();
			await finishResponse;

			for (const page of [alice, bob]) {
				const spring = page.getByTestId('chat-poll-result-choice').filter({ has: page.getByText('Spring', { exact: true }) });
				const autumn = page.getByTestId('chat-poll-result-choice').filter({ has: page.getByText('Autumn', { exact: true }) });
				await expect(spring).toBeVisible();
				await expect(spring.getByTestId('chat-poll-vote-count')).toHaveText('1');
				await expect(autumn.getByTestId('chat-poll-vote-count')).toHaveText('0');
			}
		} finally {
			await chat.close();
		}
	});
});

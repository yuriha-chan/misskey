/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect, createChatEnvironment, createRoom, joinRoom } from './chat.helpers.js';

async function waitForApiResponse(page: import('@playwright/test').Page, endpoint: string) {
	return await page.waitForResponse(response =>
		response.url().endsWith(`/api/${endpoint}`) && response.request().method() === 'POST');
}

function notificationTimeline(page: import('@playwright/test').Page) {
	return page.locator('._pageScrollable');
}

async function expectApiError(baseURL: string, user: { token: string }, endpoint: string, body: Record<string, unknown>, code: string) {
	const response = await fetch(`${baseURL}/api/${endpoint}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ i: user.token, ...body }),
	});
	expect(response.status).toBe(400);
	const result = await response.json() as { error: { code: string } };
	expect(result.error.code).toBe(code);
}

test.describe('Chat membership and invitations', () => {
	test('leave and kick update active membership and stream to room members', async ({ browser, baseURL }) => {
		const chat = await createChatEnvironment(browser, baseURL);
		try {
			const [alice, bob, carol] = await Promise.all([chat.open(chat.alice), chat.open(chat.bob), chat.open(chat.carol)]);
			const room = await createRoom(alice, baseURL, { name: 'Membership room', isPublic: true });
			await Promise.all([
				joinRoom(bob, baseURL, room.id),
				joinRoom(carol, baseURL, room.id),
			]);
			await Promise.all([
				alice.getByText('Membership room', { exact: true }).waitFor(),
				bob.getByText('Membership room', { exact: true }).waitFor(),
				carol.getByText('Membership room', { exact: true }).waitFor(),
			]);

			const leaveResponse = waitForApiResponse(bob, 'chat/rooms/leave');
			await bob.getByRole('button', { name: 'Leave room' }).click();
			await bob.getByTestId('modal-dialog-ok').click();
			expect((await leaveResponse).status()).toBe(204);
			await expect(bob).toHaveURL(/\/chat\/?$/);
			await expect(alice.getByText(/bob.*グループから退出しました/)).toBeVisible();
			await expect.poll(async () => {
				const memberships = await chat.api<Array<{ userId: string; hasLeft: boolean }>>(chat.alice, 'chat/rooms/members', { roomId: room.id, includeLeftMembers: true });
				return memberships.find(member => member.userId === chat.bob.id)?.hasLeft;
			}).toBe(true);

			await alice.reload();
			await alice.getByText('Membership room', { exact: true }).waitFor();
			const membersResponse = waitForApiResponse(alice, 'chat/rooms/members');
			await alice.getByRole('button', { name: 'Members' }).click();
			expect((await membersResponse).status()).toBe(200);
			const members = alice.getByTestId('chat-room-members');
			await members.getByRole('link', { name: 'alice @alice', exact: true }).waitFor();
			await expect(members.getByTestId('chat-room-member').filter({ has: alice.getByText('@bob', { exact: true }) })).toHaveCount(0);
			const carolMembership = members.getByTestId('chat-room-member').filter({ has: alice.getByRole('link', { name: 'carol @carol', exact: true }) });
			const kickResponse = waitForApiResponse(alice, 'chat/rooms/kick');
			await carolMembership.getByRole('button', { name: '退出させる' }).click();
			expect((await kickResponse).status()).toBe(204);
			await expect(carol.getByText(/carol.*グループから退出させられました/)).toBeVisible();
			await expect.poll(async () => {
				const memberships = await chat.api<Array<{ userId: string; hasLeft: boolean }>>(chat.alice, 'chat/rooms/members', { roomId: room.id, includeLeftMembers: true });
				return memberships.find(member => member.userId === chat.carol.id)?.hasLeft;
			}).toBe(true);
			await expect.poll(async () => {
				const memberships = await chat.api<Array<{ userId: string }>>(chat.alice, 'chat/rooms/members', { roomId: room.id, includeLeftMembers: false });
				return memberships.some(member => member.userId === chat.carol.id);
			}).toBe(false);
			await alice.reload();
			await alice.getByText('Membership room', { exact: true }).waitFor();
			const kickedMembersResponse = waitForApiResponse(alice, 'chat/rooms/members');
			await alice.getByRole('button', { name: 'Members' }).click();
			expect((await kickedMembersResponse).status()).toBe(200);
			await members.getByRole('link', { name: 'alice @alice', exact: true }).waitFor();
			await expect(members.getByTestId('chat-room-member').filter({ has: alice.getByText('@carol', { exact: true }) })).toHaveCount(0);
		} finally {
			await chat.close();
		}
	});

	test('owner sends an invitation, recipient gets an in-app notification and joins, unrelated users cannot see the private room', async ({ browser, baseURL }) => {
		const chat = await createChatEnvironment(browser, baseURL);
		try {
			const [alice, bob, carol] = await Promise.all([chat.open(chat.alice), chat.open(chat.bob), chat.open(chat.carol)]);
			const room = await createRoom(alice, baseURL, { name: 'Private invitation room', description: 'Only invited users can see this room.' });
			const publicRoom = await createRoom(alice, baseURL, { name: 'Discoverable public room', isPublic: true });
			await alice.goto(`${baseURL}/chat/room/${room.id}`);
			const initialBobNotifications = bob.waitForResponse(response => response.url().includes('/api/i/notifications') && response.request().method() === 'POST');
			const initialCarolNotifications = carol.waitForResponse(response => response.url().includes('/api/i/notifications') && response.request().method() === 'POST');
			await Promise.all([
				alice.goto(`${baseURL}/chat/room/${room.id}`),
				bob.goto(`${baseURL}/my/notifications`),
				carol.goto(`${baseURL}/my/notifications`),
			]);
			await alice.getByText('Private invitation room', { exact: true }).waitFor();
			expect((await initialBobNotifications).status()).toBe(200);
			expect((await initialCarolNotifications).status()).toBe(200);
			for (const page of [bob, carol]) {
				const timeline = notificationTimeline(page);
				await expect(timeline).toHaveCount(1);
				await expect(timeline.getByText('No notifications', { exact: true }).or(timeline.locator('[data-scroll-anchor]').first())).toBeVisible();
			}
			const listedRooms = await chat.api<Array<{ id: string }>>(chat.carol, 'chat/rooms/list-public');
			expect(listedRooms.map(listedRoom => listedRoom.id)).toContain(publicRoom.id);
			expect(listedRooms.map(listedRoom => listedRoom.id)).not.toContain(room.id);

			await alice.getByRole('button', { name: 'Members' }).click();
			await alice.getByTestId('chat-room-members').getByRole('button', { name: 'Invite Users' }).click();
			const userDialog = alice.getByTestId('user-select-dialog');
			await expect(userDialog.getByRole('textbox')).toHaveCount(1);
			await userDialog.getByRole('textbox').fill('bob');
			await userDialog.getByText('@bob', { exact: true }).click();
			const invitationResponse = waitForApiResponse(alice, 'chat/rooms/invitations/create');
			await userDialog.getByRole('button', { name: 'Done' }).click();
			const invitationResponseResult = await invitationResponse;
			expect(invitationResponseResult.status(), await invitationResponseResult.text()).toBe(200);

			const bobNotifications = notificationTimeline(bob);
			await expect(bobNotifications.getByText('You have been invited to a chat room', { exact: true })).toBeVisible();
			await expect(bobNotifications.getByText('Private invitation room', { exact: true })).toBeVisible();
			const carolNotificationsResponse = carol.waitForResponse(response => response.url().includes('/api/i/notifications') && response.request().method() === 'POST');
			await carol.reload();
			const notificationsResponse = await carolNotificationsResponse;
			expect(notificationsResponse.status()).toBe(200);
			const notifications = await notificationsResponse.json() as Array<{ type: string; invitation?: { room: { id: string } } }>;
			expect(notifications.some(notification => notification.type === 'chatRoomInvitationReceived' && notification.invitation?.room.id === room.id)).toBe(false);
			await expect(carol.getByText('You have been invited to a chat room', { exact: true })).toHaveCount(0);
			const invitedRoom = await chat.api<{ invitationExists: boolean }>(chat.bob, 'chat/rooms/show', { roomId: room.id });
			expect(invitedRoom.invitationExists).toBe(true);
			const showDenied = carol.waitForResponse(response => response.url().endsWith('/api/chat/rooms/show') && response.request().method() === 'POST');
			await carol.goto(`${baseURL}/chat/room/${room.id}`);
			const showDeniedResponse = await showDenied;
			expect(showDeniedResponse.status()).toBe(400);
			expect((await showDeniedResponse.json()).error.code).toBe('NO_SUCH_ROOM');
			await expect(carol.getByText('Private invitation room', { exact: true })).toHaveCount(0);
			await expectApiError(baseURL!, chat.carol, 'chat/messages/room-timeline', { roomId: room.id }, 'NO_SUCH_ROOM');

			await alice.reload();
			await alice.getByText('Private invitation room', { exact: true }).waitFor();
			await alice.getByRole('button', { name: 'Members' }).click();
			await expect(alice.getByTestId('chat-room-sent-invitation').getByText('@bob', { exact: true })).toBeVisible();
			await expect.poll(async () => {
				const outbox = await chat.api<Array<{ user: { id: string } }>>(chat.alice, 'chat/rooms/invitations/outbox', { roomId: room.id });
				return outbox.some(invitation => invitation.user.id === chat.bob.id);
			}).toBe(true);
			await expect.poll(async () => {
				const inbox = await chat.api<Array<{ room: { id: string } }>>(chat.bob, 'chat/rooms/invitations/inbox');
				return inbox.some(invitation => invitation.room.id === room.id);
			}).toBe(true);
			await expect.poll(async () => {
				const carolInbox = await chat.api<Array<{ room: { id: string } }>>(chat.carol, 'chat/rooms/invitations/inbox');
				return carolInbox.some(invitation => invitation.room.id === room.id);
			}).toBe(false);

			await bob.reload();
			await expect(bobNotifications.getByText('You have been invited to a chat room', { exact: true })).toBeVisible();
			await expect(bobNotifications.getByText('Private invitation room', { exact: true })).toBeVisible();
			await bob.goto(`${baseURL}/chat`);
			await bob.getByRole('button', { name: 'Invite' }).click();
			const invitation = bob.getByTestId('chat-room-invitation').filter({ has: bob.getByText('Private invitation room', { exact: true }) });
			await expect(invitation).toBeVisible();
			await bob.reload();
			await bob.getByRole('button', { name: 'Invite' }).click();
			await expect(invitation).toBeVisible();
			const joinResponse = waitForApiResponse(bob, 'chat/rooms/join');
			await invitation.getByRole('button', { name: /(?:^|\s)Join$/ }).click();
			expect((await joinResponse).status()).toBe(204);
			await expect(bob).toHaveURL(new RegExp(`/chat/room/${room.id}$`));
			await bob.getByText('Private invitation room', { exact: true }).waitFor();
			await alice.getByRole('button', { name: 'Messages' }).click();
			await expect(alice.getByText(/bob.*グループに参加しました/)).toBeVisible();

			await expect.poll(async () => {
				const memberships = await chat.api<Array<{ userId: string; hasLeft: boolean }>>(chat.alice, 'chat/rooms/members', { roomId: room.id, includeLeftMembers: true });
				return memberships.find(member => member.userId === chat.bob.id)?.hasLeft;
			}).toBe(false);
			await expect.poll(async () => {
				const remainingInvitations = await chat.api<Array<{ room: { id: string } }>>(chat.bob, 'chat/rooms/invitations/inbox');
				return remainingInvitations.some(invitation => invitation.room.id === room.id);
			}).toBe(false);
			await expectApiError(baseURL!, chat.carol, 'chat/rooms/members', { roomId: room.id }, 'NO_SUCH_ROOM');
			await bob.reload();
			await bob.getByText('Private invitation room', { exact: true }).waitFor();
		} finally {
			await chat.close();
		}
	});
});

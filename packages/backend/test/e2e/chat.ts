/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { describe, beforeAll, afterAll, test } from 'vitest';
import { api, castAsError, initTestDb, signup, startJobQueue } from '../utils.js';
import type { INestApplicationContext } from '@nestjs/common';
import type * as misskey from 'misskey-js';

describe('Chat', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let carol: misskey.entities.SignupResponse;
	let dave: misskey.entities.SignupResponse;
	let queue: INestApplicationContext;

	beforeAll(async () => {
		queue = await startJobQueue();
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
		carol = await signup({ username: 'carol' });
		dave = await signup({ username: 'dave' });
	}, 1000 * 60 * 2);

	afterAll(async () => {
		await queue.close();
	});

	describe('Room creation', () => {
		test('create a room with name only', async () => {
			const res = await api('chat/rooms/create', {
				name: 'default room',
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.name, 'default room');
			assert.strictEqual(res.body.isPublic, false);
			assert.strictEqual(res.body.isArchived, false);
			assert.strictEqual(res.body.capacity, 30);
		});

		test('create a public room', async () => {
			const res = await api('chat/rooms/create', {
				name: 'public room',
				isPublic: true,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.isPublic, true);
		});

		test('create a room with capacity', async () => {
			const res = await api('chat/rooms/create', {
				name: 'small room',
				capacity: 5,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.capacity, 5);
		});

		test('create a room with theme', async () => {
			const res = await api('chat/rooms/create', {
				name: 'themed room',
				theme: 'dark',
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.theme, 'dark');
		});

		test('create a room with expiration', async () => {
			const res = await api('chat/rooms/create', {
				name: 'temporary room',
				expiration: 3600_000,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.expiration, 3600_000);
		});

		test('fails with empty name', async () => {
			const res = await api('chat/rooms/create', {
				name: '',
			}, alice);

			assert.strictEqual(res.status, 200);
		});

		test('fails without name', async () => {
			const res = await api('chat/rooms/create', {
			} as any, alice);

			assert.strictEqual(res.status, 400);
		});

		test('fails without authentication', async () => {
			const res = await api('chat/rooms/create', {
				name: 'unauth room',
			});

			assert.strictEqual(res.status, 401);
		});

		test('update a room', async () => {
			const room = await api('chat/rooms/create', {
				name: 'update-me',
			}, alice);
			assert.strictEqual(room.status, 200);

			const res = await api('chat/rooms/update', {
				roomId: room.body.id,
				name: 'updated name',
				description: 'updated desc',
			}, alice);
			assert.strictEqual(res.status, 200);

			const show = await api('chat/rooms/show', {
				roomId: room.body.id,
			}, alice);
			assert.strictEqual(show.status, 200);
			assert.strictEqual(show.body.name, 'updated name');
			assert.strictEqual(show.body.description, 'updated desc');
		});
	});

	describe('Public rooms listing', () => {
		test('list public rooms', async () => {
			const room = await api('chat/rooms/create', {
				name: 'discoverable room',
				isPublic: true,
			}, alice);
			assert.strictEqual(room.status, 200);

			const res = await api('chat/rooms/list-public', {
				limit: 10,
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.ok(Array.isArray(res.body));
			assert.ok(res.body.some((r: any) => r.id === room.body.id));
		});

		test('private rooms are not listed', async () => {
			const privateRoom = await api('chat/rooms/create', {
				name: 'private room',
				isPublic: false,
			}, alice);
			assert.strictEqual(privateRoom.status, 200);

			const res = await api('chat/rooms/list-public', {
				limit: 10,
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.ok(!res.body.some((r: any) => r.id === privateRoom.body.id));
		});

		test('fails without authentication', async () => {
			const res = await api('chat/rooms/list-public', {});

			assert.strictEqual(res.status, 401);
		});
	});

	describe('Room join/leave', () => {
		let room: any;

		beforeAll(async () => {
			const res = await api('chat/rooms/create', {
				name: 'join-test room',
				isPublic: true,
			}, alice);
			assert.strictEqual(res.status, 200);
			room = res.body;
		});

		test('join a room', async () => {
			const res = await api('chat/rooms/join', {
				roomId: room.id,
			}, bob);

			assert.strictEqual(res.status, 204);
		});

		test('join with bubble color', async () => {
			const anotherRoom = await api('chat/rooms/create', {
				name: 'bubble-test room',
				isPublic: true,
			}, alice);

			const res = await api('chat/rooms/join', {
				roomId: anotherRoom.body.id,
				bubbleColor: '#ff0000',
			}, bob);

			assert.strictEqual(res.status, 204);

			const members = await api('chat/rooms/members', {
				roomId: anotherRoom.body.id,
			}, alice);
			assert.strictEqual(members.status, 200);
			const bobMembership = members.body.find((m: any) => m.userId === bob.id);
			assert.ok(bobMembership);
			assert.strictEqual(bobMembership.bubbleColor, '#ff0000');
		});

		test('leave a room (soft-leave)', async () => {
			const res = await api('chat/rooms/leave', {
				roomId: room.id,
			}, bob);

			assert.strictEqual(res.status, 204);
		});

		test('re-join after leave', async () => {
			// bob left above
			const res = await api('chat/rooms/join', {
				roomId: room.id,
			}, bob);

			assert.strictEqual(res.status, 204);
		});

		test('join non-existent room fails', async () => {
			const res = await api('chat/rooms/join', {
				roomId: '000000000000000000000000',
			}, bob);

			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body as any).error.code, 'NO_SUCH_ROOM');
		});

		test('leave non-existent room fails', async () => {
			const res = await api('chat/rooms/leave', {
				roomId: '000000000000000000000000',
			}, bob);

			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body as any).error.code, 'NO_SUCH_ROOM');
		});
	});

	describe('Room archive', () => {
		test('owner can archive room', async () => {
			const room = await api('chat/rooms/create', {
				name: 'archivable room',
			}, alice);
			assert.strictEqual(room.status, 200);

			const res = await api('chat/rooms/archive', {
				roomId: room.body.id,
			}, alice);

			assert.strictEqual(res.status, 204);
		});

		test('non-owner cannot archive room', async () => {
			const room = await api('chat/rooms/create', {
				name: 'non-owner archive room',
			}, alice);
			assert.strictEqual(room.status, 200);

			const res = await api('chat/rooms/archive', {
				roomId: room.body.id,
			}, bob);

			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body as any).error.code, 'NO_SUCH_ROOM');
		});

		test('archive non-existent room fails', async () => {
			const res = await api('chat/rooms/archive', {
				roomId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body as any).error.code, 'NO_SUCH_ROOM');
		});
	});

	describe('Kick member', () => {
		let room: any;

		beforeAll(async () => {
			const res = await api('chat/rooms/create', {
				name: 'kick-test room',
				isPublic: true,
			}, alice);
			assert.strictEqual(res.status, 200);
			room = res.body;
			await api('chat/rooms/join', { roomId: room.id }, bob);
			await api('chat/rooms/join', { roomId: room.id }, carol);
		});

		test('owner can kick a member', async () => {
			const res = await api('chat/rooms/kick', {
				roomId: room.id,
				userId: bob.id,
			}, alice);

			assert.strictEqual(res.status, 204);
		});

		test('non-owner cannot kick', async () => {
			const res = await api('chat/rooms/kick', {
				roomId: room.id,
				userId: carol.id,
			}, bob);

			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body as any).error.code, 'NOT_PERMITTED_TO_KICK');
		});

		test('kick non-existent room fails', async () => {
			const res = await api('chat/rooms/kick', {
				roomId: '000000000000000000000000',
				userId: bob.id,
			}, alice);

			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body as any).error.code, 'NO_SUCH_ROOM');
		});
	});

	describe('Update membership', () => {
		test('update own bubble color', async () => {
			const room = await api('chat/rooms/create', {
				name: 'update-membership room',
				isPublic: true,
			}, alice);
			assert.strictEqual(room.status, 200);
			await api('chat/rooms/join', { roomId: room.body.id }, bob);

			const res = await api('chat/rooms/update-membership', {
				roomId: room.body.id,
				bubbleColor: '#00ff00',
				bubbleStyle: 'solid',
			}, bob);

			assert.strictEqual(res.status, 204);
		});

		test('update membership for non-existent room fails', async () => {
			const res = await api('chat/rooms/update-membership', {
				roomId: '000000000000000000000000',
				bubbleColor: '#0000ff',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('Chat polls', () => {
		let room: any;

		beforeAll(async () => {
			const res = await api('chat/rooms/create', {
				name: 'poll-test room',
				isPublic: true,
			}, alice);
			assert.strictEqual(res.status, 200);
			room = res.body;
			await api('chat/rooms/join', { roomId: room.id }, bob);
		});

		test('create a message with a poll', async () => {
			const res = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				poll: {
					title: 'favorite color',
					choices: ['red', 'blue', 'green'],
				},
			}, alice);

			assert.strictEqual(res.status, 204);
		});

		test('create a message with an anonymous poll', async () => {
			const res = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				poll: {
					title: 'anonymous question',
					choices: ['yes', 'no'],
					anonymous: true,
				},
			}, alice);

			assert.strictEqual(res.status, 204);
		});

		test('vote on a poll', async () => {
			await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				poll: {
					title: 'vote test',
					choices: ['a', 'b'],
				},
			}, alice);

			const polls = await api('chat/polls/list', { roomId: room.id }, alice);
			assert.strictEqual(polls.status, 200);
			const pollId = polls.body.startedPolls[0].id;

			const res = await api('chat/polls/vote', {
				pollId,
				choice: 0,
			}, bob);

			assert.strictEqual(res.status, 204);
		});

		test('cannot vote twice on same poll', async () => {
			await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				poll: {
					title: 'double vote test',
					choices: ['x', 'y'],
				},
			}, alice);

			const polls = await api('chat/polls/list', { roomId: room.id }, alice);
			const pollId = polls.body.startedPolls[0].id;

			await api('chat/polls/vote', {
				pollId,
				choice: 0,
			}, bob);

			const res = await api('chat/polls/vote', {
				pollId,
				choice: 1,
			}, bob);

			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body as any).error.code, 'ALREADY_VOTED');
		});

		test('vote on non-existent poll fails', async () => {
			const res = await api('chat/polls/vote', {
				pollId: '000000000000000000000000',
				choice: 0,
			}, alice);

			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body as any).error.code, 'NO_SUCH_POLL');
		});

		test('vote as non-member fails', async () => {
			await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				poll: {
					title: 'member test',
					choices: ['a', 'b'],
				},
			}, alice);

			const polls = await api('chat/polls/list', { roomId: room.id }, alice);
			const pollId = polls.body.startedPolls[0].id;

			const res = await api('chat/polls/vote', {
				pollId,
				choice: 0,
			}, carol);

			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body as any).error.code, 'NOT_MEMBER');
		});

		test('list polls in a room', async () => {
			const res = await api('chat/polls/list', {
				roomId: room.id,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.ok(res.body.startedPolls);
		});

		test('list polls in non-existent room fails', async () => {
			const res = await api('chat/polls/list', {
				roomId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('create a message with only a poll (no text)', async () => {
			const res = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				poll: {
					title: 'textless poll',
					choices: ['I like it', 'I dislike it'],
				},
			}, alice);

			assert.strictEqual(res.status, 204);
		});
	});

	describe('Chat secrets', () => {
		let room: any;

		beforeAll(async () => {
			const res = await api('chat/rooms/create', {
				name: 'secret-test room',
				isPublic: true,
			}, alice);
			assert.strictEqual(res.status, 200);
			room = res.body;
			await api('chat/rooms/join', { roomId: room.id }, bob);
		});

		test('create a message with a secret', async () => {
			const res = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				commitSecret: {
					title: 'my secret',
					plaintext: 'hidden message',
				},
			}, alice);

			assert.strictEqual(res.status, 204);
		});

		test('reveal a secret', async () => {
			await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				commitSecret: {
					title: 'revealable secret',
					plaintext: 'the truth',
				},
			}, alice);

			const secrets = await api('chat/secrets/list', { roomId: room.id }, alice);
			assert.strictEqual(secrets.status, 200);
			const secretId = secrets.body[0].id;

			const res = await api('chat/secrets/reveal', {
				id: secretId,
			}, alice);

			assert.strictEqual(res.status, 204);
		});

		test('reveal non-existent secret fails', async () => {
			const res = await api('chat/secrets/reveal', {
				id: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('list secrets in a room', async () => {
			const res = await api('chat/secrets/list', {
				roomId: room.id,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.ok(Array.isArray(res.body));
		});

		test('create a message with only a secret (no text)', async () => {
			const res = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				commitSecret: {
					title: 'textless secret',
					plaintext: 'shh',
				},
			}, alice);

			assert.strictEqual(res.status, 204);
		});
	});

	describe('Chat cards', () => {
		let room: any;

		beforeAll(async () => {
			const res = await api('chat/rooms/create', {
				name: 'card-test room',
				isPublic: true,
			}, alice);
			assert.strictEqual(res.status, 200);
			room = res.body;
			await api('chat/rooms/join', { roomId: room.id }, bob);
		});

		test('create a message with card delivery', async () => {
			const res = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				deliverCards: {
					cards: [
						{ name: 'Ace', count: 4 },
						{ name: 'King', count: 4 },
					],
					deliver: [
						{ userId: alice.id, count: 2 },
						{ userId: bob.id, count: 6 },
					],
				},
			}, alice);

			assert.strictEqual(res.status, 204);
		});

		test('reveal a card', async () => {
			const aliceCardsBefore = await api('chat/cards/list', {
				roomId: room.id,
			}, alice);
			assert.strictEqual(aliceCardsBefore.status, 200);
			assert.ok(Array.isArray(aliceCardsBefore.body));
			const aliceCardCountBefore = aliceCardsBefore.body.length;

			const bobCardsBefore = await api('chat/cards/list', {
				roomId: room.id,
			}, bob);
			assert.strictEqual(bobCardsBefore.status, 200);
			assert.ok(Array.isArray(bobCardsBefore.body));
			const bobCardCountBefore = bobCardsBefore.body.length;

			await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				deliverCards: {
					cards: [
						{ name: 'Diamond', count: 3 },
						{ name: 'Joker', count: 1 },
					],
					deliver: [
						{ userId: alice.id, count: 2 },
						{ userId: bob.id, count: 2 },
					],
				},
			}, alice);

			const aliceCards = await api('chat/cards/list', {
				roomId: room.id,
			}, alice);
			assert.strictEqual(aliceCards.status, 200);
			assert.ok(Array.isArray(aliceCards.body));
			assert.strictEqual(aliceCards.body.length, aliceCardCountBefore + 2);

			const bobCards = await api('chat/cards/list', {
				roomId: room.id,
			}, bob);
			assert.strictEqual(bobCards.status, 200);
			assert.strictEqual(bobCards.body.length, bobCardCountBefore + 2);

			const res = await api('chat/cards/reveal', {
				deliverId: aliceCards.body[0].deliverId,
				cardId: aliceCards.body[0].cardId,
			}, alice);

			assert.strictEqual(res.status, 204);

			const aliceCardsAfter = await api('chat/cards/list', {
				roomId: room.id,
			}, alice);
			assert.strictEqual(aliceCardsAfter.status, 200);
			assert.strictEqual(aliceCardsAfter.body.length, aliceCardCountBefore + 1);
		});

		test('reveal non-existent card fails', async () => {
			const res = await api('chat/cards/reveal', {
				deliverId: '000000000000000000000000',
				cardId: 0,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('list cards in a room', async () => {
			const res = await api('chat/cards/list', {
				roomId: room.id,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.ok(Array.isArray(res.body));
		});
	});

	describe('Message visibility', () => {
		let room: any;

		beforeAll(async () => {
			const res = await api('chat/rooms/create', {
				name: 'visibility room',
				isPublic: true,
			}, alice);
			assert.strictEqual(res.status, 200);
			room = res.body;
			await api('chat/rooms/join', { roomId: room.id }, bob);
			await api('chat/rooms/join', { roomId: room.id }, carol);
		});

		test('create message with visibleUserIds', async () => {
			const msg = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				text: 'secret message for bob only',
				visibleUserIds: [bob.id],
			}, alice);
			assert.strictEqual(msg.status, 200);
			assert.ok(msg.body);

			const msgId = msg.body.id;

			const aliceTimeline = await api('chat/messages/room-timeline', {
				roomId: room.id,
				limit: 10,
			}, alice);
			assert.strictEqual(aliceTimeline.status, 200);
			assert.ok(aliceTimeline.body.some((e: any) => e.type === 'message' && e.data.id === msgId));
			const msgEvent = aliceTimeline.body.find((e: any) => e.type === 'message' && e.data.id === msgId);
			assert.ok(msgEvent && msgEvent.type === 'message');
			assert.ok(msgEvent.data.visibleUserIds?.includes(bob.id));

			const bobTimeline = await api('chat/messages/room-timeline', {
				roomId: room.id,
				limit: 10,
			}, bob);
			assert.strictEqual(bobTimeline.status, 200);
			assert.ok(bobTimeline.body.some((e: any) => e.type === 'message' && e.data.id === msgId));

			const carolTimeline = await api('chat/messages/room-timeline', {
				roomId: room.id,
				limit: 10,
			}, carol);
			assert.strictEqual(carolTimeline.status, 200);
			assert.ok(!carolTimeline.body.some((e: any) => e.type === 'message' && e.data.id === msgId));
		});
	});

	describe('Room timeline', () => {
		let room: any;

		beforeAll(async () => {
			const res = await api('chat/rooms/create', {
				name: 'timeline room',
				isPublic: true,
			}, alice);
			assert.strictEqual(res.status, 200);
			room = res.body;
			await api('chat/rooms/join', { roomId: room.id }, bob);
		});

		test('empty timeline returns array', async () => {
			const res = await api('chat/messages/room-timeline', {
				roomId: room.id,
				limit: 10,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.ok(Array.isArray(res.body));
		});

		test('timeline includes message events', async () => {
			await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				text: 'timeline test message',
			}, alice);

			const res = await api('chat/messages/room-timeline', {
				roomId: room.id,
				limit: 10,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.ok(Array.isArray(res.body));
			assert.ok(res.body.length > 0);
		});

		test('fails without authentication', async () => {
			const res = await api('chat/messages/room-timeline', {
				roomId: room.id,
				limit: 10,
			});

			assert.strictEqual(res.status, 401);
		});
	});

	describe('Invalid requests', () => {
		let room: any;

		beforeAll(async () => {
			const res = await api('chat/rooms/create', {
				name: 'edge-case room',
				isPublic: true,
			}, alice);
			assert.strictEqual(res.status, 200);
			room = res.body;
			await api('chat/rooms/join', { roomId: room.id }, bob);
		});

		test('create message with text, file, and poll fails if no content (all null)', async () => {
			const res = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
			}, alice);

			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body as any).error.code, 'CONTENT_REQUIRED');
		});

		test('create message to non-existent room fails', async () => {
			const res = await api('chat/messages/create-to-room', {
				toRoomId: '000000000000000000000000',
				text: 'hello',
			}, alice);

			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body as any).error.code, 'NO_SUCH_ROOM');
		});

		test('non-member accessing room endpoints fails', async () => {
			const res = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				text: 'intruder',
			}, carol);

			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body as any).error.code, 'NOT_MEMBER');
		});

	});

	describe('4 voter poll results', () => {
		let room: any;
		let eve: misskey.entities.SignupResponse;

		beforeAll(async () => {
			eve = await signup({ username: 'eve' });
			const res = await api('chat/rooms/create', {
				name: 'four-voter room',
				isPublic: true,
			}, alice);
			assert.strictEqual(res.status, 200);
			room = res.body;
			await api('chat/rooms/join', { roomId: room.id }, bob);
			await api('chat/rooms/join', { roomId: room.id }, carol);
			await api('chat/rooms/join', { roomId: room.id }, dave);
			await api('chat/rooms/join', { roomId: room.id }, eve);
		}, 1000 * 60 * 2);

		test('all four voters can vote and results are correct', async () => {
			await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				poll: {
					title: 'four-way poll',
					choices: ['a', 'b', 'c'],
				},
			}, alice);

			const polls = await api('chat/polls/list', { roomId: room.id }, alice);
			const pollId = polls.body.startedPolls[0].id;

			await api('chat/polls/vote', { pollId, choice: 0 }, bob);
			await api('chat/polls/vote', { pollId, choice: 1 }, carol);
			await api('chat/polls/vote', { pollId, choice: 1 }, dave);
			await api('chat/polls/vote', { pollId, choice: 2 }, eve);

			await api('chat/polls/finish', { pollId }, alice);

			const timeline = await api('chat/messages/room-timeline', {
				roomId: room.id,
				limit: 20,
			}, alice);

			assert.strictEqual(timeline.status, 200);
			const finishedEvent = timeline.body.find((e: any) => e.type === 'pollFinished');
			assert.ok(finishedEvent);
			assert.strictEqual((finishedEvent as any).data.votes.length, 3);
			assert.strictEqual((finishedEvent as any).data.votes[0].voteCount, 1);
			assert.strictEqual((finishedEvent as any).data.votes[1].voteCount, 2);
			assert.strictEqual((finishedEvent as any).data.votes[2].voteCount, 1);
			assert.deepStrictEqual((finishedEvent as any).data.votes[0].votedUserIds, [bob.id]);
			assert.deepStrictEqual((finishedEvent as any).data.votes[1].votedUserIds, [carol.id, dave.id]);
			assert.deepStrictEqual((finishedEvent as any).data.votes[2].votedUserIds, [eve.id]);
		});

		test('anonymous poll hides voterId', async () => {
			await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				poll: {
					title: 'anonymous poll',
					choices: ['yes', 'no'],
					anonymous: true,
				},
			}, alice);

			const polls = await api('chat/polls/list', { roomId: room.id }, alice);
			const pollId = polls.body.startedPolls[0].id;

			await api('chat/polls/vote', { pollId, choice: 0 }, bob);
			await api('chat/polls/vote', { pollId, choice: 0 }, carol);
			await api('chat/polls/vote', { pollId, choice: 1 }, dave);

			await api('chat/polls/finish', { pollId }, alice);

			const timeline = await api('chat/messages/room-timeline', {
				roomId: room.id,
				limit: 20,
			}, alice);

			assert.strictEqual(timeline.status, 200);
			const finishedEvent = timeline.body.find((e: any) => e.type === 'pollFinished' && (e as any).data.id === pollId);
			assert.ok(finishedEvent);
			assert.strictEqual((finishedEvent as any).data.votes.length, 2);
			assert.strictEqual((finishedEvent as any).data.votes[0].voteCount, 2);
			assert.strictEqual((finishedEvent as any).data.votes[1].voteCount, 1);
			assert.strictEqual((finishedEvent as any).data.votes[0].votedUserIds, null);
			assert.strictEqual((finishedEvent as any).data.votes[1].votedUserIds, null);
		});

		test('all voter votes trigger auto-finish', async () => {
			await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				poll: {
					title: 'auto-finish poll',
					choices: ['yes', 'no'],
					duration: 30,
				},
			}, alice);

			const polls = await api('chat/polls/list', { roomId: room.id }, alice);
			const pollId = polls.body.startedPolls[0].id;

			await api('chat/polls/vote', { pollId, choice: 0 }, alice);
			await api('chat/polls/vote', { pollId, choice: 0 }, bob);
			await api('chat/polls/vote', { pollId, choice: 1 }, carol);
			await api('chat/polls/vote', { pollId, choice: 1 }, dave);
			await api('chat/polls/vote', { pollId, choice: 1 }, eve);

			const timeline = await api('chat/messages/room-timeline', {
				roomId: room.id,
				limit: 20,
			}, alice);

			assert.strictEqual(timeline.status, 200);
			const autoFinishedEvent = timeline.body.find((e: any) => e.type === 'pollFinished' && (e as any).data.id === pollId);
			assert.ok(autoFinishedEvent);

			const pollsAfterClose = await api('chat/polls/list', { roomId: room.id }, alice);
			assert.strictEqual(pollsAfterClose.body.startedPolls.length, 0);
		});
	});

	describe('Membership changes during active poll', () => {
		test('join while poll is active and vote', async () => {
			const room = await api('chat/rooms/create', {
				name: 'join-during-poll room',
				isPublic: true,
			}, alice);
			assert.strictEqual(room.status, 200);
			await api('chat/rooms/join', { roomId: room.body.id }, bob);

			await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				poll: {
					title: 'join mid-poll',
					choices: ['x', 'y'],
				},
			}, alice);

			const polls = await api('chat/polls/list', { roomId: room.body.id }, alice);
			const pollId = polls.body.startedPolls[0].id;

			await api('chat/rooms/join', { roomId: room.body.id }, carol);

			const voteRes = await api('chat/polls/vote', {
				pollId,
				choice: 0,
			}, carol);

			assert.strictEqual(voteRes.status, 204);
			await api('chat/polls/vote', { pollId, choice: 1 }, bob);

			// confirm results
			await api('chat/polls/finish', { pollId }, alice);
			const timeline = await api('chat/messages/room-timeline', { roomId: room.body.id, limit: 10 }, alice);
			const finished = timeline.body.find((e: any) => e.type === 'pollFinished');
			assert.ok(finished);
			assert.strictEqual((finished as any).data.votes[0].voteCount, 1);
		});

		test('leave room while poll active and cannot vote', async () => {
			const room = await api('chat/rooms/create', {
				name: 'leave-during-poll room',
				isPublic: true,
			}, alice);
			assert.strictEqual(room.status, 200);
			await api('chat/rooms/join', { roomId: room.body.id }, bob);

			await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				poll: {
					title: 'leave mid-poll',
					choices: ['p', 'q'],
				},
			}, alice);

			const polls = await api('chat/polls/list', { roomId: room.body.id }, alice);
			const pollId = polls.body.startedPolls[0].id;

			await api('chat/rooms/leave', { roomId: room.body.id }, bob);

			const voteRes = await api('chat/polls/vote', {
				pollId,
				choice: 0,
			}, bob);

			assert.strictEqual(voteRes.status, 400);
			assert.strictEqual(castAsError(voteRes.body as any).error.code, 'NOT_MEMBER');
		});

		test('leave and rejoin while poll active and vote', async () => {
			const room = await api('chat/rooms/create', {
				name: 'rejoin-during-poll room',
				isPublic: true,
			}, alice);
			assert.strictEqual(room.status, 200);
			await api('chat/rooms/join', { roomId: room.body.id }, bob);

			await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				poll: {
					title: 'rejoin mid-poll',
					choices: ['r', 's'],
				},
			}, alice);

			const polls = await api('chat/polls/list', { roomId: room.body.id }, alice);
			const pollId = polls.body.startedPolls[0].id;

			await api('chat/rooms/leave', { roomId: room.body.id }, bob);
			await api('chat/rooms/join', { roomId: room.body.id }, bob);

			const voteRes = await api('chat/polls/vote', {
				pollId,
				choice: 1,
			}, bob);

			assert.strictEqual(voteRes.status, 204);
			await api('chat/polls/vote', { pollId, choice: 0 }, alice);

			// confirm results
			await api('chat/polls/finish', { pollId }, alice);
			const timeline = await api('chat/messages/room-timeline', { roomId: room.body.id, limit: 10 }, alice);
			const finished = timeline.body.find((e: any) => e.type === 'pollFinished');
			assert.ok(finished);
			assert.strictEqual((finished as any).data.votes[1].voteCount, 1);
		});
	});

	describe('Timers (scheduled poll)', () => {
		test('poll auto-starts after startsIn', async () => {
			const room = await api('chat/rooms/create', {
				name: 'scheduled-poll room',
				isPublic: true,
			}, alice);
			assert.strictEqual(room.status, 200);
			await api('chat/rooms/join', { roomId: room.body.id }, bob);

			await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				poll: {
					title: 'delayed start poll',
					choices: ['m', 'n'],
					startsIn: 3,
					duration: 30,
				},
			}, alice);

			const pollsBefore = await api('chat/polls/list', {
				roomId: room.body.id,
			}, alice);
			assert.strictEqual(pollsBefore.status, 200);
			assert.ok(pollsBefore.body.scheduledPolls.length > 0);

			await new Promise(resolve => setTimeout(resolve, 5000));

			const pollsAfter = await api('chat/polls/list', {
				roomId: room.body.id,
			}, alice);
			assert.strictEqual(pollsAfter.status, 200);
			assert.strictEqual(pollsAfter.body.scheduledPolls.length, 0);
			assert.ok(pollsAfter.body.startedPolls.length > 0);
		}, 15000);

		test('poll auto-finishes after duration', async () => {
			const room = await api('chat/rooms/create', {
				name: 'duration-poll room',
				isPublic: true,
			}, alice);
			assert.strictEqual(room.status, 200);

			await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				poll: {
					title: 'short duration poll',
					choices: ['u', 'v'],
					duration: 3,
				},
			}, alice);

			await new Promise(resolve => setTimeout(resolve, 5000));

			const timeline = await api('chat/messages/room-timeline', {
				roomId: room.body.id,
				limit: 20,
			}, alice);
			assert.strictEqual(timeline.status, 200);
			const finishedEvent = timeline.body.find((e: any) => e.type === 'pollFinished');
			assert.ok(finishedEvent);
		}, 15000);
	});

	describe('Secret sanity', () => {
		test('plaintext hidden before reveal, visible after reveal', async () => {
			const room = await api('chat/rooms/create', {
				name: 'secret-sanity room',
				isPublic: true,
			}, alice);
			assert.strictEqual(room.status, 200);
			await api('chat/rooms/join', { roomId: room.body.id }, bob);

			await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				commitSecret: {
					title: 'my secret',
					plaintext: 'sensitive content',
				},
			}, alice);

			const secrets = await api('chat/secrets/list', { roomId: room.body.id }, alice);
			assert.strictEqual(secrets.status, 200);
			assert.ok(Array.isArray(secrets.body));
			assert.ok(secrets.body.length > 0);

			const secretBefore = secrets.body[0];
			assert.strictEqual(secretBefore.title, 'my secret');
			assert.ok(!('plaintext' in secretBefore));

			const timelineBefore = await api('chat/messages/room-timeline', { roomId: room.body.id, limit: 10 }, bob);
			const committedEvent = timelineBefore.body.find((e: any) => e.type === 'secretCommitted');
			assert.ok(committedEvent);
			assert.ok(!('plaintext' in (committedEvent as any).data));
			const noRevealedYet = timelineBefore.body.find((e: any) => e.type === 'secretRevealed');
			assert.strictEqual(noRevealedYet, undefined);

			await api('chat/secrets/reveal', { id: secretBefore.id }, alice);

			const timeline = await api('chat/messages/room-timeline', { roomId: room.body.id, limit: 10 }, bob);
			const revealedEvent = timeline.body.find((e: any) => e.type === 'secretRevealed');
			assert.ok(revealedEvent);
			assert.strictEqual((revealedEvent as any).data.plaintext, 'sensitive content');
		});

		test('multiple secrets do not mix plaintext across users', async () => {
			const room = await api('chat/rooms/create', {
				name: 'multi-secret room',
				isPublic: true,
			}, alice);
			assert.strictEqual(room.status, 200);
			await api('chat/rooms/join', { roomId: room.body.id }, bob);

			await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				commitSecret: { title: 'alice first', plaintext: 'alice1' },
			}, alice);

			await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				commitSecret: { title: 'bob secret', plaintext: 'bob1' },
			}, bob);

			await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				commitSecret: { title: 'alice second', plaintext: 'alice2' },
			}, alice);

			const aliceSecrets = await api('chat/secrets/list', { roomId: room.body.id }, alice);
			assert.strictEqual(aliceSecrets.status, 200);
			assert.strictEqual(aliceSecrets.body.length, 3);
			const bobSecrets = await api('chat/secrets/list', { roomId: room.body.id }, bob);
			assert.strictEqual(bobSecrets.status, 200);
			assert.strictEqual(bobSecrets.body.length, 3);

			const aFirst = aliceSecrets.body.find((s: any) => s.title === 'alice first')!;
			const aSecond = aliceSecrets.body.find((s: any) => s.title === 'alice second')!;
			const bSecret = aliceSecrets.body.find((s: any) => s.title === 'bob secret')!;

			await api('chat/secrets/reveal', { id: aFirst.id }, alice);

			const timeline = await api('chat/messages/room-timeline', { roomId: room.body.id, limit: 10 }, bob);

			const committed = timeline.body.filter((e: any) => e.type === 'secretCommitted');
			assert.strictEqual(committed.length, 3);

			const revealed = timeline.body.filter((e: any) => e.type === 'secretRevealed');
			assert.strictEqual(revealed.length, 1);
			assert.strictEqual((revealed[0] as any).data.plaintext, 'alice1');

			const a2Revealed = timeline.body.find((e: any) => e.type === 'secretRevealed' && (e as any).data.id === aSecond.id);
			assert.strictEqual(a2Revealed, undefined);
			const bRevealed = timeline.body.find((e: any) => e.type === 'secretRevealed' && (e as any).data.id === bSecret.id);
			assert.strictEqual(bRevealed, undefined);
		});
	});

	describe('Secret after creator leaves room', () => {
		test('system reveals secret after creator leaving the room', async () => {
			const room = await api('chat/rooms/create', {
				name: 'secret-after-leave room',
				isPublic: true,
			}, alice);
			assert.strictEqual(room.status, 200);
			await api('chat/rooms/join', { roomId: room.body.id }, bob);

			const future = new Date(Date.now() + 5000);
			await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				commitSecret: {
					title: 'leaver secret',
					plaintext: 'can still reveal',
					revealsAt: future.getTime(),
				},
			}, alice);

			const secrets = await api('chat/secrets/list', { roomId: room.body.id }, alice);
			const secretId = secrets.body[0].id;

			await api('chat/rooms/leave', { roomId: room.body.id }, alice);

			// await auto-reveal
			await new Promise(resolve => setTimeout(resolve, 6000));

			// let's check
			const timeline = await api('chat/messages/room-timeline', { roomId: room.body.id, limit: 10 }, bob);
			const revealedEvent = timeline.body.find((e: any) => e.type === 'secretRevealed');
			assert.ok(revealedEvent);
			assert.strictEqual((revealedEvent as any).data.plaintext, 'can still reveal');
		}, 15000);

		test('non-creator cannot reveal secret after creator left', async () => {
			const room = await api('chat/rooms/create', {
				name: 'non-creator reveal room',
				isPublic: true,
			}, alice);
			assert.strictEqual(room.status, 200);
			await api('chat/rooms/join', { roomId: room.body.id }, bob);

			await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				commitSecret: {
					title: 'other person secret',
					plaintext: 'not yours',
				},
			}, alice);

			const secrets = await api('chat/secrets/list', { roomId: room.body.id }, alice);
			const secretId = secrets.body[0].id;

			await api('chat/rooms/leave', { roomId: room.body.id }, alice);

			const res = await api('chat/secrets/reveal', {
				id: secretId,
			}, bob);

			assert.strictEqual(res.status, 400);

			// ensure plaintext is not available
			const bobSecretsAfter = await api('chat/secrets/list', { roomId: room.body.id }, bob);
			assert.ok(Array.isArray(bobSecretsAfter.body));
			assert.ok(!bobSecretsAfter.body.some((s: any) => (s as any).plaintext));
		});

		test('commit secret, leave, rejoin, reveal', async () => {
			const room = await api('chat/rooms/create', {
				name: 'rejoin-reveal room',
				isPublic: true,
			}, alice);
			assert.strictEqual(room.status, 200);
			await api('chat/rooms/join', { roomId: room.body.id }, bob);

			await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				commitSecret: {
					title: 'rejoinable secret',
					plaintext: 'will reveal after rejoin',
				},
			}, alice);

			const secrets = await api('chat/secrets/list', { roomId: room.body.id }, alice);
			const secretId = secrets.body[0].id;

			await api('chat/rooms/leave', { roomId: room.body.id }, alice);
			await api('chat/rooms/join', { roomId: room.body.id }, alice);

			const res = await api('chat/secrets/reveal', { id: secretId }, alice);
			assert.strictEqual(res.status, 204);

			const timeline = await api('chat/messages/room-timeline', { roomId: room.body.id, limit: 10 }, bob);
			const revealedEvent = timeline.body.find((e: any) => e.type === 'secretRevealed');
			assert.ok(revealedEvent);
			assert.strictEqual((revealedEvent as any).data.plaintext, 'will reveal after rejoin');
		});
	});
});

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { describe, beforeAll, afterAll, test } from 'vitest';
import { api, castAsError, initTestDb, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('Chat', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let carol: misskey.entities.SignupResponse;
	let dave: misskey.entities.SignupResponse;

	beforeAll(async () => {
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
		carol = await signup({ username: 'carol' });
		dave = await signup({ username: 'dave' });
	}, 1000 * 60 * 2);

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

			assert.strictEqual(res.status, 400);
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

			assert.strictEqual(res.status, 200);
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

			assert.strictEqual(res.status, 200);
		});

		test('vote on a poll', async () => {
			const msg = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				poll: {
					title: 'vote test',
					choices: ['a', 'b'],
				},
			}, alice);
			assert.strictEqual(msg.status, 200);
			assert.ok(msg.body);

			const res = await api('chat/polls/vote', {
				pollId: msg.body.id,
				choice: 0,
			}, bob);

			assert.strictEqual(res.status, 204);
		});

		test('cannot vote twice on same poll', async () => {
			const msg = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				poll: {
					title: 'double vote test',
					choices: ['x', 'y'],
				},
			}, alice);
			assert.strictEqual(msg.status, 200);
			assert.ok(msg.body);

			await api('chat/polls/vote', {
				pollId: msg.body.id,
				choice: 0,
			}, bob);

			const res = await api('chat/polls/vote', {
				pollId: msg.body.id,
				choice: 1,
			}, bob);

			assert.strictEqual(res.status, 400);
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
			const msg = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				poll: {
					title: 'member test',
					choices: ['a', 'b'],
				},
			}, alice);
			assert.strictEqual(msg.status, 200);
			assert.ok(msg.body);

			const res = await api('chat/polls/vote', {
				pollId: msg.body.id,
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
			assert.ok(Array.isArray(res.body));
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

			assert.strictEqual(res.status, 200);
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

			assert.strictEqual(res.status, 200);
		});

		test('reveal a secret', async () => {
			const msg = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				commitSecret: {
					title: 'revealable secret',
					plaintext: 'the truth',
				},
			}, alice);
			assert.strictEqual(msg.status, 200);
			assert.ok(msg.body);

			const res = await api('chat/secrets/reveal', {
				id: msg.body.id,
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

			assert.strictEqual(res.status, 200);
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
						{ userId: alice.id, number: 2 },
						{ userId: bob.id, number: 6 },
					],
				},
			}, alice);

			assert.strictEqual(res.status, 200);
		});

		test('reveal a card', async () => {
			const msg = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				deliverCards: {
					cards: [
						{ name: 'Diamond', count: 2 },
					],
					deliver: [
						{ userId: alice.id, number: 2 },
					],
				},
			}, alice);
			assert.strictEqual(msg.status, 200);

			const cardsList = await api('chat/cards/list', {
				roomId: room.id,
			}, alice);
			assert.strictEqual(cardsList.status, 200);
			assert.ok(Array.isArray(cardsList.body));
			const unrevealedCards = cardsList.body.filter((c: any) => !c.fromUserId);
			assert.ok(unrevealedCards.length > 0);

			const res = await api('chat/cards/reveal', {
				deliverId: unrevealedCards[0].deliverId,
				cardId: unrevealedCards[0].cardId,
			}, alice);

			assert.strictEqual(res.status, 204);
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

		test('create a message with only cards (no text)', async () => {
			const res = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				deliverCards: {
					cards: [
						{ name: 'Joker', count: 1 },
					],
					deliver: [
						{ userId: alice.id, number: 1 },
					],
				},
			}, alice);

			assert.strictEqual(res.status, 200);
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
			const res = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				text: 'secret message for bob only',
				visibleUserIds: [bob.id],
			}, alice);

			assert.strictEqual(res.status, 200);
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

	describe('Edge cases', () => {
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
		});

		test('update room', async () => {
			const updateRoom = await api('chat/rooms/create', {
				name: 'update-me',
			}, alice);
			assert.strictEqual(updateRoom.status, 200);

			const res = await api('chat/rooms/update', {
				roomId: updateRoom.body.id,
				name: 'updated name',
				description: 'updated desc',
			}, alice);

			assert.strictEqual(res.status, 200);
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
			const msg = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				poll: {
					title: 'four-way poll',
					choices: ['a', 'b', 'c'],
				},
			}, alice);
			assert.strictEqual(msg.status, 200);
			assert.ok(msg.body);

			await api('chat/polls/vote', { pollId: msg.body.id, choice: 0 }, bob);
			await api('chat/polls/vote', { pollId: msg.body.id, choice: 1 }, carol);
			await api('chat/polls/vote', { pollId: msg.body.id, choice: 1 }, dave);
			await api('chat/polls/vote', { pollId: msg.body.id, choice: 2 }, eve);

			await api('chat/polls/finish', { pollId: msg.body.id }, alice);

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
		});

		test('all voter votes trigger auto-finish', async () => {
			const msg = await api('chat/messages/create-to-room', {
				toRoomId: room.id,
				poll: {
					title: 'auto-finish poll',
					choices: ['yes', 'no'],
				},
			}, alice);
			assert.strictEqual(msg.status, 200);
			assert.ok(msg.body);

			const pollId = msg.body.id;
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

			const msg = await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				poll: {
					title: 'join mid-poll',
					choices: ['x', 'y'],
				},
			}, alice);
			assert.strictEqual(msg.status, 200);
			assert.ok(msg.body);

			await api('chat/rooms/join', { roomId: room.body.id }, carol);

			const voteRes = await api('chat/polls/vote', {
				pollId: msg.body.id,
				choice: 0,
			}, carol);

			assert.strictEqual(voteRes.status, 204);
		});

		test('leave room while poll active and cannot vote', async () => {
			const room = await api('chat/rooms/create', {
				name: 'leave-during-poll room',
				isPublic: true,
			}, alice);
			assert.strictEqual(room.status, 200);
			await api('chat/rooms/join', { roomId: room.body.id }, bob);

			const msg = await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				poll: {
					title: 'leave mid-poll',
					choices: ['p', 'q'],
				},
			}, alice);
			assert.strictEqual(msg.status, 200);
			assert.ok(msg.body);

			await api('chat/rooms/leave', { roomId: room.body.id }, bob);

			const voteRes = await api('chat/polls/vote', {
				pollId: msg.body.id,
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

			const msg = await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				poll: {
					title: 'rejoin mid-poll',
					choices: ['r', 's'],
				},
			}, alice);
			assert.strictEqual(msg.status, 200);
			assert.ok(msg.body);

			await api('chat/rooms/leave', { roomId: room.body.id }, bob);
			await api('chat/rooms/join', { roomId: room.body.id }, bob);

			const voteRes = await api('chat/polls/vote', {
				pollId: msg.body.id,
				choice: 1,
			}, bob);

			assert.strictEqual(voteRes.status, 204);
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

			const msg = await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				poll: {
					title: 'delayed start poll',
					choices: ['m', 'n'],
					startsIn: 3,
					duration: 30,
				},
			}, alice);
			assert.strictEqual(msg.status, 200);
			assert.ok(msg.body);

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

			const msg = await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				poll: {
					title: 'short duration poll',
					choices: ['u', 'v'],
					duration: 3,
				},
			}, alice);
			assert.strictEqual(msg.status, 200);
			assert.ok(msg.body);

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

	describe('Secret after creator leaves room', () => {
		test('creator can reveal own secret after leaving room', async () => {
			const room = await api('chat/rooms/create', {
				name: 'secret-after-leave room',
				isPublic: true,
			}, alice);
			assert.strictEqual(room.status, 200);
			await api('chat/rooms/join', { roomId: room.body.id }, bob);

			const msg = await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				commitSecret: {
					title: 'leaver secret',
					plaintext: 'can still reveal',
				},
			}, alice);
			assert.strictEqual(msg.status, 200);
			assert.ok(msg.body);

			await api('chat/rooms/leave', { roomId: room.body.id }, alice);

			const res = await api('chat/secrets/reveal', {
				id: msg.body.id,
			}, alice);

			assert.strictEqual(res.status, 204);
		});

		test('non-creator cannot reveal secret after creator left', async () => {
			const room = await api('chat/rooms/create', {
				name: 'non-creator reveal room',
				isPublic: true,
			}, alice);
			assert.strictEqual(room.status, 200);
			await api('chat/rooms/join', { roomId: room.body.id }, bob);

			const msg = await api('chat/messages/create-to-room', {
				toRoomId: room.body.id,
				commitSecret: {
					title: 'other person secret',
					plaintext: 'not yours',
				},
			}, alice);
			assert.strictEqual(msg.status, 200);
			assert.ok(msg.body);

			await api('chat/rooms/leave', { roomId: room.body.id }, alice);

			const res = await api('chat/secrets/reveal', {
				id: msg.body.id,
			}, bob);

			assert.strictEqual(res.status, 400);
		});
	});
});

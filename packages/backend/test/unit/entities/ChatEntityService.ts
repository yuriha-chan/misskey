/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, beforeAll, afterAll, test } from 'vitest';
import type { MiUser } from '@/models/User.js';
import { ChatEntityService, type MiChatPollWithVotes } from '@/core/entities/ChatEntityService.js';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { genAidx } from '@/misc/id/aidx.js';
import {
	ChatCardsRepository,
	ChatPollsRepository,
	ChatPollVotesRepository,
	ChatRoomMembershipsRepository,
	ChatRoomsRepository,
	ChatSecretsRepository,
	FollowingsRepository,
	MiUserProfile,
	UserProfilesRepository,
	UsersRepository,
} from '@/models/_.js';
import { DI } from '@/di-symbols.js';

process.env.NODE_ENV = 'test';

describe('ChatEntityService', () => {
	describe('packPoll/packSecret/packCard', () => {
		let app: TestingModule;
		let service: ChatEntityService;
		let usersRepository: UsersRepository;
		let userProfileRepository: UserProfilesRepository;
		let chatRoomsRepository: ChatRoomsRepository;
		let chatRoomMembershipsRepository: ChatRoomMembershipsRepository;
		let chatPollsRepository: ChatPollsRepository;
		let chatPollVotesRepository: ChatPollVotesRepository;
		let chatSecretsRepository: ChatSecretsRepository;
		let chatCardsRepository: ChatCardsRepository;
		let followingRepository: FollowingsRepository;

		async function createUser(userData: Partial<MiUser> = {}, profileData: Partial<MiUserProfile> = {}) {
			const un = secureRndstr(16);
			const user = await usersRepository
				.insert({
					...userData,
					id: genAidx(Date.now()),
					username: un,
					usernameLower: un.toLowerCase(),
				})
				.then(x => usersRepository.findOneByOrFail(x.identifiers[0]));

			await userProfileRepository.insert({
				...profileData,
				userId: user.id,
			});

			return user;
		}

		async function createRoom(ownerId?: string, name: string = 'test-room') {
			if (ownerId == null) {
				ownerId = (await createUser()).id;
			}
			const id = genAidx(Date.now());
			await chatRoomsRepository.insert({
				id,
				name,
				description: '',
				ownerId,
				isArchived: false,
				isPublic: false,
				capacity: 30,
			});
			return (await chatRoomsRepository.findOneByOrFail({ id }));
		}

		async function addMember(roomId: string, userId: string) {
			await chatRoomMembershipsRepository.insert({
				id: genAidx(Date.now()),
				roomId,
				userId,
				isMuted: false,
				hasLeft: false,
			});
		}

		async function createPoll(
			roomId: string,
			ownerId: string,
			options: {
				title?: string;
				choices?: string[];
				voteForUsers?: boolean;
				anonymous?: boolean;
				startsAt?: Date;
				duration?: number;
			} = {},
		) {
			const id = genAidx(Date.now());
			await chatPollsRepository.insert({
				id,
				roomId,
				ownerId,
				title: options.title ?? 'Test Poll',
				choices: options.choices ?? ['A', 'B'],
				voteForUsers: options.voteForUsers ?? false,
				anonymous: options.anonymous ?? false,
				startsAt: options.startsAt ?? null,
				startedId: null,
				duration: options.duration ?? null,
				finishedId: null,
			});
			return (await chatPollsRepository.findOneByOrFail({ id }));
		}

		async function startPoll(pollId: string) {
			const eventId = genAidx(Date.now());
			await chatPollsRepository.update({ id: pollId }, {
				startedId: eventId,
				startsAt: new Date(),
			});
		}

		async function finishPoll(pollId: string) {
			const eventId = genAidx(Date.now());
			await chatPollsRepository.update({ id: pollId }, {
				finishedId: eventId,
			});
		}

		async function createVote(pollId: string, userId: string, choice: number) {
			await chatPollVotesRepository.insert({
				id: genAidx(Date.now()),
				pollId,
				userId,
				choice,
			});
		}

		async function createSecret(
			roomId: string,
			userId: string,
			options: {
				title?: string;
				plaintext?: string;
				revealsAt?: Date;
			} = {},
		) {
			const id = genAidx(Date.now());
			await chatSecretsRepository.insert({
				id,
				roomId,
				userId,
				title: options.title ?? 'Test Secret',
				plaintext: options.plaintext ?? 'secret text',
				revealsAt: options.revealsAt ?? null,
				revealedId: null,
			});
			return (await chatSecretsRepository.findOneByOrFail({ id }));
		}

		async function revealSecret(secretId: string) {
			const eventId = genAidx(Date.now());
			await chatSecretsRepository.update({ id: secretId }, {
				revealedId: eventId,
			});
		}

		async function createCard(
			deliverId: string,
			cardId: number,
			roomId: string,
			userId: string,
			cardKind: string,
		) {
			await chatCardsRepository.insert({
				deliverId,
				cardId,
				roomId,
				userId,
				cardKind,
				revealedId: null,
			});
		}

		async function revealCard(deliverId: string, cardId: number) {
			const eventId = genAidx(Date.now());
			await chatCardsRepository.update(
				{ deliverId, cardId },
				{ revealedId: eventId },
			);
		}

		beforeAll(async () => {
			const services = [
				ChatEntityService,
			];

			app = await Test.createTestingModule({
				imports: [GlobalModule, CoreModule],
				providers: [
					...services,
					...services.map(x => ({ provide: x.name, useExisting: x })),
				],
			}).compile();
			await app.init();
			app.enableShutdownHooks();

			service = app.get<ChatEntityService>(ChatEntityService);
			usersRepository = app.get<UsersRepository>(DI.usersRepository);
			userProfileRepository = app.get<UserProfilesRepository>(DI.userProfilesRepository);
			chatRoomsRepository = app.get<ChatRoomsRepository>(DI.chatRoomsRepository);
			chatRoomMembershipsRepository = app.get<ChatRoomMembershipsRepository>(DI.chatRoomMembershipsRepository);
			chatPollsRepository = app.get<ChatPollsRepository>(DI.chatPollsRepository);
			chatPollVotesRepository = app.get<ChatPollVotesRepository>(DI.chatPollVotesRepository);
			chatSecretsRepository = app.get<ChatSecretsRepository>(DI.chatSecretsRepository);
			chatCardsRepository = app.get<ChatCardsRepository>(DI.chatCardsRepository);
			followingRepository = app.get<FollowingsRepository>(DI.followingsRepository);
		});

		afterAll(async () => {
			await app.close();
		});

		test('packPollScheduled - basic', async () => {
			const user = await createUser();
			const room = await createRoom();
			const futureDate = new Date(Date.now() + 3600_000);
			const poll = await createPoll(room.id, user.id, { title: 'scheduled poll', startsAt: futureDate });

			const result = await service.packPollScheduled(poll) as any;
			expect(result.id).toBe(poll.id);
			expect(result.title).toBe('scheduled poll');
			expect(result.fromUserId).toBe(user.id);
			expect(result.roomId).toBe(room.id);
			expect(result.startsAt).toBe(futureDate.toISOString());
		});

		test('packPollScheduled - without startsAt', async () => {
			const user = await createUser();
			const room = await createRoom();
			const poll = await createPoll(room.id, user.id, { title: 'no date poll' });

			const result = await service.packPollScheduled(poll) as any;
			expect(result.startsAt).toBeUndefined();
		});

		test('packPollStarted - text choices', async () => {
			const user = await createUser();
			const room = await createRoom();
			const poll = await createPoll(room.id, user.id, {
				title: 'text poll',
				choices: ['apple', 'banana'],
				voteForUsers: false,
			});
			await startPoll(poll.id);
			const updatedPoll = await chatPollsRepository.findOneByOrFail({ id: poll.id });

			const result = await service.packPollStarted(updatedPoll) as any;
			expect(result.title).toBe('text poll');
			expect(result.voteForUsers).toBe(false);
			expect(result.textChoices).toEqual(['apple', 'banana']);
			expect(result.userChoices).toBeNull();
		});

		test('packPollStarted - user choices (voteForUsers)', async () => {
			const owner = await createUser();
			const alice = await createUser();
			const bob = await createUser();
			const room = await createRoom();
			const poll = await createPoll(room.id, owner.id, {
				title: 'user poll',
				choices: [alice.id, bob.id],
				voteForUsers: true,
			});
			await startPoll(poll.id);
			const updatedPoll = await chatPollsRepository.findOneByOrFail({ id: poll.id });

			const result = await service.packPollStarted(updatedPoll) as any;
			expect(result.voteForUsers).toBe(true);
			expect(result.textChoices).toBeNull();
			expect(result.userChoices).toHaveLength(2);
			expect(result.userChoices[0].id).toBe(alice.id);
			expect(result.userChoices[1].id).toBe(bob.id);
		});

		test('packPollFinished - vote aggregation', async () => {
			const owner = await createUser();
			const alice = await createUser();
			const bob = await createUser();
			const room = await createRoom();
			const poll = await createPoll(room.id, owner.id, {
				title: 'vote poll',
				choices: ['yes', 'no'],
			});
			await startPoll(poll.id);
			await createVote(poll.id, alice.id, 0);
			await createVote(poll.id, bob.id, 0);
			await createVote(poll.id, owner.id, 1);
			await finishPoll(poll.id);

			const pollWithVotes = await chatPollsRepository.findOne({
				where: { id: poll.id },
				relations: ['votes'],
			}) as MiChatPollWithVotes;

			const result = await service.packPollFinished(pollWithVotes) as any;
			expect(result.title).toBe('vote poll');
			expect(result.votes).toHaveLength(2);
			expect(result.votes[0].text).toBe('yes');
			expect(result.votes[0].voteCount).toBe(2);
			expect(result.votes[1].text).toBe('no');
			expect(result.votes[1].voteCount).toBe(1);
		});

		test('packPollFinished - anonymous hides votedUserIds', async () => {
			const owner = await createUser();
			const room = await createRoom();
			const poll = await createPoll(room.id, owner.id, {
				title: 'anonymous poll',
				choices: ['cat', 'dog'],
				anonymous: true,
			});
			await startPoll(poll.id);
			await createVote(poll.id, owner.id, 0);
			await finishPoll(poll.id);

			const pollWithVotes = await chatPollsRepository.findOne({
				where: { id: poll.id },
				relations: ['votes'],
			}) as MiChatPollWithVotes;

			const result = await service.packPollFinished(pollWithVotes) as any;
			expect(result.anonymous).toBe(true);
			expect(result.votes[0].votedUserIds).toBeNull();
		});

		test('packPollFinished - non-anonymous exposes votedUserIds', async () => {
			const owner = await createUser();
			const alice = await createUser();
			const room = await createRoom();
			const poll = await createPoll(room.id, owner.id, {
				title: 'public vote poll',
				choices: ['x', 'y'],
				anonymous: false,
			});
			await startPoll(poll.id);
			await createVote(poll.id, alice.id, 0);
			await finishPoll(poll.id);

			const pollWithVotes = await chatPollsRepository.findOne({
				where: { id: poll.id },
				relations: ['votes'],
			}) as MiChatPollWithVotes;

			const result = await service.packPollFinished(pollWithVotes) as any;
			expect(result.anonymous).toBe(false);
			expect(result.votes[0].votedUserIds).toContain(alice.id);
		});

		test('packPollFinished - zero votes', async () => {
			const owner = await createUser();
			const room = await createRoom();
			const poll = await createPoll(room.id, owner.id, {
				title: 'no votes',
				choices: ['a', 'b', 'c'],
			});
			await startPoll(poll.id);
			await finishPoll(poll.id);

			const pollWithVotes = await chatPollsRepository.findOne({
				where: { id: poll.id },
				relations: ['votes'],
			}) as MiChatPollWithVotes;

			const result = await service.packPollFinished(pollWithVotes) as any;
			expect(result.votes).toHaveLength(3);
			expect(result.votes[0].voteCount).toBe(0);
			expect(result.votes[1].voteCount).toBe(0);
			expect(result.votes[2].voteCount).toBe(0);
		});

		test('packSecret - does not expose plaintext', async () => {
			const user = await createUser();
			const room = await createRoom();
			const futureDate = new Date(Date.now() + 3600_000);
			const secret = await createSecret(room.id, user.id, {
				title: 'hidden secret',
				plaintext: 'sensitive content',
				revealsAt: futureDate,
			});

			const result = await service.packSecret(secret) as any;
			expect(result.id).toBe(secret.id);
			expect(result.title).toBe('hidden secret');
			expect(result.fromUserId).toBe(user.id);
			expect(result.roomId).toBe(room.id);
			expect(result.revealsAt).toBe(futureDate.toISOString());
			expect(result.plaintext).toBeUndefined();
		});

		test('packSecretRevealed - exposes plaintext', async () => {
			const user = await createUser();
			const room = await createRoom();
			const secret = await createSecret(room.id, user.id, {
				title: 'revealed secret',
				plaintext: 'the secret content',
			});
			await revealSecret(secret.id);
			const updatedSecret = await chatSecretsRepository.findOneByOrFail({ id: secret.id });

			const result = await service.packSecretRevealed(updatedSecret) as any;
			expect(result.id).toBe(secret.id);
			expect(result.title).toBe('revealed secret');
			expect(result.plaintext).toBe('the secret content');
		});

		test('packCard - does not expose userId', async () => {
			const room = await createRoom();
			const user = await createUser();
			const deliverId = genAidx(Date.now());
			await createCard(deliverId, 0, room.id, user.id, 'Ace of Spades');

			const cards = await chatCardsRepository.find({ where: { deliverId } });
			const result = await service.packCard(cards[0]) as any;
			expect(result.deliverId).toBe(deliverId);
			expect(result.cardId).toBe(0);
			expect(result.cardKind).toBe('Ace of Spades');
			expect(result.roomId).toBe(room.id);
			expect(result.fromUserId).toBeUndefined();
		});

		test('packCardRevealed - exposes userId', async () => {
			const room = await createRoom();
			const user = await createUser();
			const deliverId = genAidx(Date.now());
			await createCard(deliverId, 0, room.id, user.id, 'Queen of Hearts');
			await revealCard(deliverId, 0);

			const cards = await chatCardsRepository.find({ where: { deliverId } });
			const result = await service.packCardRevealed(cards[0]) as any;
			expect(result.deliverId).toBe(deliverId);
			expect(result.cardId).toBe(0);
			expect(result.cardKind).toBe('Queen of Hearts');
			expect(result.roomId).toBe(room.id);
			expect(result.fromUserId).toBe(user.id);
		});
	});
});

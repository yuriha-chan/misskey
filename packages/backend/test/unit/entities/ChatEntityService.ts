/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Test, TestingModule } from '@nestjs/testing';
import type { MiUser } from '@/models/User.js';
import { ChatEntityService } from '@/core/entities/UserEntityService.js';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { genAidx } from '@/misc/id/aidx.js';
import {
	MiUserProfile, MutingsRepository, RenoteMutingsRepository,
	UsersRepository,
} from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ChatService } from '@/core/ChatService.js';

process.env.NODE_ENV = 'test';

describe('UserEntityService', () => {
	describe('pack/packMany', () => {
		let app: TestingModule;
		let service: ChatEntityService;
		let usersRepository: UsersRepository;
		let userProfileRepository: UserProfilesRepository;
		let userMemosRepository: UserMemoRepository;
		let followingRepository: FollowingsRepository;
		let followingRequestRepository: FollowRequestsRepository;
		let blockingRepository: BlockingsRepository;
		let mutingRepository: MutingsRepository;
		let renoteMutingsRepository: RenoteMutingsRepository;

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

		async function createRoom(i: MiUser, roomId: MiUser) {
			await chatRoomsRepository.insert({
				id: genAidx(Date.now()),
				followerId: follower.id,
				followeeId: followee.id,
			});
		}

		async function join(i: MiUser, roomId: MiUser) {
			await followingRepository.insert({
				id: genAidx(Date.now()),
				followerId: follower.id,
				followeeId: followee.id,
			});
		}

		async function startPoll(mutant: MiUser, mutee: MiUser) {
			await mutingRepository.insert({
				id: genAidx(Date.now()),
				muterId: mutant.id,
				muteeId: mutee.id,
			});
		}

		async function vote(requester: MiUser, requestee: MiUser) {
			await followingRequestRepository.insert({
				id: genAidx(Date.now()),
				followerId: requester.id,
				followeeId: requestee.id,
			});
		}

		async function finishVote(mutant: MiUser, mutee: MiUser) {
			await renoteMutingsRepository.insert({
				id: genAidx(Date.now()),
				muterId: mutant.id,
				muteeId: mutee.id,
			});
		}

		beforeAll(async () => {
			const services = [
				ChatEntityService,
				ChatService,
				UserEntityService,
				IdService,
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
		});

		afterAll(async () => {
			await app.close();
		});

		test('UserLite', async() => {
			const me = await createUser();
			const who = await createUser();

			const room = await createRoom(me);
			await join(room, me);
			await join(room, who);
			const poll = createPoll(me, { choices: [me, who] });
			await startPoll(poll);
			await vote(poll, me, 0)
			await vote(poll, who, 0)
			await finishPoll(poll);

			const actual = await service.packPollFinished(poll) as any;
			expect(actual.votes[0].voteCount) == 2;
			expect(actual.votes[1].voteCount) == 0;
		});
	});
});

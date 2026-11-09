/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { ChatPollsRepository, ChatPollVotesRepository, ChatRoomMembershipsRepository, MiUser, MiChatRoomMembership, MiChatPoll, MiChatPollVote, MiChatRoom } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import { ChatService } from '@/core/ChatService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { bindThis } from '@/decorators.js';

@Injectable()
export class ChatPollService {
	constructor(
		@Inject(DI.chatPollsRepository)
		private chatPollsRepository: ChatPollsRepository,

		@Inject(DI.chatPollVotesRepository)
		private chatPollVotesRepository: ChatPollVotesRepository,

		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,

		private idService: IdService,
		private chatService: ChatService,
	) {
	}

	@bindThis
	public async vote(userId: MiUser['id'], id: MiChatPoll['id'], choice: number) {
		const poll = await this.chatPollsRepository.findOneBy({ id });

		if (poll == null) throw new IdentifiableError('5d80dd81-83e5-4de7-beab-1924c8fe0325', 'poll not found');

		if (poll.choices[choice] == null) throw new IdentifiableError('d9fa2f14-1686-4bfa-9a5b-b358ed694285', 'invalid choice param');

		if (poll.finishedId != null) throw new IdentifiableError('a67aa4e6-a730-41d8-b9fe-4e9a934b9d85', 'poll already closed');

		const memberships: MiChatRoomMembership[] = await this.chatRoomMembershipsRepository.findBy({ roomId: poll.roomId, hasLeft: false });
		if (!memberships.some((m) => m.userId === userId)) {
			throw new IdentifiableError('fedcba09-8765-4321-0fed-cba987654321', 'not a room member');
		}

		const exist = await this.chatPollVotesRepository.findBy({
			pollId: id,
			userId: userId,
		});

		if (exist.length > 0) {
			throw new IdentifiableError('aaf3a28a-718c-4f72-8dc2-d280fcf1ea60', 'cannot vote more');
		}
		if (exist.some(x => x.choice === choice)) {
			throw new IdentifiableError('aaf3a28a-718c-4f72-8dc2-d280fcf1ea60', 'already voted');
		}

		await this.chatPollVotesRepository.insert({
			id: this.idService.gen(),
			pollId: id,
			userId: userId,
			choice: choice,
		});

		const votes = await this.chatPollVotesRepository.findBy({ pollId: id });
		const votedUserIds = votes.map(v => v.userId);
		const allVoted = memberships.map(m => m.userId).every(uid => votedUserIds.includes(uid));
		if (allVoted) {
			this.chatService.finishPoll(id);
		}
	}
}

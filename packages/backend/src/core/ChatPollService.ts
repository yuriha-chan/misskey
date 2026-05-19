/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { ChatPollsRepository, ChatPollVotesRepository, ChatRoomMembershipsRepository, MiUser, MiChatRoomMembership, MiChatPoll, MiChatPollVote, MiChatRoom } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import { ChatService } from '@/core/ChatService.js';
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

		if (poll == null) throw new Error('poll not found');

		// Check whether is valid choice
		if (poll.choices[choice] == null) throw new Error('invalid choice param');

		if (poll.finishedId != null) throw new Error('poll already closed');

		const memberships: MiChatRoomMembership[] = await this.chatRoomMembershipsRepository.findBy({ roomId: poll.roomId, hasLeft: false });
		if (!memberships.some((m) => m.userId === userId)) {
			throw new Error('not a room member');
		}

		// if already voted
		const exist = await this.chatPollVotesRepository.findBy({
			pollId: id,
			userId: userId,
		});

		if (exist.length > 0) {
			throw new Error('cannot vote more');
		}
		if (exist.some(x => x.choice === choice)) {
			throw new Error('already voted');
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

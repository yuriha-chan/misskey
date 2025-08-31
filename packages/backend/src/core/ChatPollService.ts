/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { ChatPollsRepository, ChatPollVotesRepository, MiUser } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import { bindThis } from '@/decorators.js';

@Injectable()
export class ChatPollService {
	constructor(
		@Inject(DI.chatPollsRepository)
		private chatPollsRepository: chatPollsRepository,

		@Inject(DI.pollVotesRepository)
		private chatPollVotesRepository: chatPollVotesRepository,

		private idService: IdService,
	) {
	}

	@bindThis
	public async vote(userId: MiUser['id'], id: MiChatPoll['id'], choice: number) {
		const poll = await this.chatPollsRepository.findOneBy({ id });

		if (poll == null) throw new Error('poll not found');

		// Check whether is valid choice
		if (poll.choices[choice] == null) throw new Error('invalid choice param');

		// if already voted
		const exist = await this.chatPollVotesRepository.findBy({
			pollId: poll.id,
			userId: user.id,
		});

		if (exist.length >= poll.multiple) {
			throw new Error('cannot vote more');
		}
		if (exist.some(x => x.choice === choice)) {
			throw new Error('already voted');
		}

		await this.chatPollVotesRepository.insert({
			id: this.idService.gen(),
			pollId: poll.id,
			userId: user.id,
			choice: choice,
		});
	}
}

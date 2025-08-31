/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatPollService } from '@/core/ChatPollService.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';
import { ChatMessagesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['chat'],
	requireCredential: true,
	kind: 'write:chat',
	errors: {
		noSuchPoll: {
			message: 'No such poll.',
			code: 'NO_SUCH_POLL',
			id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
		},
		notMember: {
			message: 'You are not a member of the room.',
			code: 'NOT_MEMBER',
			id: 'fedcba09-8765-4321-0fed-cba987654321',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		pollId: { type: 'string', format: 'misskey:id' },
		choice: { type: 'integer' },
	},
	required: ['pollId', 'choice'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatPollService: ChatPollService,
		private chatService: ChatService,
		@Inject(DI.chatMessagesRepository) private chatMessagesRepository: ChatMessagesRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			const message = await this.chatMessagesRepository.findOneBy({
				id: ps.pollId,
			});

			if (message == null) {
				throw new ApiError(meta.errors.noSuchPoll);
			}

			const room = await this.chatService.findRoomById(message.roomId, false);
			if (room == null || !await this.chatService.isRoomMember(room, me.id)) {
				throw new ApiError(meta.errors.notMember);
			}

			await this.chatPollService.vote(me.id, ps.pollId, ps.choice);
		});
	}
}

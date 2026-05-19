/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ChatService } from '@/core/ChatService.js';
import type { ChatPollsRepository } from '@/models/_.js';

export const meta = {
	tags: ['chat'],
	requireCredential: true,
	kind: 'write:chat',
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {},
	},
	errors: {},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		pollId: { type: 'string', format: 'misskey:id' },
	},
	required: ['pollId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		@Inject(DI.chatPollsRepository)
		private chatPollsRepository: ChatPollsRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');
			this.chatService.finishPoll(ps.pollId, me);
		});
	}
}

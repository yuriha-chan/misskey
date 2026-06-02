/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '84416476-5ce8-4a2c-b568-9569f1b10733',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		bubbleColor: { type: 'string', nullable: true },
		bubbleStyle: { type: 'string', nullable: true }
	},
	required: ['roomId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async ({ roomId, bubbleColor, bubbleStyle }, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');
			try {
				await this.chatService.updateMembership(me.id, roomId, { ...bubbleColor == null ? {} : { bubbleColor }, ...bubbleStyle == null ? {} : { bubbleStyle } });
			} catch (err) {
				if (err instanceof IdentifiableError) {
					if (err.id === '54c7c4f7-47e6-4088-9b29-69373cbab313') {
						throw new ApiError(meta.errors.noSuchRoom);
					}
				}
				throw err;
			}
		});
	}
}

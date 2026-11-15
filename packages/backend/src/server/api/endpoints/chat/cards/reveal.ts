/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

export const meta = {
	tags: ['chat'],
	requireCredential: true,
	kind: 'write:chat',
	errors: {
		noSuchCard: {
			message: 'No such card.',
			code: 'NO_SUCH_CARD',
			id: 'e2cdba26-87c9-43bb-98d5-5c28b0329c9c',
		},
		notPermitted: {
			message: 'Not permitted to disclose card.',
			code: 'NOT_PERMITTED',
			id: 'b56c91ef-b1ee-48e7-bfb0-bee1025cb905',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		deliverId: { type: 'string', format: 'misskey:id' },
		cardId: { type: 'number' },
	},
	required: ['deliverId', 'cardId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');
			try {
				await this.chatService.revealCard(ps.deliverId, ps.cardId, me);
			} catch (err) {
				if (err instanceof IdentifiableError) {
					if (err.id === 'e2cdba26-87c9-43bb-98d5-5c28b0329c9c') {
						throw new ApiError(meta.errors.noSuchCard);
					} else if (err.id === 'b56c91ef-b1ee-48e7-bfb0-bee1025cb905') {
						throw new ApiError(meta.errors.notPermitted);
					}
				}
				throw err;
			}
		});
	}
}

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
		noSuchSecret: {
			message: 'No such secret.',
			code: 'NO_SUCH_SECRET',
			id: 'c2b21243-e687-4e71-9b87-b60031874fcc',
		},
		notPermitted: {
			message: 'Not permitted to disclose secret.',
			code: 'NOT_PERMITTED',
			id: 'f16f7e8b-044c-498b-8946-1bb52718663d',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
	},
	required: ['id'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			try {
				await this.chatService.revealSecret(ps.id, me);
			} catch (err) {
				if (err instanceof IdentifiableError) {
					if (err.id === 'c2b21243-e687-4e71-9b87-b60031874fcc') {
						throw new ApiError(meta.errors.noSuchSecret);
					} else if (err.id === 'f16f7e8b-044c-498b-8946-1bb52718663d') {
						throw new ApiError(meta.errors.notPermitted);
					}
				}
				throw err;
			}
		});
	}
}

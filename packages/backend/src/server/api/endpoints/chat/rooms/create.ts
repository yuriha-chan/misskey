/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:chat',

	limit: {
		duration: ms('12hours'),
		max: 30,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoom',
	},

	errors: {
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string', maxLength: 256 },
		description: { type: 'string', maxLength: 1024 },
		capacity: { type: 'integer', minimum: 2, maximum: 30, nullable: true },
		expiration: { type: 'integer', nullable: true, minimum: 0, maximum: 744 * 3600 * 1000 },
		isPublic: { type: 'boolean', nullable: true },
		theme: { type: 'string', nullable: true },
	},
	required: ['name'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');
			if (ps.isPublic) {
				ps.expiration = Math.min(ps.expiration ?? Infinity, 6 * 3600 * 1000);
			}

			const room = await this.chatService.createRoom(me, {
				name: ps.name,
				description: ps.description ?? '',
				capacity: ps.capacity ?? 30,
				expiration: ps.expiration,
				isPublic: ps.isPublic ?? false,
				theme: ps.theme,
			});
			return await this.chatEntityService.packRoom(room);
		});
	}
}

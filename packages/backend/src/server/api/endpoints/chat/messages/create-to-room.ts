/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { ChatService } from '@/core/ChatService.js';
import type { DriveFilesRepository, MiUser } from '@/models/_.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:chat',

	limit: {
		duration: ms('1hour'),
		max: 500,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatMessageLiteForRoom',
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '8098520d-2da5-4e8f-8ee1-df78b55a4ec6',
		},

		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: 'b6accbd3-1d7b-4d9f-bdb7-eb185bac06db',
		},

		contentRequired: {
			message: 'Content required. You need to set text or fileId.',
			code: 'CONTENT_REQUIRED',
			id: '340517b7-6d04-42c0-bac1-37ee804e3594',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		text: { type: 'string', nullable: true, maxLength: 2000 },
		fileId: { type: 'string', format: 'misskey:id' },
		toRoomId: { type: 'string', format: 'misskey:id' },
		commitSecret: {
			type: 'object',
			nullable: true,
			properties: {
				plaintext: { type: 'string', nullable: false, maxLength: 500 },
				revealsAt: { type: 'number', nullable: true },
				revealsAfter: { type: 'number', nullable: true },
			}
		},
		poll: {
			type: 'object',
			nullable: true,
			properties: {
				choices: {
					type: 'array',
					uniqueItems: true,
					minItems: 1,
					maxItems: 30,
					items: { type: 'string', minLength: 1, maxLength: 50 },
				},
				multiple: { type: 'boolean' },
				expiresAt: { type: 'integer', nullable: true },
				expiredAfter: { type: 'integer', nullable: true, minimum: 1 },
			},
			required: ['choices'],
		},
		deliverCards: {
			type: 'object',
			nullable: true,
			properties: {
				cards: {
					type: 'array',
					uniqueItems: true,
					minItems: 1,
					maxItems: 30,
					items: { type: 'string', minLength: 1, maxLength: 50 },
				},
				deliver: {
					type: 'array',
					uniqueItems: false,
					items: {
						type: 'object',
						nullable: false,
						properties: {
							user: { type: 'string', nullable: false, format: 'misskey:id' },
							number: { type: 'number', minimum: 0 },
						}
					}
				},
				revealsAt: { type: 'integer', nullable: true },
				revealsAfter: { type: 'integer', nullable: true, minimum: 1 },
			},
			required: ['cards'],
		},
		visibleUserIds: { type: 'array', uniqueItems: true, items: {
			type: 'string', format: 'misskey:id',
		} },
	},
	required: ['toRoomId'],
} as const;

function renderExpiresAt(obj) {
	let expiresAt;
	if (obj == null) {
		return null;
	}
	if (obj.expiresAfter) {
		expiresAt = new Date(Date.now() + obj.expiresAfter * 1000);
	} else if (obj.expiresAfter != null) {
		expiresAt = new Date(obj.expiresAt)
	} else {
		expiresAt = null;
	}
	return { ...obj, expiresAt }
}

function renderRevealsAt(obj) {
	let revealsAt;
	if (obj == null) {
		return null;
	}
	if (obj.revealsAfter) {
		revealsAt = new Date(Date.now() + obj.revealsAfter * 1000);
	} else if (obj.revealsAt != null) {
		revealsAt = new Date(obj.revealsAt);
	} else {
		revealsAt = null;
	}
	return { ...obj, revealsAt }
}

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private getterService: GetterService,
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			const room = await this.chatService.findRoomById(ps.toRoomId, false);
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}

			let file = null;
			if (ps.fileId != null) {
				file = await this.driveFilesRepository.findOneBy({
					id: ps.fileId,
					userId: me.id,
				});

				if (file == null) {
					throw new ApiError(meta.errors.noSuchFile);
				}
			}

			if (ps.text == null && file == null && ps.commitSecret == null && ps.deliverCards == null && ps.poll == null) {
				throw new ApiError(meta.errors.contentRequired);
			}

			return await this.chatService.createMessageToRoom(me, room, {
				text: ps.text,
				file: file,
				commitSecret: renderRevealsAt(ps.commitSecret),
				deliverCards: renderRevealsAt(ps.deliverCards),
				poll: renderExpiresAt(ps.poll),
			});
		});
	}
}

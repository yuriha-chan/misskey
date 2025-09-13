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
		optional: false, nullable: true,
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
				title: { type: 'string', nullable: false, maxLength: 256 },
				plaintext: { type: 'string', nullable: false, maxLength: 500 },
				revealsAt: { type: 'number', nullable: true },
				revealsIn: { type: 'number', nullable: true },
			}
		},
		poll: {
			type: 'object',
			nullable: true,
			properties: {
				title: { type: 'string', maxLength: 256 },
				choices: {
					type: 'array',
					uniqueItems: true,
					minItems: 1,
					maxItems: 30,
					items: { type: 'string', minLength: 1, maxLength: 200 },
				},
				voteForUser: { type: 'boolean' },
				anonymous: { type: 'boolean' },
				startsAt: { type: 'integer', nullable: true },
				startsIn: { type: 'integer', nullable: true, minimum: 1 },
				duration: { type: 'integer', nullable: true, minimum: 1 },
			},
			required: ['title', 'choices'],
		},
		deliverCards: {
			type: 'object',
			nullable: true,
			properties: {
				cards: {
					type: 'array',
					nullable: false,
					minItems: 1,
					maxItems: 60,
					items: {
						type: 'object',
						nullable: false,
						properties: {
							name: { type: 'string', nullable: false, minLength: 1, maxLength: 256 },
							count: { type: 'integer', nullable: false, minimum: 1, maximum: 30 },
						},
					},
				},
				deliver: {
					type: 'array',
					nullable: false,
					items: {
						type: 'object',
						nullable: false,
						properties: {
							userId: { type: 'string', nullable: false, format: 'misskey:id' },
							number: { type: 'number', minimum: 0 },
						},
					},
				},
			},
			required: ['cards', 'deliver'],
		},
		visibleUserIds: { type: 'array', uniqueItems: true, items: {
			type: 'string', format: 'misskey:id',
		} },
	},
	required: ['toRoomId'],
} as const;

function processPoll(poll: any) {
	if (poll == null) return null;
	const newPoll = { ...poll };
	if (poll.startsIn) {
		newPoll.startsAt = new Date(Date.now() + poll.startsIn * 1000);
	} else if (poll.startsAt) {
		newPoll.startsAt = new Date(poll.startsAt);
	}
	return newPoll;
}

function processRevealable(item: any) {
	if (item == null) return null;
	const newItem = { ...item };
	if (item.revealsIn) {
		newItem.revealsAt = new Date(Date.now() + item.revealsIn * 1000);
	} else if (item.revealsAt) {
		newItem.revealsAt = new Date(item.revealsAt);
	}
	return newItem;
}

function processDeliver(item: any) {
	if (item == null) return null;
	const newItem = {...item};
	newItem.deliver = Object.fromEntries(item.deliver.map((d: any) => [d.userId, d.count]));
	return newItem;
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

			if (ps.text == null && file == null && ps.commitSecret == null && ps.deliverCards == null && ps.poll == null && ps.deliverCards == null) {
				throw new ApiError(meta.errors.contentRequired);
			}

			return await this.chatService.createMessageToRoom(me, room, {
				text: ps.text,
				file: file,
				commitSecret: processRevealable(ps.commitSecret),
				deliverCards: processDeliver(ps.deliverCards),
				poll: processPoll(ps.poll),
			});
		});
	}
}

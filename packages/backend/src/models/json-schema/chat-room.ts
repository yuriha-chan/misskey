/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedChatRoomSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
		},
		createdAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: false,
		},
		ownerId: {
			type: 'string',
			optional: false, nullable: false,
		},
		owner: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserLite',
		},
		name: {
			type: 'string',
			optional: false, nullable: false,
		},
		description: {
			type: 'string',
			optional: false, nullable: false,
		},
		isMuted: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		invitationExists: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		isArchived: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		isPublic: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		isJoined: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		capacity: {
			type: 'number',
			optional: true, nullable: false,
		},
		expiration: {
			type: 'number',
			optional: true, nullable: true,
		},
		theme: {
			type: 'string',
			optional: true, nullable: true,
		},
		memberships: {
			type: 'array',
			optional: true, nullable: true,
			items: {
				type: 'object',
				ref: 'ChatRoomMembership',
				optional: false, nullable: false,
			},
		},
	},
} as const;

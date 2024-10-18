/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AvatarDecorationService } from '@/core/AvatarDecorationService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireRolePolicy: 'canManageAvatarDecorations',
	kind: 'write:admin:avatar-decorations',

	errors: {
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1 },
		description: { type: 'string' },
		url: { type: 'string' },
		bgUrl: { type: 'string' },
		animation: { type: 'string' },
		imgAnimation: { type: 'string' },
		bgAnimation: { type: 'string' },
		mixBlendMode: { type: 'string' },
		bgMixBlendMode: { type: 'string' },
		roleIdsThatCanBeUsedThisDecoration: { type: 'array', items: {
			type: 'string',
		} },
	},
	required: ['id'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private avatarDecorationService: AvatarDecorationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.avatarDecorationService.update(ps.id, {
				name: ps.name,
				description: ps.description,
				url: ps.url,
				bgUrl: ps.bgUrl,
				animation: ps.animation,
				imgAnimation: ps.imgAnimation,
				bgAnimation: ps.bgAnimation,
				mixBlendMode: ps.mixBlendMode,
				bgMixBlendMode: ps.bgMixBlendMode,
				roleIdsThatCanBeUsedThisDecoration: ps.roleIdsThatCanBeUsedThisDecoration,
			}, me);
		});
	}
}

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import bcrypt from 'bcryptjs';
import { Inject, Injectable } from '@nestjs/common';
import type { UserProfilesRepository, PasswordResetRequestsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';

export const meta = {
	tags: ['revoke reset password'],
	requireCredential: true,
	kind: 'write:account',
	description: 'Revoke the password reset that was previously requested.',
	errors: { },
} as const;

export const paramDef = {
	type: 'object',
	properties: { },
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.passwordResetRequestsRepository)
		private passwordResetRequestsRepository: PasswordResetRequestsRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.passwordResetRequestsRepository.delete({ userId: me.id });
		});
	}
}

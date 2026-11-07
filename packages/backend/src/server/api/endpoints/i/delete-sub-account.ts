/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import bcrypt from 'bcryptjs';
import { Inject, Injectable } from '@nestjs/common';
import type { UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DeleteAccountService } from '@/core/DeleteAccountService.js';
import { DI } from '@/di-symbols.js';
import { UserAuthService } from '@/core/UserAuthService.js';

export const meta = {
	requireCredential: true,

	secure: true,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		subAccountId: { type: 'string', format: 'misskey:id' },
		password: { type: 'string' },
		token: { type: 'string', nullable: true },
	},
	required: ['subAccountId', 'password'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private userAuthService: UserAuthService,
		private deleteAccountService: DeleteAccountService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// authenticate the main account 
			const token = ps.token;
			const profile = await this.userProfilesRepository.findOneByOrFail({ userId: me.id });

			if (profile.twoFactorEnabled) {
				if (token == null) {
					throw new Error('authentication failed');
				}

				try {
					await this.userAuthService.twoFactorAuthenticate(profile, token);
				} catch (e) {
					throw new Error('authentication failed');
				}
			}

			const passwordMatched = await bcrypt.compare(ps.password, profile.password!);
			if (!passwordMatched) {
				throw new Error('incorrect password');
			}

			const userDetailed = await this.usersRepository.findOneByOrFail({ id: ps.subAccountId });
			if (userDetailed.isDeleted) {
				return;
			}

			// authenticate the sub account ownership
			const subAccountProfile = await this.userProfilesRepository.findOneByOrFail({ userId: ps.subAccountId });

			const subAccountOwnership = subAccountProfile.mainAccountId === me.id;
			if (!subAccountOwnership) {
				throw new Error('incorrect subaccount');
			}

			// delete the sub account
			await this.deleteAccountService.deleteAccount({ id: ps.subAccountId, host: null });
		});
	}
}

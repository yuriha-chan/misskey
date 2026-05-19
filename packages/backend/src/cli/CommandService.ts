/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { MetaService } from '@/core/MetaService.js';
import { DeleteAccountService } from '@/core/DeleteAccountService.js';
import type { MiMeta, UsersRepository } from '@/models/_.js';

@Injectable()
export class CommandService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		private metaService: MetaService,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private deleteAccountService: DeleteAccountService,

	) {
	}

	@bindThis
	public async ping() {
		console.log('pong');
	}

	@bindThis
	public async resetCaptcha() {
		await this.metaService.update({
			enableHcaptcha: false,
			hcaptchaSiteKey: null,
			hcaptchaSecretKey: null,
			enableMcaptcha: false,
			mcaptchaSitekey: null,
			mcaptchaSecretKey: null,
			mcaptchaInstanceUrl: null,
			enableRecaptcha: false,
			recaptchaSiteKey: null,
			recaptchaSecretKey: null,
			enableTurnstile: false,
			turnstileSiteKey: null,
			turnstileSecretKey: null,
			enableTestcaptcha: false,
		});
	}

	@bindThis
	public async deleteAccount(id: string) {
		if (!this.meta.rootUserId) {
			console.log('root user not set');
			return;
		}
		const root = await this.usersRepository.findOneByOrFail({ id: this.meta.rootUserId });
		await this.deleteAccountService.deleteAccount({ id, host: null }, root);
	}
}

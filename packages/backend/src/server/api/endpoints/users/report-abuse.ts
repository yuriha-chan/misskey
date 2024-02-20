/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import sanitizeHtml from 'sanitize-html';
import { Inject, Injectable } from '@nestjs/common';
import type { AbuseUserReportsRepository } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { MetaService } from '@/core/MetaService.js';
import { EmailService } from '@/core/EmailService.js';
import { DI } from '@/di-symbols.js';
import { GetterService } from '@/server/api/GetterService.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['users'],

	requireCredential: true,
	kind: 'write:report-abuse',

	description: 'File a report.',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '1acefcb5-0959-43fd-9685-b48305736cb5',
		},

	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		comment: { type: 'string', minLength: 1, maxLength: 2048 },
	},
	required: ['userId', 'comment'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.abuseUserReportsRepository)
		private abuseUserReportsRepository: AbuseUserReportsRepository,

		private idService: IdService,
		private metaService: MetaService,
		private emailService: EmailService,
		private getterService: GetterService,
		private roleService: RoleService,
		private globalEventService: GlobalEventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Lookup user
			const user = await this.getterService.getUser(ps.userId).catch(err => {
				if (err.id === '15348ddd-432d-49c2-8a5a-8069753becff') throw new ApiError(meta.errors.noSuchUser);
				throw err;
			});

			const report = await this.abuseUserReportsRepository.insert({
				id: this.idService.gen(),
				targetUserId: user.id,
				targetUserHost: user.host,
				reporterId: me.id,
				reporterHost: null,
				comment: ps.comment,
				reason: ps.reason,
			}).then(x => this.abuseUserReportsRepository.findOneByOrFail(x.identifiers[0]));

			// Publish event to moderators
			setImmediate(async () => {
				const moderators = await this.roleService.getModerators();

				for (const moderator of moderators) {
					this.globalEventService.publishAdminStream(moderator.id, 'newAbuseUserReport', {
						id: report.id,
						targetUserId: report.targetUserId,
						reporterId: report.reporterId,
						comment: report.comment,
						reason: report.reason,
					});
				}

				const meta = await this.metaService.fetch();
				if (meta.email) {
					this.emailService.sendEmail(meta.email, 'New abuse report',
						sanitizeHtml(ps.comment),
						sanitizeHtml(ps.comment));
				}
			});
		});
	}
}

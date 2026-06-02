/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { DriveFilesRepository } from '@/models/_.js';
import { QueryService } from '@/core/QueryService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	kind: 'read:drive',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'DriveFile',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		folderId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		type: { type: 'string', nullable: true, pattern: /^[a-zA-Z\/\-*]+$/.toString().slice(1, -1) },
		types: { type: 'array', nullable: true, items: {type: 'string', pattern: /^[a-zA-Z\/\-*]+$/.toString().slice(1, -1) }},
		excludeTypes: { type: 'array', nullable: true, items: {type: 'string', pattern: /^[a-zA-Z\/\-*]+$/.toString().slice(1, -1) }},
		sort: { type: 'string', nullable: true, enum: ['+createdAt', '-createdAt', '+name', '-name', '+size', '-size', null] },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private driveFileEntityService: DriveFileEntityService,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.queryService.makePaginationQuery(this.driveFilesRepository.createQueryBuilder('file'), ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
				.andWhere('file.userId = :userId', { userId: me.id });

			if (ps.folderId) {
				query.andWhere('file.folderId = :folderId', { folderId: ps.folderId });
			} else {
				query.andWhere('file.folderId IS NULL');
			}

			const types = ps.types ?? (ps.type != null ? [ps.type] : null);

			if (types) {
				query.andWhere(new Brackets(qb => {
					types.forEach((type, i) => {
						// avoid duplicated slot names
						const slot = `type_${i}`;
						if (type.endsWith('/*')) {
							qb.orWhere(`file.type LIKE :${slot}`, { [slot]: type.replace('/*', '/') + '%' });
						} else {
							qb.orWhere(`file.type = :${slot}`, { [slot]: type });
						}
					});
				}));
			}

			if (ps.excludeTypes) {
				const excludeTypes = ps.excludeTypes;
				query.andWhere(new Brackets(qb => {
					excludeTypes.forEach((type, i) => {
						const slot = `excludeType_${i}`;
						if (type.endsWith('/*')) {
							qb.andWhere(`file.type NOT LIKE :${slot}`, { [slot]: type.replace('/*', '/') + '%' });
						} else {
							qb.andWhere(`file.type != :${slot}`, { [slot]: type });
						}
					});
				}));
			}

			switch (ps.sort) {
				case '+createdAt': query.orderBy('file.id', 'DESC'); break;
				case '-createdAt': query.orderBy('file.id', 'ASC'); break;
				case '+name': query.orderBy('file.name', 'DESC'); break;
				case '-name': query.orderBy('file.name', 'ASC'); break;
				case '+size': query.orderBy('file.size', 'DESC'); break;
				case '-size': query.orderBy('file.size', 'ASC'); break;
			}

			const files = await query.limit(ps.limit).getMany();

			return await this.driveFileEntityService.packMany(files, { detail: false, self: true });
		});
	}
}

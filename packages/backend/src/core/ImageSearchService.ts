/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { bindThis } from '@/decorators.js';
import { MiNote } from '@/models/Note.js';
import { MiUser } from '@/models/_.js';
import type { DriveFilesRepository } from '@/models/_.js';
import type { NotesRepository } from '@/models/_.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { QueryService } from '@/core/QueryService.js';
import { query } from '@/misc/prelude/url.js';

@Injectable()
export class ImageSearchService {
	private readonly meilisearchIndexScope: 'local' | 'global' | string[] = 'local';
	private meilisearchNoteIndex: Index | null = null;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private queryService: QueryService,

		private httpRequestService: HttpRequestService,
	) {}

	@bindThis
	async search(args): Promise<SummalyResult> {
		const provider = `${this.config.imageSearch.host}:${this.config.imageSearch.port}`;
		const queryStr = query(args);
		return await this.httpRequestService.getJson(`http://${provider}/search?${queryStr}`);
	}

	@bindThis
	async update(args) {
		const provider = `${this.config.imageSearch.host}:${this.config.imageSearch.port}`;
		return await this.httpRequestService.postJson(`http://${provider}/update`, args);
	}

	@bindThis
	async delete(args) {
		const provider = `${this.config.imageSearch.host}:${this.config.imageSearch.port}`;
		return await this.httpRequestService.postJson(`http://${provider}/delete`, args);
	}

	@bindThis
	public async indexNote(note: MiNote): Promise<void> {
		if (!['public'].includes(note.visibility)) return;
		if (note.userHost && this.config.imageSearch.indexHosts && !this.config.imageSearch.indexHosts.includes(note.userHost)) {
			return;
		}
		for (const fileId of note.fileIds) {
			const file = await this.driveFilesRepository.findOneBy({ id: fileId });
			if (file === null) { continue; };
			if (file.isSensitive) { continue; };
			const url = file.url;
			await this.update({ fileId, url, searchable: true, exists: "set" });
		}
	}

	@bindThis
	public async unindexImage(fileId: string): Promise<void> {
		return await this.delete({ fileId });
	}

	@bindThis
	public async searchImage(fileId: string, me: MiUser | null, opts: {
		host?: string | null;
		weights?: string;
	}, pagination: {
		offset?: number;
		limit?: number;
	}): Promise<MiNote[]> {
		const res = []
		const file = await this.driveFilesRepository.findOneByOrFail({ id: fileId });
		const url = file.url;
		await this.update({ fileId, url, searchable: false, exists: "skip" })
		const results = await this.search({ fileId, limit: pagination.limit, offset: pagination.offset, weights: opts.weights })
		const query = this.notesRepository.createQueryBuilder('note');
		for (const result of results) {
			query.andWhere(':id <@ note.fileIds', { id: [result.fileId] })
			if (opts.host) {
				if (opts.host === '.') {
					query.andWhere('note.userHost IS NULL');
				} else {
					query.andWhere('note.userHost = :host', { host: opts.host });
				}
			}
			this.queryService.generateVisibilityQuery(query, me);
			if (me) this.queryService.generateMutedUserQuery(query, me);
			if (me) this.queryService.generateBlockedUserQuery(query, me);
			query.orderBy('note.id', 'ASC');
			const r = await query.limit(1).getOne();
			if (r !== null) {
				res.push(r);
			}
		}
		return res
	}
}

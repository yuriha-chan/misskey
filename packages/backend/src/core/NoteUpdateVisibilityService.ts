/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets, In } from 'typeorm';
import { Injectable, Inject } from '@nestjs/common';
import type { MiUser, MiLocalUser, MiRemoteUser } from '@/models/User.js';
import type { MiNote, IMentionedRemoteUsers } from '@/models/Note.js';
import type { NotesRepository, UsersRepository } from '@/models/_.js';
import { RelayService } from '@/core/RelayService.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { bindThis } from '@/decorators.js';
import { SearchService } from '@/core/SearchService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';

@Injectable()
export class NoteUpdateVisibilityService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private userEntityService: UserEntityService,
		private noteEntityService: NoteEntityService,
		private globalEventService: GlobalEventService,
		private relayService: RelayService,
		private apRendererService: ApRendererService,
		private apDeliverManagerService: ApDeliverManagerService,
		private searchService: SearchService,
		private moderationLogService: ModerationLogService,
	) {}

	/**
	 * 投稿の公開範囲を変更します。
	 * @param user 投稿者
	 * @param note 投稿
	 */
	async updateVisibility(user: { id: MiUser['id']; uri: MiUser['uri']; host: MiUser['host']; isBot: MiUser['isBot']; }, note: MiNote, visibility?: string, localOnly?: boolean, reactionAcceptance?: MiNote['reactionAcceptance'], quiet = false, updater?: MiUser) {
		if (note.visibility === 'home' && visibility === 'public') {
			throw new Error('cannot change home visibility to public');
		} else if (note.visibility === 'followers' && (visibility === 'home' || visibility === 'public')) {
			throw new Error('cannot change followers visibility to home or public');
		} else if (note.visibility === 'specified' && visibility) {
			throw new Error('cannot change specified visibility');
		}

		const updatedAt = new Date();

		if (!quiet) {
			this.globalEventService.publishNoteStream(note.id, 'visibilityUpdated', {
				updatedAt: updatedAt,
			});

			//#region ローカルのみに変更された投稿なら削除アクティビティを配送
			if (this.userEntityService.isLocalUser(user) && !note.localOnly && localOnly) {
				let renote: MiNote | null = null;

				// if updated note is renote
				if (isRenote(note) && !isQuote(note)) {
					renote = await this.notesRepository.findOneBy({
						id: note.renoteId,
					});
				}

				const content = this.apRendererService.addContext(renote
					? this.apRendererService.renderUndo(this.apRendererService.renderAnnounce(renote.uri ?? `${this.config.url}/notes/${renote.id}`, note), user)
					: this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${note.id}`), user));

				this.deliverToConcerned(user, note, content);
			}
			//#endregion
		}

		if (note.visibility !== 'followers' && visibility === 'followers') {
			this.searchService.unindexNote(note);
		}

		const to = {
			visibility: visibility ?? undefined,
			localOnly: localOnly ?? undefined,
			reactionAcceptance: reactionAcceptance ?? undefined,
		};

		await this.notesRepository.update(note.id, to);

		if (updater && (note.userId !== updater.id)) {
			const user = await this.usersRepository.findOneByOrFail({ id: note.userId });
			this.moderationLogService.log(updater, 'updateVisibility', {
				noteId: note.id,
				noteUserId: note.userId,
				noteUserUsername: user.username,
				noteUserHost: user.host,
				note: note,
				to
			});
		}
	}

	@bindThis
	private async getMentionedRemoteUsers(note: MiNote) {
		const where = [] as any[];

		// mention / reply / dm
		const uris = (JSON.parse(note.mentionedRemoteUsers) as IMentionedRemoteUsers).map(x => x.uri);
		if (uris.length > 0) {
			where.push(
				{ uri: In(uris) },
			);
		}

		// renote / quote
		if (note.renoteUserId) {
			where.push({
				id: note.renoteUserId,
			});
		}

		if (where.length === 0) return [];

		return await this.usersRepository.find({
			where,
		}) as MiRemoteUser[];
	}

	@bindThis
	private async deliverToConcerned(user: { id: MiLocalUser['id']; host: null; }, note: MiNote, content: any) {
		this.apDeliverManagerService.deliverToFollowers(user, content);
		this.relayService.deliverToRelays(user, content);
		const remoteUsers = await this.getMentionedRemoteUsers(note);
		for (const remoteUser of remoteUsers) {
			this.apDeliverManagerService.deliverToUser(user, content, remoteUser);
		}
	}
}

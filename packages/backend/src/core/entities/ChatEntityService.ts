/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiUser, ChatMessagesRepository, MiChatMessage, ChatRoomsRepository, MiChatRoom, MiChatPoll, MiChatPollVote, ChatSecretsRepository, MiChatSecret, MiChatCard, MiChatRoomInvitation, ChatRoomInvitationsRepository, MiChatRoomMembership, ChatRoomMembershipsRepository } from '@/models/_.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { Packed } from '@/misc/json-schema.js';
import type { } from '@/models/Blocking.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { UserEntityService } from './UserEntityService.js';
import { DriveFileEntityService } from './DriveFileEntityService.js';
import { In } from 'typeorm';

export type MiChatPollWithVotes = MiChatPoll & {
  votes: MiChatPollVote[];
};

@Injectable()
export class ChatEntityService {
	constructor(
		@Inject(DI.chatMessagesRepository)
		private chatMessagesRepository: ChatMessagesRepository,

		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		@Inject(DI.chatRoomInvitationsRepository)
		private chatRoomInvitationsRepository: ChatRoomInvitationsRepository,

		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,

		@Inject(DI.chatSecretsRepository)
		private chatSecretsRepository: ChatSecretsRepository,

		private userEntityService: UserEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async packMessageDetailed(
		src: MiChatMessage['id'] | MiChatMessage,
		me?: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedFiles?: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
				packedUsers?: Map<MiChatMessage['id'], Packed<'UserLite'>>;
				packedRooms?: Map<MiChatMessage['toRoomId'], Packed<'ChatRoom'> | null>;
			};
		},
	): Promise<Packed<'ChatMessage'>> {
		const packedUsers = options?._hint_?.packedUsers;
		const packedFiles = options?._hint_?.packedFiles;
		const packedRooms = options?._hint_?.packedRooms;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });

		// userは削除されている可能性があるのでnull許容
		const reactions: { user: Packed<'UserLite'> | null; reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [userId, reaction] = record.split('/');
			reactions.push({
				user: packedUsers?.get(userId) ?? await this.userEntityService.pack(userId).catch(() => null),
				reaction,
			});
		}

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			text: message.text,
			fromUserId: message.fromUserId,
			fromUser: packedUsers?.get(message.fromUserId) ?? await this.userEntityService.pack(message.fromUser ?? message.fromUserId, me),
			toUserId: message.toUserId,
			toUser: message.toUserId ? (packedUsers?.get(message.toUserId) ?? await this.userEntityService.pack(message.toUser ?? message.toUserId, me)) : undefined,
			toRoomId: message.toRoomId,
			toRoom: message.toRoomId ? (packedRooms?.get(message.toRoomId) ?? await this.packRoom(message.toRoom ?? message.toRoomId, me)) : undefined,
			fileId: message.fileId,
			file: message.fileId ? (packedFiles?.get(message.fileId) ?? await this.driveFileEntityService.pack(message.file ?? message.fileId)) : null,
			reactions: reactions.filter((r): r is { user: Packed<'UserLite'>; reaction: string; } => r.user != null),
			visibleUserIds: message.visibleUserIds ?? undefined,
		};
	}

	@bindThis
	public async packMessagesDetailed(
		messages: MiChatMessage[],
		me: { id: MiUser['id'] },
	) {
		if (messages.length === 0) return [];

		const excludeMe = (x: MiUser | string) => {
			if (typeof x === 'string') {
				return x !== me.id;
			} else {
				return x.id !== me.id;
			}
		};

		const users = [
			...messages.map((m) => m.fromUser ?? m.fromUserId).filter(excludeMe),
			...messages.map((m) => m.toUser ?? m.toUserId).filter(x => x != null).filter(excludeMe),
		];

		const reactedUserIds = messages.flatMap(x => x.reactions.map(r => r.split('/')[0]));

		for (const reactedUserId of reactedUserIds) {
			if (!users.some(x => typeof x === 'string' ? x === reactedUserId : x.id === reactedUserId)) {
				users.push(reactedUserId);
			}
		}

		// TODO: packedUsersに削除されたユーザーもnullとして含める
		const [packedUsers, packedFiles, packedRooms] = await Promise.all([
			this.userEntityService.packMany(users, me)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.driveFileEntityService.packMany(messages.map(m => m.file).filter(x => x != null))
				.then(files => new Map(files.map(f => [f.id, f]))),
			this.packRooms(messages.map(m => m.toRoom ?? m.toRoomId).filter(x => x != null), me)
				.then(rooms => new Map(rooms.map(r => [r.id, r]))),
		]);

		return Promise.all(messages.map(message => this.packMessageDetailed(message, me, { _hint_: { packedUsers, packedFiles, packedRooms } })));
	}

	@bindThis
	public async packMessageLiteFor1on1(
		src: MiChatMessage['id'] | MiChatMessage,
		options?: {
			_hint_?: {
				packedFiles: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
			};
		},
	): Promise<Packed<'ChatMessageLiteFor1on1'>> {
		const packedFiles = options?._hint_?.packedFiles;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });

		const reactions: { reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [, reaction] = record.split('/');
			reactions.push({
				reaction,
			});
		}

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			text: message.text,
			fromUserId: message.fromUserId,
			toUserId: message.toUserId!,
			fileId: message.fileId,
			file: message.fileId ? (packedFiles?.get(message.fileId) ?? await this.driveFileEntityService.pack(message.file ?? message.fileId)) : null,
			reactions,
		};
	}

	@bindThis
	public async packMessagesLiteFor1on1(
		messages: MiChatMessage[],
	) {
		if (messages.length === 0) return [];

		const [packedFiles] = await Promise.all([
			this.driveFileEntityService.packMany(messages.map(m => m.file).filter(x => x != null))
				.then(files => new Map(files.map(f => [f.id, f]))),
		]);

		return Promise.all(messages.map(message => this.packMessageLiteFor1on1(message, { _hint_: { packedFiles } })));
	}

	@bindThis
	public async packMessageLiteForRoom(
		src: MiChatMessage['id'] | MiChatMessage,
		options?: {
			_hint_?: {
				packedFiles: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
				packedUsers: Map<MiUser['id'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatMessageLiteForRoom'>> {
		const packedFiles = options?._hint_?.packedFiles;
		const packedUsers = options?._hint_?.packedUsers;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });

		// userは削除されている可能性があるのでnull許容
		const reactions: { user: Packed<'UserLite'> | null; reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [userId, reaction] = record.split('/');
			reactions.push({
				user: packedUsers?.get(userId) ?? await this.userEntityService.pack(userId).catch(() => null),
				reaction,
			});
		}

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			text: message.text,
			fromUserId: message.fromUserId,
			toRoomId: message.toRoomId!,
			fileId: message.fileId,
			file: message.fileId ? (packedFiles?.get(message.fileId) ?? await this.driveFileEntityService.pack(message.file ?? message.fileId)) : null,
			visibleUserIds: message.visibleUserIds ?? undefined,
			reactions: reactions.filter((r): r is { user: Packed<'UserLite'>; reaction: string; } => r.user != null),
		};
	}

	@bindThis
	public async packMessagesLiteForRoom(
		messages: MiChatMessage[],
	) {
		if (messages.length === 0) return [];

		const users = messages.map(x => x.fromUser ?? x.fromUserId);
		const reactedUserIds = messages.flatMap(x => x.reactions.map(r => r.split('/')[0]));

		for (const reactedUserId of reactedUserIds) {
			if (!users.some(x => typeof x === 'string' ? x === reactedUserId : x.id === reactedUserId)) {
				users.push(reactedUserId);
			}
		}

		const [packedUsers, packedFiles] = await Promise.all([
			this.userEntityService.packMany(users)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.driveFileEntityService.packMany(messages.map(m => m.file).filter(x => x != null))
				.then(files => new Map(files.map(f => [f.id, f]))),
		]);

		return Promise.all(messages.map(message => this.packMessageLiteForRoom(message, { _hint_: { packedFiles, packedUsers } })));
	}

	@bindThis
	public async packRoom(
		src: MiChatRoom['id'] | MiChatRoom,
		me?: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedOwners: Map<MiChatRoom['id'], Packed<'UserLite'>>;
				myMemberships?: Map<MiChatRoom['id'], MiChatRoomMembership | null | undefined>;
				myInvitations?: Map<MiChatRoom['id'], MiChatRoomInvitation | null | undefined>;
			};
		},
	): Promise<Packed<'ChatRoom'>> {
		const room = typeof src === 'object' ? src : await this.chatRoomsRepository.findOneByOrFail({ id: src });

		const membership = me && (options?._hint_?.myMemberships?.get(room.id) ?? await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId: me.id, hasLeft: false }));
		const invitation = me && (me.id !== room.ownerId ? (options?._hint_?.myInvitations?.get(room.id) ?? await this.chatRoomInvitationsRepository.findOneBy({ roomId: room.id, userId: me.id })) : null);

		return {
			id: room.id,
			createdAt: this.idService.parse(room.id).date.toISOString(),
			name: room.name,
			description: room.description,
			ownerId: room.ownerId,
			owner: options?._hint_?.packedOwners.get(room.ownerId) ?? await this.userEntityService.pack(room.owner ?? room.ownerId, me),
			isMuted: membership != null ? membership.isMuted : false,
			invitationExists: invitation != null,
			isArchived: room.isArchived,
			isPublic: room.isPublic,
			isJoined: membership != null,
			capacity: room.capacity,
			expiration: room.expiration,
			theme: room.theme,
			memberships: room.memberships != null ? await this.packRoomMemberships(room.memberships, me) : null,
		};
	}

	@bindThis
	public async packRooms(
		rooms: (MiChatRoom | MiChatRoom['id'])[],
		me?: { id: MiUser['id'] },
	) {
		if (rooms.length === 0) return [];

		const _rooms = rooms.filter((room): room is MiChatRoom => typeof room !== 'string');
		if (_rooms.length !== rooms.length) {
			_rooms.push(
				...await this.chatRoomsRepository.find({
					where: {
						id: In(rooms.filter((room): room is string => typeof room === 'string')),
					},
					relations: ['owner'],
				}),
			);
		}

		const owners = _rooms.map(x => x.owner ?? x.ownerId);

		const [packedOwners, myMemberships, myInvitations] = await Promise.all([
			this.userEntityService.packMany(owners, me)
				.then(users => new Map(users.map(u => [u.id, u]))),
			me ? this.chatRoomMembershipsRepository.find({
				where: {
					roomId: In(_rooms.map(x => x.id)),
					userId: me.id,
				},
			}).then(memberships => new Map(_rooms.map(r => [r.id, memberships.find(m => m.roomId === r.id)]))) : undefined,
			me ? this.chatRoomInvitationsRepository.find({
				where: {
					roomId: In(_rooms.map(x => x.id)),
					userId: me.id,
				},
			}).then(invitations => new Map(_rooms.map(r => [r.id, invitations.find(i => i.roomId === r.id)]))) : undefined,
		]);

		return Promise.all(_rooms.map(room => this.packRoom(room, me, { _hint_: { packedOwners, myMemberships, myInvitations } })));
	}

	@bindThis
	public async packRoomInvitation(
		src: MiChatRoomInvitation['id'] | MiChatRoomInvitation,
		me: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedRooms: Map<MiChatRoomInvitation['roomId'], Packed<'ChatRoom'>>;
				packedUsers: Map<MiChatRoomInvitation['id'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatRoomInvitation'>> {
		const invitation = typeof src === 'object' ? src : await this.chatRoomInvitationsRepository.findOneByOrFail({ id: src });

		return {
			id: invitation.id,
			createdAt: this.idService.parse(invitation.id).date.toISOString(),
			roomId: invitation.roomId,
			room: options?._hint_?.packedRooms.get(invitation.roomId) ?? await this.packRoom(invitation.room ?? invitation.roomId, me),
			userId: invitation.userId,
			user: options?._hint_?.packedUsers.get(invitation.userId) ?? await this.userEntityService.pack(invitation.user ?? invitation.userId, me),
		};
	}

	@bindThis
	public async packRoomInvitations(
		invitations: MiChatRoomInvitation[],
		me: { id: MiUser['id'] },
	) {
		if (invitations.length === 0) return [];

		return Promise.all(invitations.map(invitation => this.packRoomInvitation(invitation, me)));
	}

	@bindThis
	public async packRoomMembership(
		src: MiChatRoomMembership['id'] | MiChatRoomMembership,
		me?: { id: MiUser['id'] },
		options?: {
			populateUser?: boolean;
			populateRoom?: boolean;
			_hint_?: {
				packedRooms: Map<MiChatRoomMembership['roomId'], Packed<'ChatRoom'>>;
				packedUsers: Map<MiChatRoomMembership['id'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatRoomMembership'>> {
		const membership = typeof src === 'object' ? src : await this.chatRoomMembershipsRepository.findOneByOrFail({ id: src });

		return {
			id: membership.id,
			createdAt: this.idService.parse(membership.id).date.toISOString(),
			userId: membership.userId,
			user: options?.populateUser ? (options._hint_?.packedUsers.get(membership.userId) ?? await this.userEntityService.pack(membership.user ?? membership.userId, me)) : undefined,
			roomId: membership.roomId,
			room: options?.populateRoom ? (options._hint_?.packedRooms.get(membership.roomId) ?? await this.packRoom(membership.room ?? membership.roomId, me)) : undefined,
			bubbleColor: membership.bubbleColor,
			bubbleStyle: membership.bubbleStyle,
			hasLeft: membership.hasLeft,
		};
	}

	@bindThis
	public async packRoomMemberships(
		memberships: MiChatRoomMembership[],
		me?: { id: MiUser['id'] },
		options: {
			populateUser?: boolean;
			populateRoom?: boolean;
		} = {},
	) {
		if (memberships.length === 0) return [];

		const users = memberships.map(x => x.user ?? x.userId);
		const rooms = memberships.map(x => x.room ?? x.roomId);

		const [packedUsers, packedRooms] = await Promise.all([
			this.userEntityService.packMany(users, me)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.packRooms(rooms, me)
				.then(rooms => new Map(rooms.map(r => [r.id, r]))),
		]);

		return Promise.all(memberships.map(membership => this.packRoomMembership(membership, me, { ...options, _hint_: { packedUsers, packedRooms } })));
	}

	@bindThis
	public async packPollScheduled(
		poll: MiChatPoll,
	): Promise<Packed<'ChatPollScheduled'>> {
		return {
			id: poll.id,
			title: poll.title,
			fromUserId: poll.ownerId,
			roomId: poll.roomId,
			createdAt: this.idService.parse(poll.id).date.toISOString(),
			startsAt: poll.startsAt?.toISOString(),
		};
	}
	@bindThis
	public packPollsScheduled(polls: MiChatPoll[]) {
		return Promise.all(polls.map(p => this.packPollScheduled(p)));
	}

	@bindThis
	public async packPollStarted(
		poll: MiChatPoll,
		me?: { id: MiUser['id'] },
	): Promise<Packed<'ChatPollStarted'>> {
		const choices = poll.voteForUsers ? await this.userEntityService.packManyNullable(poll.choices, me, { nullable: true }) : poll.choices;
	
		return {
			id: poll.id,
			title: poll.title,
			voteForUsers: poll.voteForUsers,
			userChoices: poll.voteForUsers ? choices as Packed<'UserLite'>[] : null,
			textChoices: poll.voteForUsers ? null : choices as string[],
			fromUserId: poll.ownerId,
			roomId: poll.roomId,
			createdAt: this.idService.parse(poll.startedId as MiChatMessage['id']).date.toISOString(),
			finishesAt: poll.duration != null ? new Date(this.idService.parse(poll.startedId!).date.getTime() + poll.duration * 1000).toISOString() : null,
		};
	}
	@bindThis
	public packPollsStarted(polls: MiChatPoll[]) {
		return Promise.all(polls.map(p => this.packPollStarted(p)));
	}
	
	@bindThis
	public async packPollFinished(
		poll: MiChatPollWithVotes,
		me?: { id: MiUser['id'] },
	): Promise<Packed<'ChatPollFinished'>> {
		const votes: MiChatPollVote[][] = poll.choices.map((_) => []);
		for (const vote of poll.votes) {
			votes[vote.choice].push(vote);
		}
	
		const packedVotes: ({
			user?: Packed<'UserLite'> | null;
			text?: string | null;
			voteCount: number;
			votedUserIds?: MiUser['id'][] | null;
		})[] = [];
	
		const choices = poll.voteForUsers ? await this.userEntityService.packManyNullable(poll.choices, me, { nullable: true }) : poll.choices;
	
		choices.forEach((choice, i) => {
			const choiceVotes = votes[i];
			packedVotes.push({
				user: poll.voteForUsers ? choice as Packed<'UserLite'> : null,
				text: poll.voteForUsers ? null : choice as string,
				voteCount: choiceVotes.length,
				votedUserIds: !poll.anonymous ? choiceVotes.map(x => x.userId) : null,
			});
		});
	
		return {
			id: poll.id,
			title: poll.title,
			voteForUsers: poll.voteForUsers,
			anonymous: poll.anonymous,
			votes: packedVotes,
			fromUserId: poll.ownerId,
			roomId: poll.roomId,
			createdAt: this.idService.parse(poll.finishedId as MiChatMessage['id']).date.toISOString(),
		};
	}
	@bindThis
	public packPollsFinished(polls: MiChatPollWithVotes[]) {
		return Promise.all(polls.map(p => this.packPollFinished(p)));
	}
	
	@bindThis
	public async packSecret(
		src: MiChatSecret['id'] | MiChatSecret,
	): Promise<Packed<'ChatSecret'>> {
		const secret = typeof src === 'object' ? src : await this.chatSecretsRepository.findOneByOrFail({ id: src });
	
		return {
			id: secret.id,
			title: secret.title,
			fromUserId: secret.userId,
			roomId: secret.roomId,
			createdAt: this.idService.parse(secret.id).date.toISOString(),
			revealsAt: secret.revealsAt?.toISOString(),
		};
	}

	@bindThis
	public packSecrets(secrets: MiChatSecret[]) {
		return Promise.all(secrets.map(s => this.packSecret(s)));
	}
	
	@bindThis
	public async packSecretRevealed(
		src: MiChatSecret['id'] | MiChatSecret,
	): Promise<Packed<'ChatSecretRevealed'>> {
		const secret = typeof src === 'object' ? src : await this.chatSecretsRepository.findOneByOrFail({ id: src });
	
		return {
			id: secret.id,
			title: secret.title,
			fromUserId: secret.userId,
			roomId: secret.roomId,
			plaintext: secret.plaintext,
			createdAt: this.idService.parse(secret.id).date.toISOString(),
		};
	}

	@bindThis
	public packSecretsRevealed(secrets: MiChatSecret[]) {
		return Promise.all(secrets.map(s => this.packSecretRevealed(s)));
	}
	
	@bindThis
	public async packCard(
		src: MiChatCard,
	): Promise<Packed<'ChatCard'>> {
		return {
			deliverId: src.deliverId,
			cardId: src.cardId,
			cardKind: src.cardKind,
			roomId: src.roomId,
			createdAt: this.idService.parse(src.deliverId).date.toISOString(),
		};
	}

	@bindThis
	public packCards(cards: MiChatCard[]) {
		return Promise.all(cards.map(c => this.packCard(c)));
	}
	
	@bindThis
	public async packCardRevealed(
		src: MiChatCard,
	): Promise<Packed<'ChatCardRevealed'>> {
		return {
			deliverId: src.deliverId,
			cardId: src.cardId,
			cardKind: src.cardKind,
			roomId: src.roomId,
			createdAt: this.idService.parse(src.revealedId!).date.toISOString(),
			fromUserId: src.userId,
		};
	}

	@bindThis
	public packCardsRevealed(cards: MiChatCard[]) {
		return Promise.all(cards.map(c => this.packCardRevealed(c)));
	}
}

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DataSource, Brackets, IsNull, Not } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { QueueService } from '@/core/QueueService.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ChatPollService } from '@/core/ChatPollService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ChatEntityService, type MiChatPollWithVotes } from '@/core/entities/ChatEntityService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { PushNotificationService } from '@/core/PushNotificationService.js';
import { bindThis } from '@/decorators.js';
import type { ChatApprovalsRepository, ChatMessagesRepository, ChatRoomInvitationsRepository, ChatRoomMembershipsRepository, ChatRoomsRepository, ChatSecretsRepository, ChatPollsRepository, ChatCardsRepository, MiChatMessage, MiChatRoom, MiChatPoll, MiChatPollVote, MiChatSecret, MiChatCard, MiChatRoomMembership, MiDriveFile, MiUser, MutingsRepository, UsersRepository } from '@/models/_.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';
import { QueryService } from '@/core/QueryService.js';
import { RoleService } from '@/core/RoleService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { MiChatRoomInvitation } from '@/models/ChatRoomInvitation.js';
import { Packed } from '@/misc/json-schema.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { emojiRegex } from '@/misc/emoji-regex.js';
import { NotificationService } from '@/core/NotificationService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { shuffle } from '@/misc/shuffle.js';

const MAX_REACTIONS_PER_MESSAGE = 100;
const isCustomEmojiRegexp = /^:([\w+-]+)(?:@\.)?:$/;

// TODO: ReactionServiceのやつと共通化
function normalizeEmojiString(x: string) {
	const match = emojiRegex.exec(x);
	if (match) {
		// 合字を含む1つの絵文字
		const unicode = match[0];

		// 異体字セレクタ除去
		return unicode.match('\u200d') ? unicode : unicode.replace(/\ufe0f/g, '');
	} else {
		throw new Error('invalid emoji');
	}
}

@Injectable()
export class ChatService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.chatMessagesRepository)
		private chatMessagesRepository: ChatMessagesRepository,

		@Inject(DI.chatApprovalsRepository)
		private chatApprovalsRepository: ChatApprovalsRepository,

		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		@Inject(DI.chatSecretsRepository)
		private chatSecretsRepository: ChatSecretsRepository,

		@Inject(DI.chatPollsRepository)
		private chatPollsRepository: ChatPollsRepository,

		@Inject(DI.chatCardsRepository)
		private chatCardsRepository: ChatCardsRepository,

		@Inject(DI.chatRoomInvitationsRepository)
		private chatRoomInvitationsRepository: ChatRoomInvitationsRepository,

		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		private userEntityService: UserEntityService,
		private chatEntityService: ChatEntityService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
		private apRendererService: ApRendererService,
		private queueService: QueueService,
		private pushNotificationService: PushNotificationService,
		private notificationService: NotificationService,
		private userBlockingService: UserBlockingService,
		private queryService: QueryService,
		private roleService: RoleService,
		private userFollowingService: UserFollowingService,
		private customEmojiService: CustomEmojiService,
		private moderationLogService: ModerationLogService,
	) {
	}

	@bindThis
	public async getChatAvailability(userId: MiUser['id']): Promise<{ read: boolean; write: boolean; }> {
		const policies = await this.roleService.getUserPolicies(userId);

		switch (policies.chatAvailability) {
			case 'available':
				return {
					read: true,
					write: true,
				};
			case 'readonly':
				return {
					read: true,
					write: false,
				};
			case 'unavailable':
				return {
					read: false,
					write: false,
				};
			default:
				throw new Error('invalid chat availability (unreachable)');
		}
	}

	/** getChatAvailabilityの糖衣。主にAPI呼び出し時に走らせて、権限的に問題ない場合はそのまま続行する */
	@bindThis
	public async checkChatAvailability(userId: MiUser['id'], permission: 'read' | 'write') {
		const policy = await this.getChatAvailability(userId);
		if (policy[permission] === false) {
			throw new Error('ROLE_PERMISSION_DENIED');
		}
	}

	@bindThis
	public async createMessageToUser(fromUser: { id: MiUser['id']; host: MiUser['host']; }, toUser: MiUser, params: {
		text?: string | null;
		file?: MiDriveFile | null;
		uri?: string | null;
	}): Promise<Packed<'ChatMessageLiteFor1on1'>> {
		if (fromUser.id === toUser.id) {
			throw new Error('yourself');
		}

		const approvals = await this.chatApprovalsRepository.createQueryBuilder('approval')
			.where(new Brackets(qb => { // 自分が相手を許可しているか
				qb.where('approval.userId = :fromUserId', { fromUserId: fromUser.id })
					.andWhere('approval.otherId = :toUserId', { toUserId: toUser.id });
			}))
			.orWhere(new Brackets(qb => { // 相手が自分を許可しているか
				qb.where('approval.userId = :toUserId', { toUserId: toUser.id })
					.andWhere('approval.otherId = :fromUserId', { fromUserId: fromUser.id });
			}))
			.take(2)
			.getMany();

		const otherApprovedMe = approvals.some(approval => approval.userId === toUser.id);
		const iApprovedOther = approvals.some(approval => approval.userId === fromUser.id);

		if (!otherApprovedMe) {
			if (toUser.chatScope === 'none') {
				throw new Error('recipient is cannot chat (none)');
			} else if (toUser.chatScope === 'followers') {
				const isFollower = await this.userFollowingService.isFollowing(fromUser.id, toUser.id);
				if (!isFollower) {
					throw new Error('recipient is cannot chat (followers)');
				}
			} else if (toUser.chatScope === 'following') {
				const isFollowing = await this.userFollowingService.isFollowing(toUser.id, fromUser.id);
				if (!isFollowing) {
					throw new Error('recipient is cannot chat (following)');
				}
			} else if (toUser.chatScope === 'mutual') {
				const isMutual = await this.userFollowingService.isMutual(fromUser.id, toUser.id);
				if (!isMutual) {
					throw new Error('recipient is cannot chat (mutual)');
				}
			}
		}

		if (!(await this.getChatAvailability(toUser.id)).write) {
			throw new Error('recipient is cannot chat (policy)');
		}

		const blocked = await this.userBlockingService.checkBlocked(toUser.id, fromUser.id);
		if (blocked) {
			throw new Error('blocked');
		}

		const message = {
			id: this.idService.gen(),
			fromUserId: fromUser.id,
			toUserId: toUser.id,
			text: params.text ? params.text.trim() : null,
			fileId: params.file ? params.file.id : null,
			reads: [],
			uri: params.uri ?? null,
		} satisfies Partial<MiChatMessage>;

		const inserted = await this.chatMessagesRepository.insertOne(message);

		// 相手を許可しておく
		if (!iApprovedOther) {
			this.chatApprovalsRepository.insertOne({
				id: this.idService.gen(),
				userId: fromUser.id,
				otherId: toUser.id,
			});
		}

		const packedMessage = await this.chatEntityService.packMessageLiteFor1on1(inserted);

		if (this.userEntityService.isLocalUser(toUser)) {
			const redisPipeline = this.redisClient.pipeline();
			redisPipeline.set(`newUserChatMessageExists:${toUser.id}:${fromUser.id}`, message.id);
			redisPipeline.sadd(`newChatMessagesExists:${toUser.id}`, `user:${fromUser.id}`);
			redisPipeline.exec();
		}

		if (this.userEntityService.isLocalUser(fromUser)) {
			// 自分のストリーム
			this.globalEventService.publishChatUserStream(fromUser.id, toUser.id, 'message', packedMessage);
		}

		if (this.userEntityService.isLocalUser(toUser)) {
			// 相手のストリーム
			this.globalEventService.publishChatUserStream(toUser.id, fromUser.id, 'message', packedMessage);
		}

		// 3秒経っても既読にならなかったらイベント発行
		if (this.userEntityService.isLocalUser(toUser)) {
			setTimeout(async () => {
				const marker = await this.redisClient.get(`newUserChatMessageExists:${toUser.id}:${fromUser.id}`);

				if (marker == null) return; // 既読

				const packedMessageForTo = await this.chatEntityService.packMessageDetailed(inserted, toUser);
				this.globalEventService.publishMainStream(toUser.id, 'newChatMessage', packedMessageForTo);
				this.pushNotificationService.pushNotification(toUser.id, 'newChatMessage', packedMessageForTo);
			}, 3000);
		}

		return packedMessage;
	}

	@bindThis
	public async listSecret(roomId: MiChatRoom['id'], me?: MiUser) {
		const secrets = await this.chatSecretsRepository.find({ where: { roomId, revealedId: IsNull() }});
		return secrets.map(s => ({ id: s.id, title: s.title, roomId: s.roomId, fromUserId: s.userId, revealsAt: s.revealsAt?.toISOString() ?? null, createdAt: this.idService.parse(s.id).date.toISOString() }));
	}

	@bindThis
	public async listPoll(roomId: MiChatPoll['id'], me?: MiUser) {
		const [scheduledPolls, startedPolls] = await Promise.all([
			this.chatPollsRepository.findBy({ roomId, startedId: IsNull() })
				.then((p) => this.chatEntityService.packPollsScheduled(p)), 
			this.chatPollsRepository.findBy({ roomId, startedId: Not(IsNull()), finishedId: IsNull() })
				.then((p) => this.chatEntityService.packPollsStarted(p)),
		]);
		return { scheduledPolls, startedPolls };
	}

	@bindThis
	public async listCard(roomId: MiChatRoom['id'], user: { id: MiUser['id'] }) {
		const cards = await this.chatCardsRepository.findBy({ roomId, userId: user.id, revealedId: IsNull() });
		return this.chatEntityService.packCards(cards);
	}

	@bindThis
	public async revealSecret(id: MiChatSecret['id'], user?: MiUser) {
		const secret = await this.chatSecretsRepository.findOneBy({ id });
		if (secret == null) {
			throw new IdentifiableError('c2b21243-e687-4e71-9b87-b60031874fcc', 'no such secret');
		}
		if (user) {
			if (secret.userId !== user.id) {
				throw new IdentifiableError('f16f7e8b-044c-498b-8946-1bb52718663d', 'not permitted to disclose secret');
			}
		}
		if (secret.revealedId) {
			return;
		}
		const revealedId = this.idService.gen();
		await this.chatSecretsRepository.update(id, { revealedId });
		const packedSecret: Packed<'ChatSecretRevealed'> = await this.chatEntityService.packSecretRevealed({ ...secret, revealedId });
		this.globalEventService.publishChatRoomStream(secret.roomId, 'secretRevealed', packedSecret);
	}

	@bindThis
	public async revealCard(deliverId: MiChatCard['deliverId'], cardId: MiChatCard['cardId'], user?: MiUser) {
		const card = await this.chatCardsRepository.findOneBy({ deliverId, cardId });
		if (card == null) {
			throw new IdentifiableError('e2cdba26-87c9-43bb-98d5-5c28b0329c9c', 'no such card');
		}
		if (user) {
			if (card.userId !== user.id) {
				throw new IdentifiableError('b56c91ef-b1ee-48e7-bfb0-bee1025cb905', 'not permitted to disclose card');
			}
		}
		if (card.revealedId) {
			return;
		}
		const revealedId = this.idService.gen();
		await this.chatCardsRepository.update({ deliverId, cardId }, { revealedId });
		const packedCard: Packed<'ChatCardRevealed'> = await this.chatEntityService.packCardRevealed({ ...card, revealedId });
		this.globalEventService.publishChatRoomStream(card.roomId, 'cardRevealed', packedCard);
	}

	@bindThis
	public async schedulePoll(poll: MiChatPoll) {
		const packedPollScheduled: Packed<'ChatPollScheduled'> = await this.chatEntityService.packPollScheduled(poll);
		this.globalEventService.publishChatRoomStream(poll.roomId, 'pollScheduled', packedPollScheduled);
		if (poll.startsAt) {
			const delay = poll.startsAt.getTime() - new Date().getTime();
			if (delay <= 0) {
				throw new Error("invalid startTime");
			}
			this.queueService.endChatPollQueue.add('end', {
				pollId: poll.id,
				action: 'start'
			}, {
				delay,
				removeOnComplete: true,
			});
		}
	}

	@bindThis
	public async startPoll(pollId: MiChatPoll['id'], user?: { id: MiUser["id"] }) {
		const poll = await this.chatPollsRepository.findOneByOrFail({ id: pollId });
		if (user) {
			if (poll.ownerId !== user.id) {
				throw new Error("not permitted to start poll");
			}
		}
		if (poll.startedId != null) {
			return;
		}
		const startedId = this.idService.gen();
		await this.chatPollsRepository.update(poll.id, { startedId });
		const packedPollStarted: Packed<'ChatPollStarted'> = await this.chatEntityService.packPollStarted({ ...poll, startedId });
		this.globalEventService.publishChatRoomStream(poll.roomId, 'pollStarted', packedPollStarted);
		if (poll.duration) {
			const delay = poll.duration * 1000;
			if (delay <= 0) {
				throw new Error("invalid duration");
			}
			this.queueService.endChatPollQueue.add('end', {
				pollId: poll.id,
				action: 'finish'
			}, {
				delay,
				removeOnComplete: true,
			});
		}
	}

	@bindThis
	public async finishPoll(pollId: MiChatPoll['id'], user?: { id: MiUser["id"] }) {
		const poll = await this.chatPollsRepository.findOneOrFail({ where: { id: pollId }, relations: ['votes']}) as MiChatPollWithVotes;
		if (user) {
			if (poll.ownerId !== user.id) {
				throw new Error("not permitted to close poll");
			}
		}
		if (poll.finishedId != null) {
			return;
		}
		const finishedId = this.idService.gen();
		await this.chatPollsRepository.update(poll.id, { finishedId });
		const packedPoll: Packed<'ChatPollFinished'> = await this.chatEntityService.packPollFinished({ ...poll, finishedId });
		this.globalEventService.publishChatRoomStream(poll.roomId, 'pollFinished', packedPoll);
	}

	@bindThis
	public async createMessageToRoom(fromUser: { id: MiUser['id']; host: MiUser['host']; }, toRoom: MiChatRoom, params: {
		text?: string | null;
		file?: MiDriveFile | null;
		uri?: string | null;
		poll?: {
			title: string;
			choices: string[];
			startsAt?: Date;
			duration?: number;
			voteForUsers: boolean;
			anonymous: boolean;
		};
		commitSecret?: {
			title: string;
			plaintext: string;
			revealsAt?: Date;
		}
		deliverCards?: {
			title: string;
			cards: { name: string; count: number }[];
			deliver: { [key: MiUser['id']]: number };
		};
		visibleUserIds?: MiUser['id'][];
		channel?: string | null;
	}): Promise<Packed<'ChatMessageLiteForRoom'> | null> {
		if (toRoom.isArchived) {
			throw new Error("the room is archived");
		}

		const memberships = (await this.chatRoomMembershipsRepository.findBy({ roomId: toRoom.id, hasLeft: false })).map(m => ({
			userId: m.userId,
			isMuted: m.isMuted,
		}))

		if (!memberships.some(member => member.userId === fromUser.id)) {
			throw new IdentifiableError('d62635ea-26b0-43e5-84af-fbf6c6dcd08a', 'you are not a member of the room');
		}

		const membershipsOtherThanMe = memberships.filter(member => member.userId !== fromUser.id);

		const message = {
			id: this.idService.gen(),
			fromUserId: fromUser.id,
			toRoomId: toRoom.id,
			text: params.text ? params.text.trim() : null,
			fileId: params.file ? params.file.id : null,
			reads: [],
			uri: params.uri ?? null,
			visibleUserIds: params.visibleUserIds ?? null,
		} satisfies Partial<MiChatMessage>;

		let inserted = null;
		let packedMessage = null;

		if (message.text || message.fileId) {
			inserted = await this.chatMessagesRepository.insertOne(message);

			packedMessage = await this.chatEntityService.packMessageLiteForRoom(inserted);

			if (!message.visibleUserIds) {
				this.globalEventService.publishChatRoomStream(toRoom.id, 'message', packedMessage);
			} else {
				for (const userId of message.visibleUserIds) {
					this.globalEventService.publishChatRoomUserStream(toRoom.id, userId, 'message', packedMessage);
				}
			}
		}

		if (params.commitSecret) {
			const now = new Date();
			const secret = {
				id: message.id,
				plaintext: params.commitSecret.plaintext,
				roomId: toRoom.id,
				room: null,
				userId: fromUser.id,
				user: null,
				title: params.commitSecret.title,
				revealsAt: params.commitSecret.revealsAt ?? null,
				revealedId: null,
			} satisfies Partial<MiChatSecret>;
			await this.chatSecretsRepository.insertOne(secret);
			const packedSecret: Packed<'ChatSecret'> = await this.chatEntityService.packSecret(secret);
			this.globalEventService.publishChatRoomStream(toRoom.id, 'secretCommitted', packedSecret);
			if (secret.revealsAt) {
				const delay = secret.revealsAt.getTime() - now.getTime();
				if (delay <= 0) {
					throw new Error("invalid expiration");
				}
				this.queueService.revealChatSecretQueue.add('reveal', {
					id: message.id,
				}, {
					delay,
					removeOnComplete: true,
				});
			}
		}

		if (params.poll) {
			const poll = {
				id: message.id,
				roomId: toRoom.id,
				room: null,
				ownerId: fromUser.id,
				owner: null,
				title: params.poll.title,
				choices: params.poll.choices,
				voteForUsers: params.poll.voteForUsers ?? false,
				anonymous: params.poll.anonymous ?? false,
				startsAt: params.poll.startsAt ?? null,
				startedId: null,
				duration: params.poll.duration ?? null,
				finishedId: null,
				votes: null,
			} satisfies Partial<MiChatPoll>;
			await this.chatPollsRepository.insertOne(poll);
			if (poll.startsAt != null) {
				this.schedulePoll(poll);
			} else {
				await this.startPoll(poll.id);
			}
		}

		if (params.deliverCards) {
			const cards = params.deliverCards.cards;
			const deck = [];
			for (const c of cards) {
				for (let i = 0; i < c.count; i++) {
					deck.push(c.name);
				}
			}
			const deliver = params.deliverCards.deliver;
			const title = params.deliverCards.title;

			const destinations = memberships.map((m) => m.userId).filter((member) => deliver[member] != null && deliver[member] > 0);

			const cardsToDeliver = destinations.reduce((sum, key) => deliver[key] + sum, 0);
			if (deck.length < cardsToDeliver) {
				throw new Error('not enough cards');
			}

			const cardsPerUser: { [key: MiUser['id']]: string[] }  = {};
			const shuffledCards = shuffle(deck);
			destinations.forEach(dest => {
            const count = deliver[dest];
            cardsPerUser[dest] = shuffledCards.splice(0, count);
			});
			let i = 0;
			for (const userId of destinations) {
				for (const cardKind of cardsPerUser[userId]) {
					const card = {
						deliverId: message.id,
						cardId: i,
						userId,
						user: null,
						roomId: toRoom.id,
						room: null,
						cardKind,
						revealedId: null,
					} satisfies Partial<MiChatCard>;
					await this.chatCardsRepository.insertOne(card);
					const packedCard: Packed<'ChatCard'> = await this.chatEntityService.packCard(card);
					this.globalEventService.publishChatRoomUserStream(toRoom.id, userId, 'cardDelivered', packedCard);
					i++;
				}
			}
		}

		const redisPipeline = this.redisClient.pipeline();
		for (const membership of membershipsOtherThanMe) {
			if (membership.isMuted) continue;

			redisPipeline.set(`newRoomChatMessageExists:${membership.userId}:${toRoom.id}`, message.id);
			redisPipeline.sadd(`newChatMessagesExists:${membership.userId}`, `room:${toRoom.id}`);
		}
		redisPipeline.exec();

		// 3秒経っても既読にならなかったらイベント発行
		setTimeout(async () => {
			if (inserted == null) { return }
			const redisPipeline = this.redisClient.pipeline();
			for (const membership of membershipsOtherThanMe) {
				redisPipeline.get(`newRoomChatMessageExists:${membership.userId}:${toRoom.id}`);
			}
			const markers = await redisPipeline.exec();
			if (markers == null) throw new Error('redis error');

			if (markers.every(marker => marker[1] == null)) return;

			const packedMessageForTo = await this.chatEntityService.packMessageDetailed(inserted);

			for (let i = 0; i < membershipsOtherThanMe.length; i++) {
				const marker = markers[i][1];
				if (marker == null) continue;

				this.globalEventService.publishMainStream(membershipsOtherThanMe[i].userId, 'newChatMessage', packedMessageForTo);
				this.pushNotificationService.pushNotification(membershipsOtherThanMe[i].userId, 'newChatMessage', packedMessageForTo);
			}
		}, 3000);

		return packedMessage;
	}

	@bindThis
	public async readUserChatMessage(
		readerId: MiUser['id'],
		senderId: MiUser['id'],
	): Promise<void> {
		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.del(`newUserChatMessageExists:${readerId}:${senderId}`);
		redisPipeline.srem(`newChatMessagesExists:${readerId}`, `user:${senderId}`);
		await redisPipeline.exec();
	}

	@bindThis
	public async readRoomChatMessage(
		readerId: MiUser['id'],
		roomId: MiChatRoom['id'],
	): Promise<void> {
		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.del(`newRoomChatMessageExists:${readerId}:${roomId}`);
		redisPipeline.srem(`newChatMessagesExists:${readerId}`, `room:${roomId}`);
		await redisPipeline.exec();
	}

	@bindThis
	public async readAllChatMessages(
		readerId: MiUser['id'],
	): Promise<void> {
		const redisPipeline = this.redisClient.pipeline();
		// TODO: newUserChatMessageExists とか newRoomChatMessageExists も消したい(けどキーの列挙が必要になって面倒)
		redisPipeline.del(`newChatMessagesExists:${readerId}`);
		await redisPipeline.exec();
	}

	@bindThis
	public findMessageById(messageId: MiChatMessage['id']) {
		return this.chatMessagesRepository.findOneBy({ id: messageId });
	}

	@bindThis
	public findMyMessageById(userId: MiUser['id'], messageId: MiChatMessage['id']) {
		return this.chatMessagesRepository.findOneBy({ id: messageId, fromUserId: userId });
	}

	@bindThis
	public async hasPermissionToViewRoomTimeline(meId: MiUser['id'], room: MiChatRoom) {
		if (await this.isRoomMember(room, meId)) {
			return true;
		} else {
			const iAmModerator = await this.roleService.isModerator({ id: meId });
			if (iAmModerator) {
				return true;
			}

			return false;
		}
	}

	@bindThis
	public async deleteMessage(message: MiChatMessage) {
		await this.chatMessagesRepository.delete(message.id);

		if (message.toUserId) {
			const [fromUser, toUser] = await Promise.all([
				this.usersRepository.findOneByOrFail({ id: message.fromUserId }),
				this.usersRepository.findOneByOrFail({ id: message.toUserId }),
			]);

			if (this.userEntityService.isLocalUser(fromUser)) this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId, 'deleted', message.id);
			if (this.userEntityService.isLocalUser(toUser)) this.globalEventService.publishChatUserStream(message.toUserId, message.fromUserId, 'deleted', message.id);

			if (this.userEntityService.isLocalUser(fromUser) && this.userEntityService.isRemoteUser(toUser)) {
				//const activity = this.apRendererService.addContext(this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${message.id}`), fromUser));
				//this.queueService.deliver(fromUser, activity, toUser.inbox);
			}
		} else if (message.toRoomId) {
			this.globalEventService.publishChatRoomStream(message.toRoomId, 'deleted', message.id);
		}
	}

	@bindThis
	public async userTimeline(meId: MiUser['id'], otherId: MiUser['id'], limit: number, sinceId?: MiChatMessage['id'] | null, untilId?: MiChatMessage['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatMessagesRepository.createQueryBuilder('message'), sinceId, untilId)
			.andWhere(new Brackets(qb => {
				qb
					.where(new Brackets(qb => {
						qb
							.where('message.fromUserId = :meId')
							.andWhere('message.toUserId = :otherId');
					}))
					.orWhere(new Brackets(qb => {
						qb
							.where('message.fromUserId = :otherId')
							.andWhere('message.toUserId = :meId');
					}));
			}))
			.setParameter('meId', meId)
			.setParameter('otherId', otherId);

		const messages = await query.take(limit).getMany();

		return messages;
	}


	private mergeSorted<T>(
		arrays: T[][],
		ascending: boolean,
		getKey: (item: T) => number
	): T[] {
		const mergeHeads = new Array(arrays.length).fill(0);
		const result: T[] = [];
	
		while (true) {
			let bestItem: T | null = null;
			let bestKey: number = -Infinity;
			let bestIndex: number = -1;
	
			for (let i = 0; i < arrays.length; i++) {
				if (mergeHeads[i] >= arrays[i].length) {
					continue;
				}
	
				const currentItem = arrays[i][mergeHeads[i]];
				const currentKey = (ascending ? -1 : 1) * getKey(currentItem);
				if (currentKey > bestKey) {
					bestIndex = i;
					bestKey = currentKey;
					bestItem = currentItem;
				}
			}
	
			/* all scanned */
			if (bestItem === null) {
				break;
			}
			result.push(bestItem);
			mergeHeads[bestIndex]++;
		}
		return result;
	}

	/**
	 * limit is a soft limit -- when multiple entries are found in the last ID, then entries having the last IDs are returned beyond the provided limit
	 */
	@bindThis
	public async roomTimeline(
		roomId: MiChatRoom['id'],
		limit: number,
		meId: MiUser['id'],
		sinceId: MiChatMessage['id'] | null,
		untilId: MiChatMessage['id'] | null
	) {
		const ascending = (sinceId != null);
		const noId = sinceId == null && untilId == null;
		// calculate the last Id
		const otherIds: { id: string }[] = await this.db.query(`
			SELECT "id" FROM (
				SELECT "id", 'message' AS "type", 0 AS "subkey" FROM "chat_message" WHERE "toRoomId" = $1
			   UNION ALL
				SELECT "startedId" as "id", 'pollStarted' AS "type", 0::smallint AS "subkey" FROM "chat_poll" WHERE "roomId" = $1 AND "startedId" IS NOT NULL
			   UNION ALL
				SELECT "finishedId" as "id", 'pollFinished' AS "type", 0::smallint AS "subkey" FROM "chat_poll" WHERE "roomId" = $1 AND "finishedId" IS NOT NULL
			   UNION ALL
				SELECT "id", 'secretComitted' AS "type", 0::smallint AS "subkey" FROM "chat_secret" WHERE "roomId" = $1
			   UNION ALL
				SELECT "revealedId" as "id", 'secretRevealed' AS "type", 0::smallint AS "subkey" FROM "chat_secret" WHERE "roomId" = $1 AND "revealedId" IS NOT NULL
			   UNION ALL
				SELECT "deliverId" as "id", 'cardDelivered' AS "type", "cardId" AS "subkey" FROM "chat_card" WHERE "roomId" = $1 AND "userId" = $2
			   UNION ALL
				SELECT "revealedId" as "id", 'cardRevealed' AS "type", 0::smallint AS "subkey" FROM "chat_card" WHERE "roomId" = $1 AND "revealedId" IS NOT NULL
			) as "tiimeline" ${ noId ? "" : `WHERE ("id" ${ascending ? '>' : '<'} $4)` } ORDER BY "id" DESC, "type" DESC, "subkey" DESC
			LIMIT $3
		`, [roomId, meId, limit, ...(noId ? [] : [ascending ? sinceId : untilId])]);

		if (otherIds.length === 0) {
			return [];
		}

		if (ascending) {
			untilId = otherIds[otherIds.length - 1].id;
		} else {
			sinceId = otherIds[otherIds.length - 1].id;
		}
	
		const [messages, polls, finishedPolls, secrets, revealedSecrets, cards, revealedCards] = await Promise.all([
			this.queryService
				.getRange(this.chatMessagesRepository.createQueryBuilder('message'), sinceId, untilId, ascending, 'id')
				.andWhere('message.toRoomId = :roomId', { roomId })
				.andWhere(new Brackets(qb => {
					qb.where('message.visibleUserIds IS NULL')
						.orWhere('message.fromUserId = :meId')
						.orWhere(':meIdAsList <@ message.visibleUserIds');
				}), { meId, meIdAsList: [meId] })
				.leftJoinAndSelect('message.file', 'file')
				.leftJoinAndSelect('message.fromUser', 'fromUser')
				.getMany(),
			this.queryService
				.getRange(this.chatPollsRepository.createQueryBuilder('poll'), sinceId, untilId, ascending, 'startedId')
				.andWhere('poll.roomId = :roomId', { roomId })
				.andWhere('poll.startedId IS NOT NULL')
				.getMany(),
			this.queryService
				.getRange(this.chatPollsRepository.createQueryBuilder('poll'), sinceId, untilId, ascending, 'finishedId')
				.leftJoinAndSelect('poll.votes', 'vote')
				.andWhere('poll.roomId = :roomId', { roomId })
				.andWhere('poll.finishedId IS NOT NULL')
				.getMany(),
			this.queryService
				.getRange(this.chatSecretsRepository.createQueryBuilder('secret'), sinceId, untilId, ascending, 'id')
				.andWhere('secret.roomId = :roomId', { roomId })
				.getMany(),
			this.queryService
				.getRange(this.chatSecretsRepository.createQueryBuilder('secret'), sinceId, untilId, ascending, 'revealedId')
				.andWhere('secret.roomId = :roomId', { roomId })
				.andWhere('secret.revealedId IS NOT NULL')
				.getMany(),
			this.queryService
				.getRange(this.chatCardsRepository.createQueryBuilder('card'), sinceId, untilId, ascending, 'deliverId')
				.andWhere('card.roomId = :roomId', { roomId })
				.andWhere('card.userId = :userId', { userId: meId })
				.getMany(),
			this.queryService
				.getRange(this.chatCardsRepository.createQueryBuilder('card'), sinceId, untilId, ascending, 'revealedId')
				.andWhere('card.roomId = :roomId', { roomId })
				.andWhere('card.revealedId IS NOT NULL')
				.getMany()]);

		const [packedMessages, packedPolls, packedPollsFinished, packedSecrets, packedSecretsRevealed, packedCards, packedCardsRevealed] = await Promise.all([
			this.chatEntityService.packMessagesLiteForRoom(messages),
			this.chatEntityService.packPollsStarted(polls),
			this.chatEntityService.packPollsFinished(finishedPolls as MiChatPollWithVotes[]),
			this.chatEntityService.packSecrets(secrets),
			this.chatEntityService.packSecretsRevealed(revealedSecrets),
			this.chatEntityService.packCards(cards),
			this.chatEntityService.packCardsRevealed(revealedCards)]);

		const events: Packed<'ChatEvent'>[][] = [
			packedMessages.map(x => ({ type: 'message', data: x })),
			packedPolls.map(x => ({ type: 'pollStarted', data: x })),
			packedPollsFinished.map(x => ({ type: 'pollFinished', data: x })),
			packedSecrets.map(x => ({ type: 'secretCommitted', data: x })),
			packedSecretsRevealed.map(x => ({ type: 'secretRevealed', data: x })),
			packedCards.map(x => ({ type: 'cardDelivered', data: x })),
			packedCardsRevealed.map(x => ({ type: 'cardRevealed', data: x })),
		];
	
		return this.mergeSorted(events, ascending, x => Date.parse(x.data.createdAt))
	}

	@bindThis
	public async userHistory(meId: MiUser['id'], limit: number): Promise<MiChatMessage[]> {
		const history: MiChatMessage[] = [];

		const mutingQuery = this.mutingsRepository.createQueryBuilder('muting')
			.select('muting.muteeId')
			.where('muting.muterId = :muterId', { muterId: meId });

		for (let i = 0; i < limit; i++) {
			const found = history.map(m => (m.fromUserId === meId) ? m.toUserId! : m.fromUserId!);

			const query = this.chatMessagesRepository.createQueryBuilder('message')
				.orderBy('message.id', 'DESC')
				.where(new Brackets(qb => {
					qb
						.where('message.fromUserId = :meId', { meId: meId })
						.orWhere('message.toUserId = :meId', { meId: meId });
				}))
				.andWhere('message.toRoomId IS NULL')
				.andWhere(`message.fromUserId NOT IN (${ mutingQuery.getQuery() })`)
				.andWhere(`message.toUserId NOT IN (${ mutingQuery.getQuery() })`);

			if (found.length > 0) {
				query.andWhere('message.fromUserId NOT IN (:...found)', { found: found });
				query.andWhere('message.toUserId NOT IN (:...found)', { found: found });
			}

			query.setParameters(mutingQuery.getParameters());

			const message = await query.getOne();

			if (message) {
				history.push(message);
			} else {
				break;
			}
		}

		return history;
	}

	@bindThis
	public async roomHistory(meId: MiUser['id'], limit: number): Promise<MiChatMessage[]> {
		const roomIds = await this.chatRoomMembershipsRepository.findBy({ userId: meId, hasLeft: false }).then(xs => xs.map(x => x.roomId))

		if (roomIds.length === 0) {
			return [];
		}

		const history: MiChatMessage[] = [];

		for (let i = 0; i < limit; i++) {
			const found = history.map(m => m.toRoomId!);

			const query = this.chatMessagesRepository.createQueryBuilder('message')
				.orderBy('message.id', 'DESC')
				.where('message.toRoomId IN (:...roomIds)', { roomIds });

			if (found.length > 0) {
				query.andWhere('message.toRoomId NOT IN (:...found)', { found: found });
			}

			const message = await query.getOne();

			if (message) {
				history.push(message);
			} else {
				break;
			}
		}

		return history;
	}

	@bindThis
	public async getUserReadStateMap(userId: MiUser['id'], otherIds: MiUser['id'][]) {
		const readStateMap: Record<MiUser['id'], boolean> = {};

		const redisPipeline = this.redisClient.pipeline();

		for (const otherId of otherIds) {
			redisPipeline.get(`newUserChatMessageExists:${userId}:${otherId}`);
		}

		const markers = await redisPipeline.exec();
		if (markers == null) throw new Error('redis error');

		for (let i = 0; i < otherIds.length; i++) {
			const marker = markers[i][1];
			readStateMap[otherIds[i]] = marker == null;
		}

		return readStateMap;
	}

	@bindThis
	public async getRoomReadStateMap(userId: MiUser['id'], roomIds: MiChatRoom['id'][]) {
		const readStateMap: Record<MiChatRoom['id'], boolean> = {};

		const redisPipeline = this.redisClient.pipeline();

		for (const roomId of roomIds) {
			redisPipeline.get(`newRoomChatMessageExists:${userId}:${roomId}`);
		}

		const markers = await redisPipeline.exec();
		if (markers == null) throw new Error('redis error');

		for (let i = 0; i < roomIds.length; i++) {
			const marker = markers[i][1];
			readStateMap[roomIds[i]] = marker == null;
		}

		return readStateMap;
	}

	@bindThis
	public async hasUnreadMessages(userId: MiUser['id']) {
		const card = await this.redisClient.scard(`newChatMessagesExists:${userId}`);
		return card > 0;
	}

	@bindThis
	public async createRoom(owner: MiUser, params: Partial<{
		name: string;
		description: string;
		capacity: number;
		expiration: number | null;
		isPublic: boolean;
		theme: string | null;
	}>) {
		const room = {
			id: this.idService.gen(),
			name: params.name,
			description: params.description,
			ownerId: owner.id,
			capacity: params.capacity,
			expiration: params.expiration,
			isPublic: params.isPublic,
			theme: params.theme,
		} satisfies Partial<MiChatRoom>;

		const created = await this.chatRoomsRepository.insertOne(room);
		if (room.expiration) {
			this.queueService.closeExpiredChatRoomQueue.add(room.id, {
				id: room.id,
			}, {
				delay: room.expiration,
				removeOnComplete: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 30,
				},
				removeOnFail: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 100,
				},
			});
		}
		await this.joinToRoom(owner.id, room.id);

		return created;
	}

	@bindThis
	public async hasPermissionToDeleteRoom(meId: MiUser['id'], room: MiChatRoom) {
		if (room.ownerId === meId) {
			return true;
		}

		const iAmModerator = await this.roleService.isModerator({ id: meId });
		if (iAmModerator) {
			return true;
		}

		return false;
	}

	@bindThis
	public async hasPermissionToKick(meId: MiUser['id'], room: MiChatRoom) {
		if (room.ownerId === meId) {
			return true;
		}
		return false;
	}

	@bindThis
	public async deleteRoom(room: MiChatRoom, deleter?: MiUser) {
		const memberships = (await this.chatRoomMembershipsRepository.findBy({ roomId: room.id })).map(m => ({
			userId: m.userId,
		}))

		// 未読フラグ削除
		const redisPipeline = this.redisClient.pipeline();
		for (const membership of memberships) {
			redisPipeline.del(`newRoomChatMessageExists:${membership.userId}:${room.id}`);
			redisPipeline.srem(`newChatMessagesExists:${membership.userId}`, `room:${room.id}`);
		}
		await redisPipeline.exec();

		await this.chatRoomsRepository.delete(room.id);

		if (deleter) {
			const deleterIsModerator = await this.roleService.isModerator(deleter);

			if (deleterIsModerator) {
				this.moderationLogService.log(deleter, 'deleteChatRoom', {
					roomId: room.id,
					room: room,
				});
			}
		}
	}

	@bindThis
	public async archiveRoom(roomId: MiChatRoom['id'], archiver?: MiUser) {
		await this.chatRoomsRepository.update(roomId, { isArchived: true });

		if (archiver) {
			const archiverIsModerator = await this.roleService.isModerator(archiver);

			if (archiverIsModerator) {
				this.moderationLogService.log(archiver, 'archiveChatRoom', {
					roomId,
				});
			}
		}

		this.globalEventService.publishChatRoomStream(roomId, 'roomArchived', { archiverId: archiver?.id });
	}

	@bindThis
	public async findMyRoomById(ownerId: MiUser['id'], roomId: MiChatRoom['id'], includeArchived: boolean = true) {
		return this.chatRoomsRepository.findOneBy({ id: roomId, ownerId: ownerId, isArchived: includeArchived ? undefined : false });
	}

	@bindThis
	public async findRoomById(roomId: MiChatRoom['id'], includeArchived: boolean = true) {
		return this.chatRoomsRepository.findOne({ where: { id: roomId, isArchived: includeArchived ? undefined : false  }, relations: ['owner'] });
	}

	@bindThis
	public async isRoomMember(room: MiChatRoom, userId: MiUser['id']) {
		if (room.ownerId === userId) return true;
		const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId, hasLeft: false });
		return membership != null;
	}

	@bindThis
	public async createRoomInvitation(inviterId: MiUser['id'], roomId: MiChatRoom['id'], inviteeId: MiUser['id']) {
		if (inviterId === inviteeId) {
			throw new Error('yourself');
		}

		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId, ownerId: inviterId, isArchived: false });

		if (await this.isRoomMember(room, inviteeId)) {
			throw new Error('already member');
		}

		const existingInvitation = await this.chatRoomInvitationsRepository.findOneBy({ roomId, userId: inviteeId });
		if (existingInvitation) {
			throw new Error('already invited');
		}

		const membershipsCount = await this.chatRoomMembershipsRepository.countBy({ roomId, hasLeft: false });
		if (membershipsCount >= room.capacity) {
			throw new Error('room is full');
		}

		// TODO: cehck block

		const invitation = {
			id: this.idService.gen(),
			roomId: room.id,
			userId: inviteeId,
		} satisfies Partial<MiChatRoomInvitation>;

		const created = await this.chatRoomInvitationsRepository.insertOne(invitation);

		this.notificationService.createNotification(inviteeId, 'chatRoomInvitationReceived', {
			invitationId: invitation.id,
		}, inviterId);

		return created;
	}

	@bindThis
	public async getSentRoomInvitationsWithPagination(roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatRoomInvitation['id'] | null, untilId?: MiChatRoomInvitation['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomInvitationsRepository.createQueryBuilder('invitation'), sinceId, untilId)
			.andWhere('invitation.roomId = :roomId', { roomId });

		const invitations = await query.take(limit).getMany();

		return invitations;
	}

	@bindThis
	public async getOwnedRoomsWithPagination(ownerId: MiUser['id'], limit: number, includeArchived?: boolean, sinceId?: MiChatRoom['id'] | null, untilId?: MiChatRoom['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomsRepository.createQueryBuilder('room'), sinceId, untilId)
			.andWhere('room.ownerId = :ownerId', { ownerId });
		if (!includeArchived) {
			query.andWhere('room.isArchived = FALSE');
		}

		const rooms = await query.take(limit).getMany();

		return rooms;
	}

	@bindThis
	public async getReceivedRoomInvitationsWithPagination(userId: MiUser['id'], limit: number, sinceId?: MiChatRoomInvitation['id'] | null, untilId?: MiChatRoomInvitation['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomInvitationsRepository.createQueryBuilder('invitation'), sinceId, untilId)
			.andWhere('invitation.userId = :userId', { userId })
			.andWhere('invitation.ignored = FALSE');

		const invitations = await query.take(limit).getMany();

		return invitations;
	}

	@bindThis
	public async joinToRoom(userId: MiUser['id'], roomId: MiChatRoom['id'], params?: { bubbleColor?: string, bubbleStyle?: string }) {
		const room = await this.chatRoomsRepository.findOneBy({ id: roomId, isArchived: false });
		if (room == null) {
			throw new IdentifiableError('6c9dec02-d228-43a5-978c-a53e8bba889c', 'no such room');
		}
		const invitation = await this.chatRoomInvitationsRepository.findOneBy({ roomId, userId });

		if (!room.isPublic && !invitation && room.ownerId != userId) {
			throw new Error('cannot join to private room without invitation');
		}
		const blocked = await this.userBlockingService.checkBlocked(room.ownerId, userId);
		if (blocked) {
			throw new Error('blocked');
		}

		const membershipsCount = await this.chatRoomMembershipsRepository.countBy({ roomId, hasLeft: false });
		if (membershipsCount >= room.capacity) {
			throw new Error('room is full');
		}

		let membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId, userId });
		if (membership) {
			if (membership.hasLeft) {
				await this.chatRoomMembershipsRepository.update(membership.id, { hasLeft: false });
				membership.hasLeft = false;
			}
		} else {
			membership = {
				id: this.idService.gen(),
				roomId: roomId,
				userId: userId,
				bubbleColor: params?.bubbleColor ?? null,
				bubbleStyle: params?.bubbleStyle ?? null,
				user: null,
				room: null,
				isMuted: false,
				hasLeft: false,
			} satisfies Partial<MiChatRoomMembership>;

			// TODO: transaction
			await this.chatRoomMembershipsRepository.insertOne(membership!);
		}
		if (invitation) {
		  await this.chatRoomInvitationsRepository.delete(invitation.id);
		}

		const packedMembership = await this.chatEntityService.packRoomMembership(membership!, { id: userId }, { populateUser: true, populateRoom: false });
		this.globalEventService.publishChatRoomStream(roomId, 'join', { ...packedMembership, createdAt: this.idService.parse(packedMembership.id).date.toISOString() });
	}

	@bindThis
	public async ignoreRoomInvitation(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const invitation = await this.chatRoomInvitationsRepository.findOneByOrFail({ roomId, userId });
		await this.chatRoomInvitationsRepository.update(invitation.id, { ignored: true });
	}

	@bindThis
	public async leaveRoom(userId: MiUser['id'], roomId: MiChatRoom['id'], kicked: boolean) {
		const room = await this.chatRoomsRepository.findOneBy({ id: roomId, isArchived: false });
		if (room == null) {
			throw new IdentifiableError('d7ed9aeb-1b48-4769-bcef-081beb81c71f', 'no such room');
		}
		if (room.ownerId === userId) {
			throw new Error("room owner cannot leave the room");
		}

		const membership = await this.chatRoomMembershipsRepository.findOneByOrFail({ roomId, userId, hasLeft: false });
		await this.chatRoomMembershipsRepository.update(membership.id, { hasLeft: true });
		this.globalEventService.publishChatRoomStream(roomId, 'leave', { userId, kicked, createdAt: new Date().toISOString() } );

		// 未読フラグを消す (「既読にする」というわけでもないのでreadメソッドは使わないでおく)
		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.del(`newRoomChatMessageExists:${userId}:${roomId}`);
		redisPipeline.srem(`newChatMessagesExists:${userId}`, `room:${roomId}`);
		await redisPipeline.exec();
	}

	@bindThis
	public async muteRoom(userId: MiUser['id'], roomId: MiChatRoom['id'], mute: boolean) {
		const membership = await this.chatRoomMembershipsRepository.findOneByOrFail({ roomId, userId, hasLeft: false });
		await this.chatRoomMembershipsRepository.update(membership.id, { isMuted: mute });
	}

	@bindThis
	public async updateMembership(userId: MiUser['id'], roomId: MiChatRoom['id'], config: { bubbleColor?: string, bubbleStyle?: string }) {
		const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId, userId, hasLeft: false });
		if (membership == null) {
			throw new IdentifiableError('54c7c4f7-47e6-4088-9b29-69373cbab313', 'no such membership');
		}
		await this.chatRoomMembershipsRepository.update(membership.id, config);
		const packedMembership = await this.chatEntityService.packRoomMembership({ ...membership!, ...config }, { id: userId }, { populateUser: true, populateRoom: false });
		this.globalEventService.publishChatRoomStream(roomId, 'membershipUpdated', packedMembership);
	}

	@bindThis
	public updateRoom(room: MiChatRoom, params: {
		name?: string;
		description?: string;
		capacity?: number;
	}): Promise<MiChatRoom> {
		return this.chatRoomsRepository.createQueryBuilder().update()
			.set(params)
			.where('id = :id', { id: room.id })
			.andWhere('isArchived = :isArchived', { isArchived: false })
			.returning('*')
			.execute()
			.then((response) => {
				return response.raw[0];
			});
	}

	@bindThis
	public async getRoomMemberships(roomId: MiChatRoom['id'], includeLeftMembers?: boolean) {
		const query = this.chatRoomMembershipsRepository.createQueryBuilder('membership')
			.andWhere('membership.roomId = :roomId', { roomId });
		if (!includeLeftMembers) {
			query.andWhere('membership.hasLeft = FALSE');
		}

		const memberships = await query.getMany();

		return memberships;
	}

	@bindThis
	public async searchMessages(meId: MiUser['id'], query: string, limit: number, params: {
		userId?: MiUser['id'] | null;
		roomId?: MiChatRoom['id'] | null;
	}) {
		const q = this.chatMessagesRepository.createQueryBuilder('message');

		if (params.userId) {
			q.andWhere(new Brackets(qb => {
				qb
					.where(new Brackets(qb => {
						qb
							.where('message.fromUserId = :meId')
							.andWhere('message.toUserId = :otherId');
					}))
					.orWhere(new Brackets(qb => {
						qb
							.where('message.fromUserId = :otherId')
							.andWhere('message.toUserId = :meId');
					}));
			}))
				.setParameter('meId', meId)
				.setParameter('otherId', params.userId);
		} else if (params.roomId) {
			q.where('message.toRoomId = :roomId', { roomId: params.roomId });
		} else {
			const membershipsQuery = this.chatRoomMembershipsRepository.createQueryBuilder('membership')
				.select('membership.roomId')
				.where('membership.userId = :meId', { meId: meId });

			const ownedRoomsQuery = this.chatRoomsRepository.createQueryBuilder('room')
				.select('room.id')
				.where('room.ownerId = :meId', { meId });

			q.andWhere(new Brackets(qb => {
				qb
					.where('message.fromUserId = :meId')
					.orWhere('message.toUserId = :meId')
					.orWhere(`message.toRoomId IN (${membershipsQuery.getQuery()})`)
					.orWhere(`message.toRoomId IN (${ownedRoomsQuery.getQuery()})`);
			}));

			q.setParameters(membershipsQuery.getParameters());
			q.setParameters(ownedRoomsQuery.getParameters());
		}

		q.andWhere('LOWER(message.text) LIKE :q', { q: `%${ sqlLikeEscape(query.toLowerCase()) }%` });

		q.leftJoinAndSelect('message.file', 'file');
		q.leftJoinAndSelect('message.fromUser', 'fromUser');
		q.leftJoinAndSelect('message.toUser', 'toUser');
		q.leftJoinAndSelect('message.toRoom', 'toRoom');
		q.leftJoinAndSelect('toRoom.owner', 'toRoomOwner');

		const messages = await q.orderBy('message.id', 'DESC').take(limit).getMany();

		return messages;
	}

	@bindThis
	public async react(messageId: MiChatMessage['id'], userId: MiUser['id'], reaction_: string) {
		let reaction;

		const custom = reaction_.match(isCustomEmojiRegexp);

		if (custom == null) {
			reaction = normalizeEmojiString(reaction_);
		} else {
			const name = custom[1];
			const emoji = (await this.customEmojiService.localEmojisCache.fetch()).get(name);

			if (emoji == null) {
				throw new Error('no such emoji');
			} else {
				reaction = `:${name}:`;
			}
		}

		const message = await this.chatMessagesRepository.findOneByOrFail({ id: messageId });

		if (message.fromUserId === userId) {
			throw new Error('cannot react to own message');
		}

		if (message.toRoomId === null && message.toUserId !== userId) {
			throw new Error('cannot react to others message');
		}

		if (message.reactions.length >= MAX_REACTIONS_PER_MESSAGE) {
			throw new Error('too many reactions');
		}

		const room = message.toRoomId ? await this.chatRoomsRepository.findOneByOrFail({ id: message.toRoomId }) : null;

		if (room) {
			if (!await this.isRoomMember(room, userId)) {
				throw new Error('cannot react to others message');
			}
		}

		await this.chatMessagesRepository.createQueryBuilder().update()
			.set({
				reactions: () => `array_append("reactions", '${userId}/${reaction}')`,
			})
			.where('id = :id', { id: message.id })
			.execute();

		if (room) {
			this.globalEventService.publishChatRoomStream(room.id, 'react', {
				messageId: message.id,
				user: await this.userEntityService.pack(userId),
				reaction,
			});
		} else {
			this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId!, 'react', {
				messageId: message.id,
				reaction,
			});
			this.globalEventService.publishChatUserStream(message.toUserId!, message.fromUserId, 'react', {
				messageId: message.id,
				reaction,
			});
		}
	}

	@bindThis
	public async unreact(messageId: MiChatMessage['id'], userId: MiUser['id'], reaction_: string) {
		let reaction;

		const custom = reaction_.match(isCustomEmojiRegexp);

		if (custom == null) {
			reaction = normalizeEmojiString(reaction_);
		} else { // 削除されたカスタム絵文字のリアクションを削除したいかもしれないので絵文字の存在チェックはする必要なし
			const name = custom[1];
			reaction = `:${name}:`;
		}

		// NOTE: 自分のリアクションを(あれば)削除するだけなので諸々の権限チェックは必要なし

		const message = await this.chatMessagesRepository.findOneByOrFail({ id: messageId });

		const room = message.toRoomId ? await this.chatRoomsRepository.findOneByOrFail({ id: message.toRoomId }) : null;

		await this.chatMessagesRepository.createQueryBuilder().update()
			.set({
				reactions: () => `array_remove("reactions", '${userId}/${reaction}')`,
			})
			.where('id = :id', { id: message.id })
			.execute();

		// TODO: 実際に削除が行われたときのみイベントを発行する

		if (room) {
			this.globalEventService.publishChatRoomStream(room.id, 'unreact', {
				messageId: message.id,
				user: await this.userEntityService.pack(userId),
				reaction,
			});
		} else {
			this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId!, 'unreact', {
				messageId: message.id,
				reaction,
			});
			this.globalEventService.publishChatUserStream(message.toUserId!, message.fromUserId, 'unreact', {
				messageId: message.id,
				reaction,
			});
		}
	}

	@bindThis
	public async getMyMemberships(userId: MiUser['id'], limit: number, includeLeft?: boolean, sinceId?: MiChatRoomMembership['id'] | null, untilId?: MiChatRoomMembership['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomMembershipsRepository.createQueryBuilder('membership'), sinceId, untilId)
			.andWhere('membership.userId = :userId', { userId });
		if (!includeLeft) {
			query.andWhere('membership.hasLeft = FALSE');
		}

		const memberships = await query.take(limit).getMany();

		return memberships;
	}

	@bindThis
	public async getPublicRoomsWithPagination(userId: MiUser['id'], limit: number, includeArchived: boolean, sinceId?: MiChatRoom['id'] | null, untilId?: MiChatRoom['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomsRepository.createQueryBuilder('room'), sinceId, untilId)
			.andWhere('room.isPublic = TRUE');

		if (!includeArchived) {
			query.andWhere('room.isArchived = FALSE');
		}
		query.leftJoinAndSelect('room.memberships', 'membership', 'membership.hasLeft = FALSE');

		const rooms = await query.take(limit).getMany();

		return rooms;
	}
}

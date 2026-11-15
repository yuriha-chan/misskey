/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { id } from './util/id.js';
import { MiChatRoom, MiChatPollVote, MiChatMessage } from '@/models/_.js';

@Entity('chat_poll')
@Index('IDX_chat_poll_roomId', ['roomId'])
@Index('IDX_chat_poll_pollId', ['roomId', 'id'])
@Index('IDX_chat_poll_startedId', ['roomId', 'startedId'])
@Index('IDX_chat_poll_finishedId', ['roomId', 'finishedId'])
export class MiChatPoll {
	@PrimaryColumn({
		...id(),
		primaryKeyConstraintName: 'PK_chat_poll_id',
	})
	public id: MiChatMessage['id'];

	@Column(id())
	public roomId: MiChatRoom['id'];

	@ManyToOne(() => MiChatRoom, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'roomId', foreignKeyConstraintName: 'FK_chat_poll_roomId' })
	public room: MiChatRoom | null;

	@Column(id())
	public ownerId: MiChatRoom['id'];

	@Column('text', {
		nullable: true,
	})
	public title: string | null;

	@Column('varchar', {
		length: 256, array: true, default: '{}',
	})
	public choices: string[];

	@Column('boolean', {
		default: false,
	})
	public voteForUsers: boolean;

	@Column('boolean', {
		default: false,
	})
	public anonymous: boolean;
	@Column('timestamp with time zone', {
		nullable: true,
	})

	public startsAt: Date | null;

	@Column({ ...id(),
		nullable: true,
	})
	public startedId: MiChatMessage['id'] | null;

	@Column('integer', {
		nullable: true,
	})
	public duration: number | null;

	@Column({ ...id(),
		nullable: true,
	})
	public finishedId: MiChatMessage['id'] | null;

	@OneToMany(() => MiChatPollVote, (vote: MiChatPollVote) => vote.poll)
	public votes: MiChatPollVote[] | null;
}

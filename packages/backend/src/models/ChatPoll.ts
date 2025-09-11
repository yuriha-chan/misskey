/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiChatRoom, MiChatPollVote, MiUser } from '@/models/_.js';

@Entity('chat_poll')
export class MiChatPoll {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public expiresAt: Date | null;

	@Column('boolean')
	public anonymous: boolean;

	@Column(id())
	public ownerId: MiChatRoom['id'];

	@ManyToOne(() => MiUser)
	@JoinColumn({ name: 'ownerId' })
	public owner: MiUser;

	@Column('boolean', {
		default: false
	})
	public finished: boolean;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public finishedAt: Date | null;

	@Column(id())
	public roomId: MiChatRoom['id'];

	@ManyToOne(() => MiChatRoom)
	@JoinColumn({ name: 'roomId' })
	public room: MiChatRoom;

	@Column('varchar', {
		length: 256, array: true,
	})
	public title: string;

	@Column('varchar', {
		length: 256, array: true, default: '{}',
	})
	public choices: string[];

	@OneToMany(() => MiChatPollVote, (vote: MiChatPollVote) => vote.pollId)
	public votes: MiChatPollVote[];
}

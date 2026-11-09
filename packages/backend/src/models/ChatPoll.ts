/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiChatRoom, MiChatPollVote, MiUser, MiChatMessage } from '@/models/_.js';

@Entity('chat_poll')
export class MiChatPoll {
	@PrimaryColumn(id())
	public id: MiChatMessage['id'];

	@Column(id())
	public roomId: MiChatRoom['id'];

	@ManyToOne(() => MiChatRoom)
	@JoinColumn({ name: 'roomId' })
	public room: MiChatRoom | null;

	@Column(id())
	public ownerId: MiChatRoom['id'];

	@ManyToOne(() => MiUser)
	@JoinColumn({ name: 'ownerId' })
	public owner: MiUser | null;

	@Column('text')
	public title: string;

	@Column('varchar', {
		length: 256, array: true, default: '{}',
	})
	public choices: string[];

	@Column('boolean')
	public voteForUsers: boolean;

	@Column('boolean')
	public anonymous: boolean;
	@Column('timestamp with time zone', {
		nullable: true,
	})

	public startsAt: Date | null;

	@Column({...id(), 
		nullable: true,
	})
	public startedId: MiChatMessage['id'] | null;

	@Column('integer', {
		nullable: true,
	})
	public duration: number | null;

	@Column({...id(), 
		nullable: true,
	})
	public finishedId: MiChatMessage['id'] | null;

	@OneToMany(() => MiChatPollVote, (vote: MiChatPollVote) => vote.poll)
	public votes: MiChatPollVote[] | null;
}

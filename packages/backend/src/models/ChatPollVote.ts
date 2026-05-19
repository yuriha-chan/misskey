/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatPoll } from './ChatPoll.js';

@Entity('chat_poll_vote')
@Index(['userId', 'pollId', 'choice'], { unique: true })
export class MiChatPollVote {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(type => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Index()
	@Column(id())
	public pollId: MiChatPoll['id'];

	@ManyToOne(() => MiChatPoll, (poll: MiChatPoll) => poll.votes, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'pollId' })
	public poll: MiChatPoll;

	@Column('integer')
	public choice: number;
}

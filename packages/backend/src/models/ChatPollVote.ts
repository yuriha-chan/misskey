/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatPoll } from './ChatPoll.js';

@Entity('chat_poll_vote')
@Index('IDX_chat_poll_vote_pollId', ['pollId'])
@Index('IDX_chat_poll_vote_user_poll_choice', ['pollId', 'choice', 'userId'], { unique: true })
export class MiChatPollVote {
	@PrimaryColumn({
		...id(),
		primaryKeyConstraintName: 'PK_chat_poll_vote_id',
	})
	public id: string;

	@Column(id())
	public userId: MiUser['id'];

	@Column(id())
	public pollId: MiChatPoll['id'];

	@ManyToOne(() => MiChatPoll, (poll: MiChatPoll) => poll.votes, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'pollId', foreignKeyConstraintName: 'FK_chat_poll_vote_pollId' })
	public poll: MiChatPoll;

	@Column('integer')
	public choice: number;
}

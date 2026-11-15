/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatMessage } from './ChatMessage.js';
import { MiChatRoom } from './ChatRoom.js';

@Entity('chat_secret')
@Index('IDX_secret_roomId', ['roomId'])
@Index('IDX_secret_secretId', ['roomId', 'id'])
@Index('IDX_secret_revealedId', ['roomId', 'revealedId'])
export class MiChatSecret {
	@PrimaryColumn({
		...id(),
		primaryKeyConstraintName: 'PK_chat_secret_id',
	})
	public id: MiChatMessage['id'];

	@Column(id())
	public roomId: MiChatRoom['id'];

	@ManyToOne(() => MiChatRoom, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'roomId', foreignKeyConstraintName: 'FK_chat_secret_roomId' })
	public room: MiChatRoom | null;

	@Column(id())
	public userId: MiUser['id'];

	@Column('text')
	public title: string;

	@Column('text')
	public plaintext: string;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public revealsAt: Date | null;

	@Column({ ...id(),
		nullable: true,
	})
	public revealedId: MiChatMessage['id'] | null;
}

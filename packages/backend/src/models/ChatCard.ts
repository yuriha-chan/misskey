/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatRoom } from './ChatRoom.js';

@Entity('chat_card')
export class MiChatCard {
	@PrimaryColumn({
		...id(),
		primaryKeyConstraintName: 'PK_chat_card_id',
	})
	public deliverId: string;

	@PrimaryColumn('smallint', {
		primaryKeyConstraintName: 'PK_chat_card_id',
	})
	public cardId: number;

	@Column(id())
	public userId: MiUser['id'];

	@Column(id())
	public roomId: MiChatRoom['id'];

	@ManyToOne(() => MiChatRoom, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'roomId', foreignKeyConstraintName: 'FK_chat_card_roomId' })
	public room: MiChatRoom | null;

	@Column("varchar")
	public cardKind: string;

	@Column({...id(), 
		nullable: true,
	})
	public revealedId: string | null;
}

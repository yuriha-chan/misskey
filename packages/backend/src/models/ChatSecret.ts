import { PrimaryColumn, Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatRoom } from './ChatRoom.js';

@Entity('chat_secret')
export class MiChatSecret {
	@PrimaryColumn(id())
	public id: string;

	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser)
	@JoinColumn({ name: 'id' })
	public user: MiUser;

	@Column(id())
	public roomId: MiChatRoom['id']

	@ManyToOne(() => MiChatRoom)
	@JoinColumn({ name: 'roomId' })
	public room: MiChatRoom;

	@Column('text')
	public plaintext: string;

	@Column('timestamp', {
		nullable: true,
	})
	public revealAt: Date | null;

	@Column('boolean', {
		default: false
	})
	public revealed: boolean;
}

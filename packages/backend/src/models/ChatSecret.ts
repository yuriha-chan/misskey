import { PrimaryColumn, Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatMessage } from './ChatMessage.js';
import { MiChatRoom } from './ChatRoom.js';

@Entity('chat_secret')
export class MiChatSecret {
	@PrimaryColumn(id())
	public id: MiChatMessage['id'];

	@Column(id())
	public roomId: MiChatRoom['id']

	@ManyToOne(() => MiChatRoom)
	@JoinColumn({ name: 'roomId' })
	public room: MiChatRoom | null;

	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser)
	@JoinColumn({ name: 'userId' })
	public user: MiUser | null;

	@Column('text')
	public title: string;

	@Column('text')
	public plaintext: string;

	@Column('timestamp', {
		nullable: true,
	})
	public revealsAt: Date | null;

	@Column({...id(), 
		nullable: true,
	})
	public revealedId: MiChatMessage['id'] | null;
}

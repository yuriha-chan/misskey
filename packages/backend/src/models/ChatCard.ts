import { PrimaryColumn, Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatRoom } from './ChatRoom.js';

@Entity('chat_card')
export class MiChatCard {
	@PrimaryColumn(id())
	public deliverId: string;

	@PrimaryColumn('smallint')
	public cardId: number;

	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser)
	@JoinColumn({ name: 'userId' })
	public user: MiUser | null;

	@Column(id())
	public roomId: MiChatRoom['id'];

	@ManyToOne(() => MiChatRoom)
	@JoinColumn({ name: 'roomId' })
	public room: MiChatRoom | null;

	@Column("varchar")
	public cardKind: string;

	@Column({...id(), 
		nullable: true,
	})
	public revealedId: string | null;
}

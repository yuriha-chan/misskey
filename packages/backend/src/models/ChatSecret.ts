import { PrimaryColumn, Entity, Column, OneToOne, JoinColumn, Index } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('chat_secret')
export class MiChatSecret {
	@PrimaryColumn(id())
	public id: string;

	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser)
	@JoinColumn({ name: 'id' })
	public user: MiUser;

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

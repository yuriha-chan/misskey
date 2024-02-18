/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiInstanceRole } from './Role.js';
import { MiInstance } from './Instance.js';

@Entity('role_assignment')
@Index(['instanceId', 'roleId'], { unique: true })
export class MiInstanceRoleAssignment {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
		comment: 'The instance ID.',
	})
	public instanceId: MiInstance['id'];

	@ManyToOne(type => MiInstance, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiInstance | null;

	@Index()
	@Column({
		...id(),
		comment: 'The role ID.',
	})
	public roleId: MiInstanceRole['id'];

	@ManyToOne(type => MiInstanceRole, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public role: MiInstanceRole | null;

	@Index()
	@Column('timestamp with time zone', {
		nullable: true,
	})
	public expiresAt: Date | null;
}

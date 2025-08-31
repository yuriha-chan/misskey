/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Column } from 'typeorm';
import { id } from './util/id.js';

@Entity('chatPoll')
export class MiChatPoll {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public expiresAt: Date | null;

	@Column('integer')
	public multiple: number;

	@Column('varchar', {
		length: 256, array: true, default: '{}',
	})
	public choices: string[];

	@Column('integer', {
		array: true,
	})
	public votes: number[];
}

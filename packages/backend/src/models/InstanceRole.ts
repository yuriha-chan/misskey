/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Column, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';

type CondFormulaValueAnd = {
	type: 'and';
	values: InstanceRoleCondFormulaValue[];
};

type CondFormulaValueOr = {
	type: 'or';
	values: InstanceRoleCondFormulaValue[];
};

type CondFormulaValueNot = {
	type: 'not';
	value: InstanceRoleCondFormulaValue;
};

type CondFormulaValueCreatedLessThan = {
	type: 'createdLessThan';
	sec: number;
};

type CondFormulaValueCreatedMoreThan = {
	type: 'createdMoreThan';
	sec: number;
};

type CondFormulaValueFollowersLessThanOrEq = {
	type: 'followersLessThanOrEq';
	value: number;
};

type CondFormulaValueFollowersMoreThanOrEq = {
	type: 'followersMoreThanOrEq';
	value: number;
};

type CondFormulaValueFollowingLessThanOrEq = {
	type: 'followingLessThanOrEq';
	value: number;
};

type CondFormulaValueFollowingMoreThanOrEq = {
	type: 'followingMoreThanOrEq';
	value: number;
};

type CondFormulaValueNotesLessThanOrEq = {
	type: 'notesLessThanOrEq';
	value: number;
};

type CondFormulaValueNotesMoreThanOrEq = {
	type: 'notesMoreThanOrEq';
	value: number;
};

export type InstanceRoleCondFormulaValue = { id: string } & (
	CondFormulaValueAnd |
	CondFormulaValueOr |
	CondFormulaValueNot |
	CondFormulaValueCreatedLessThan |
	CondFormulaValueCreatedMoreThan |
	CondFormulaValueFollowersLessThanOrEq |
	CondFormulaValueFollowersMoreThanOrEq |
	CondFormulaValueFollowingLessThanOrEq |
	CondFormulaValueFollowingMoreThanOrEq |
	CondFormulaValueNotesLessThanOrEq |
	CondFormulaValueNotesMoreThanOrEq
);

@Entity('instanceRole')
export class MiInstanceRole {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone', {
		comment: 'The updated date of the Role.',
	})
	public updatedAt: Date;

	@Column('timestamp with time zone', {
		comment: 'The last used date of the Role.',
	})
	public lastUsedAt: Date;

	@Column('varchar', {
		length: 256,
	})
	public name: string;

	@Column('varchar', {
		length: 1024,
	})
	public description: string;

	@Column('varchar', {
		length: 256, nullable: true,
	})
	public color: string | null;

	@Column('varchar', {
		length: 512, nullable: true,
	})
	public iconUrl: string | null;

	@Column('enum', {
		enum: ['manual', 'conditional'],
		default: 'manual',
	})
	public target: 'manual' | 'conditional';

	@Column('jsonb', {
		default: { },
	})
	public condFormula: InstanceRoleCondFormulaValue;

	@Column('boolean', {
		default: false,
	})
	public canEditMembersByModerator: boolean;

	// UIに表示する際の並び順用(大きいほど先頭)
	@Column('integer', {
		default: 0,
	})
	public displayOrder: number;

	@Column('jsonb', {
		default: { },
	})
	public policies: Record<string, {
		useDefault: boolean;
		priority: number;
		value: any;
	}>;
}

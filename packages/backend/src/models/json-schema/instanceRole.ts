/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedInstanceRoleCondFormulaLogicsSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string', optional: false,
		},
		type: {
			type: 'string',
			nullable: false, optional: false,
			enum: ['and', 'or'],
		},
		values: {
			type: 'array',
			nullable: false, optional: false,
			items: {
				ref: 'InstanceRoleCondFormulaValue',
			},
		},
	},
} as const;

export const packedInstanceRoleCondFormulaValueNot = {
	type: 'object',
	properties: {
		id: {
			type: 'string', optional: false,
		},
		type: {
			type: 'string',
			nullable: false, optional: false,
			enum: ['not'],
		},
		value: {
			type: 'object',
			optional: false,
			ref: 'InstanceRoleCondFormulaValue',
		},
	},
} as const;

export const packedInstanceRoleCondFormulaValueCreatedSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string', optional: false,
		},
		type: {
			type: 'string',
			nullable: false, optional: false,
			enum: [
				'createdLessThan',
				'createdMoreThan',
			],
		},
		sec: {
			type: 'number',
			nullable: false, optional: false,
		},
	},
} as const;

export const packedInstanceRoleCondFormulaFollowersOrFollowingOrNotesSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string', optional: false,
		},
		type: {
			type: 'string',
			nullable: false, optional: false,
			enum: [
				'followersLessThanOrEq',
				'followersMoreThanOrEq',
				'followingLessThanOrEq',
				'followingMoreThanOrEq',
				'notesLessThanOrEq',
				'notesMoreThanOrEq',
			],
		},
		value: {
			type: 'number',
			nullable: false, optional: false,
		},
	},
} as const;

export const packedInstanceRoleCondFormulaValueSchema = {
	type: 'object',
	oneOf: [
		{
			ref: 'InstanceRoleCondFormulaLogics',
		},
		{
			ref: 'InstanceRoleCondFormulaValueNot',
		},
		{
			ref: 'InstanceRoleCondFormulaValueCreated',
		},
		{
			ref: 'InstanceRoleCondFormulaFollowersOrFollowingOrNotes',
		},
	],
} as const;

export const packedInstanceInstanceRolePoliciesSchema = {
	type: 'object',
	optional: false, nullable: false,
	properties: {
	},
} as const;

export const packedInstanceRoleLiteSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		name: {
			type: 'string',
			optional: false, nullable: false,
			example: 'New Role',
		},
		color: {
			type: 'string',
			optional: false, nullable: true,
			example: '#000000',
		},
		iconUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		description: {
			type: 'string',
			optional: false, nullable: false,
		},
		displayOrder: {
			type: 'integer',
			optional: false, nullable: false,
			example: 0,
		},
	},
} as const;

export const packedInstanceRoleSchema = {
	type: 'object',
	allOf: [
		{
			type: 'object',
			ref: 'InstanceRoleLite',
		},
		{
			type: 'object',
			properties: {
				createdAt: {
					type: 'string',
					optional: false, nullable: false,
					format: 'date-time',
				},
				updatedAt: {
					type: 'string',
					optional: false, nullable: false,
					format: 'date-time',
				},
				target: {
					type: 'string',
					optional: false, nullable: false,
					enum: ['manual', 'conditional'],
				},
				condFormula: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'InstanceRoleCondFormulaValue',
				},
				canEditMembersByModerator: {
					type: 'boolean',
					optional: false, nullable: false,
					example: false,
				},
				policies: {
					type: 'object',
					optional: false, nullable: false,
					additionalProperties: {
						anyOf: [{
							type: 'object',
							properties: {
								value: {
									oneOf: [
										{
											type: 'integer',
										},
										{
											type: 'boolean',
										},
									],
								},
								priority: {
									type: 'integer',
								},
								useDefault: {
									type: 'boolean',
								},
							},
						}],
					},
				},
				instancesCount: {
					type: 'integer',
					optional: false, nullable: false,
				},
			},
		},
	],
} as const;

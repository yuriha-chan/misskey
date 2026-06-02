export const packedChatPollScheduledSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		title: {
			type: 'string',
			nullable: true, optional: false,
			example: 'Hidden object',
		},
		fromUserId: {
			type: 'string',
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		roomId: {
			type: 'string',
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		createdAt: {
			type: 'string',
			format: 'date-time',
		},
		startsAt: {
			type: 'string',
			nullable: true, optional: true,
			format: 'date-time',
		},
	},
	required: ['id', 'fromUserId', 'roomId', 'createdAt']
} as const;

export const packedChatPollStartedSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		title: {
			type: 'string',
			nullable: true, optional: false,
			example: 'Hidden object',
		},
		voteForUsers: {
			type: 'boolean',
		},
		userChoices: {
			type: 'array',
			nullable: true, optional: true,
			items: {
				type: 'object',
				nullable: false, optional: false,
				ref: 'UserLite',
			}
		},
		textChoices: {
			type: 'array',
			nullable: true, optional: true,
			items: {
				type: 'string',
				nullable: false, optional: false,
				example: 'Apple',
			}
		},
		fromUserId: {
			type: 'string',
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		roomId: {
			type: 'string',
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		createdAt: {
			type: 'string',
			format: 'date-time',
		},
		finishesAt: {
			type: 'string',
			nullable: true, optional: true,
			format: 'date-time',
		},
	},
	required: ['id', 'voteForUsers', 'fromUserId', 'roomId', 'createdAt']
} as const;

export const packedChatPollFinishedSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		title: {
			type: 'string',
			nullable: true, optional: true,
			example: 'Hidden object',
		},
		voteForUsers: {
			type: 'boolean',
		},
		anonymous: {
			type: 'boolean',
		},
		votes: {
			type: 'array',
			items: {
				type: 'object',
				nullable: false, optional: false,
				properties: {
					user: {
						type: 'object',
						ref: 'UserLite',
						nullable: true, optional: true,
					},
					text: {
						type: 'string',
						nullable: true, optional: true,
					},
					voteCount: {
						type: 'number',
						nullable: false, optional: false,
					},
					votedUserIds: {
						type: 'array',
						nullable: true, optional: true,
						items: {
							type: 'string',
							nullable: false, optional: false,
							format: 'id',
							example: 'xxxxxxxxxx',
						},
					},
				},
			},
		},
		fromUserId: {
			type: 'string',
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		roomId: {
			type: 'string',
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		createdAt: {
			type: 'string',
			format: 'date-time',
		},
	},
	required: ['id', 'voteForUsers', 'fromUserId', 'roomId', 'createdAt', 'votes', 'anonymous']
} as const;

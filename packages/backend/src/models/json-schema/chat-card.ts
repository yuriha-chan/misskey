export const packedChatCardSchema = {
	type: 'object',
	properties: {
		deliverId: {
			type: 'string',
			nullable: false, optional: false,
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		cardId: {
			type: 'number',
			nullable: false, optional: false,
			example: 2,
		},
		cardKind: {
			type: 'string',
			nullable: false, optional: false,
			example: 'Ace of spades',
		},
		roomId: {
			type: 'string',
			nullable: false, optional: false,
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		createdAt: {
			type: 'string',
			nullable: false, optional: false,
			format: 'date-time',
		},
	}
} as const;

export const packedChatCardRevealedSchema = {
	type: 'object',
	properties: {
		deliverId: {
			type: 'string',
			nullable: false, optional: false,
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		cardId: {
			type: 'number',
			nullable: false, optional: false,
			example: 2,
		},
		cardKind: {
			type: 'string',
			nullable: false, optional: false,
			example: 'Ace of spades',
		},
		roomId: {
			type: 'string',
			nullable: false, optional: false,
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		createdAt: {
			type: 'string',
			nullable: false, optional: false,
			format: 'date-time',
		},
		fromUserId: {
			type: 'string',
			nullable: false, optional: false,
			format: 'date-time',
		},
	}
} as const;

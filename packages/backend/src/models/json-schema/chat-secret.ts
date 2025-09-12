export const packedChatSecretSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			nullable: false, optional: false,
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
			nullable: false, optional: false,
			format: 'id',
			example: 'xxxxxxxxxx',
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
		revealsAt: {
			type: 'string',
			nullable: true, optional: true,
			format: 'date-time',
		},
	}
} as const;

export const packedChatSecretRevealedSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			nullable: false, optional: false,
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		title: {
			type: 'string',
			nullable: true, optional: false,
			example: 'Hidden theme',
		},
		fromUserId: {
			type: 'string',
			nullable: false, optional: false,
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		roomId: {
			type: 'string',
			nullable: false, optional: false,
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		plaintext: {
			type: 'string',
			nullable: false, optional: false,
			format: 'id',
			example: 'The hidden object is a ball',
		},
		createdAt: {
			type: 'string',
			nullable: false, optional: false,
			format: 'date-time',
		},
	}
} as const;

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedChatEventSchema = {
	"oneOf": [
		{
			type: 'object',
			properties: {
				type: {
					type: "string",
					const: "message",
				},
				data: {
					type: "object",
					ref: "ChatMessageLiteForRoom",
				},
			},
			required: ["type", "data"],
		},
		{
			type: 'object',
			properties: {
				type: {
					type: "string",
					const: "pollScheduled",
				},
				data: {
					type: "object",
					ref: "ChatPollScheduled",
				},
			},
			required: ["type", "data"],
		},
		{
			type: 'object',
			properties: {
				type: {
					type: "string",
					const: "pollStarted",
				},
				data: {
					type: "object",
					ref: "ChatPollStarted",
				},
			},
			required: ["type", "data"],
		},
		{
			type: 'object',
			properties: {
				type: {
					type: "string",
					const: "pollFinished",
				},
				data: {
					type: "object",
					ref: "ChatPollFinished",
				},
			},
			required: ["type", "data"],
		},
		{
			type: 'object',
			properties: {
				type: {
					type: "string",
					const: "cardDelivered",
				},
				data: {
					type: "object",
					ref: "ChatCard",
				},
			},
			required: ["type", "data"],
		},
		{
			type: 'object',
			properties: {
				type: {
					type: "string",
					const: "cardRevealed",
				},
				data: {
					type: "object",
					ref: "ChatCardRevealed",
				},
			},
			required: ["type", "data"],
		},
		{
			type: 'object',
			properties: {
				type: {
					type: "string",
					const: "secretCommitted",
				},
				data: {
					type: "object",
					ref: "ChatSecret",
				},
			},
			required: ["type", "data"],
		},
		{
			type: 'object',
			properties: {
				type: {
					type: "string",
					const: "secretRevealed",
				},
				data: {
					type: "object",
					ref: "ChatSecretRevealed",
				},
			},
			required: ["type", "data"],
		},
	]
} as const;

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { RevealChatSecretJobData } from '../types.js';
import { ChatService } from '@/core/ChatService.js';

@Injectable()
export class RevealChatSecretProcessorService {
	private logger: Logger;

	constructor(
		private chatService: ChatService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('reveal-chat-secret');
	}

	@bindThis
	public async process(job: Bull.Job<RevealChatSecretJobData>): Promise<void> {
		const { id } = job.data;
		this.logger.info(`Processing job for revealing secret in message: ${id}`);

		try {
			await this.chatService.revealSecret(id);
			this.logger.info(`Successfully revealed secret for message: ${id}`);
		} catch (error) {
			this.logger.error(`Failed to process job for message: ${id}`);
			throw error;
		}
	}
}

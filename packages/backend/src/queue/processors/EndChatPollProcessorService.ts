/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { EndChatPollJobData } from '../types.js';
import { ChatService } from '@/core/ChatService.js';

@Injectable()
export class EndChatPollProcessorService {
	private logger: Logger;

	constructor(
		private chatService: ChatService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('end-chat-poll');
	}

	@bindThis
	public async process(job: Bull.Job<EndChatPollJobData>): Promise<void> {
		const { pollId } = job.data;
		this.logger.info(`Processing job for ending poll: ${pollId}`);

		try {
			await this.chatService.closePoll(pollId);
			this.logger.info(`Successfully ended poll: ${pollId}`);
		} catch (error) {
			this.logger.error(`Failed to process job for poll: ${pollId}`);
			throw error;
		}
	}
}

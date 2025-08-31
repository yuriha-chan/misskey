/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { ChatRoomsRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { CloseExpiredChatRoomJobData } from '../types.js';
import { ChatService } from '@/core/ChatService.js';

@Injectable()
export class CloseExpiredChatRoomProcessorService {
	private logger: Logger;

	constructor(
		private chatService: ChatService,

		@Inject(DI.chatRoomsRepository) private roomRepository: ChatRoomsRepository,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('close-expired-chat-room');
	}

	@bindThis
	public async process(job: Bull.Job<CloseExpiredChatRoomJobData>): Promise<void> {
		const roomId = job.data.id;
		this.logger.info(`Processing job for expired chat room: ${roomId}`);

		try {
			const room = await this.roomRepository.findOneBy({ id: roomId });

			if (room == null) {
				this.logger.warn(`Chat room not found, skipping job: ${roomId}`);
				return;
			}
			if (room.isArchived) {
				this.logger.info(`Chat room is already archived, skipping job: ${roomId}`);
				return;
			}

			await this.chatService.closeRoom(roomId);
			this.logger.info(`Successfully closed expired chat room: ${roomId}`);

		} catch (error) {
			this.logger.error(`Failed to process job for expired chat room: ${roomId}`, error);
			throw error;
		}
	}
}

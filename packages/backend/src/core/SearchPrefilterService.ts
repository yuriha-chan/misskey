/*
 * SPDX-FileCopyrightText: yuriha
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import * as net from 'node:net';
import { type Config } from '@/config.js';

@Injectable()
export class SearchPrefilterService {
	private readonly host: string;
	private readonly port: number;
	private readonly timeout: number = 5000; // 5 seconds

	constructor(
		@Inject(DI.config)
		private config: Config
	) {
		this.host = this.config.prefilter?.host ?? 'search';
		this.port = this.config.prefilter?.port ?? 8080;
	}

	filter(q: string, since?: string, until?: string, limit: number = 20): Promise<string[]> {
		return new Promise((resolve, reject) => {
			let command: string;
			if (since && until) {
				command = `q d ${limit} ${since}-${until} ${q}\n`;
			} else if (since) {
				command = `q a ${limit} ${since}- ${q}\n`;
			} else if (until) {
				command = `q d ${limit} -${until} ${q}\n`;
			} else {
				command = `q d ${limit} - ${q}\n`;
			}

			const socket = new net.Socket();
			let responseData = '';

			socket.setTimeout(this.timeout);

			socket.on('connect', () => {
				socket.write(command);
			});

			socket.on('data', (chunk) => {
				responseData += chunk.toString();
				// 改行でレスポンス完了とみなす
				if (responseData.includes('\n')) {
					socket.end();
				}
			});

			socket.on('end', () => {
				const trimmed = responseData.trim();
				if (trimmed.startsWith('Ok ')) {
					const ids = trimmed.slice(3).split(/\s+/).filter(id => id.length > 0);
					resolve(ids);
				} else {
					reject(new Error(`SearchPrefilterService: unexpected response - ${trimmed}`));
				}
			});

			socket.on('error', (err) => {
				reject(new Error(`SearchPrefilterService connection error: ${err.message}`));
			});

			socket.on('timeout', () => {
				socket.destroy();
				reject(new Error('SearchPrefilterService timeout'));
			});

			socket.connect(this.port, this.host);
		});
	}
}

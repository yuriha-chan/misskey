/*
 * SPDX-FileCopyrightText: yuriha
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
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

	normalize(input: string): string {
		// 簡易的な $[ ... ] サニタイズ (入れ子には対応していない)
		let output = input.replace(/\$\[([^\[\]]*)\]/g, (match, inner: string) => {
			const trimmed = inner.trim();
			if (trimmed.length === 0) {
				return "";
			}
			// Split into tokens by whitespace
			const tokens = trimmed.split(/\s+/);
			if (tokens.length === 0) {
				return "";
			}
			// First token contains command and optional attributes (e.g., "position.x=2,y=3")
			const first = tokens[0];
			let command: string;
			const dotPos = first.indexOf('.');
			if (dotPos !== -1) {
				command = first.slice(0, dotPos);
			} else {
				command = first;
			}
			const textTokens = tokens.slice(1);
			switch (command) {
				case "ruby":
					return textTokens.length > 0 ? textTokens[0] : "";
				default:
					return textTokens.join(" ");
			}
		});
		// remove tags (e.g. <center>)
		output = output.replace(/<\/?[a-zA-Z][^>]*>/g, "");
		// remove url
		output = output.replace(/https?:\/\/\S+/g, "");
		// remove shortcodes
		output = output.replace(/:[a-zA-Z_][a-zA-Z0-9_]*:/g, "");
		// collapse spaces
		output = output.split(/\s+/).filter(part => part.length > 0).join(" ");
		return output;
	}

	async index(id: string, text: string) {
		const socket = new net.Socket();
		socket.setTimeout(this.timeout);
		const connect = () => new Promise((res, rej) => {
			socket.on('connect', () => { res(); });
			socket.on('error', (err) => {
				rej(new Error(`SearchPrefilterService connection error: ${err.message}`));
			});
			socket.on('timeout', () => {
				socket.destroy();
				rej(new Error('SearchPrefilterService socket timeout on connect'));
			});
			socket.connect(this.port, this.host);
		});
		const post = (command) => new Promise((res, rej) => {
			let responseData = '';
			socket.once('data', (chunk) => {
				responseData += chunk.toString();
				if (responseData.includes('\n')) {
					res(responseData);
				}
			});
			socket.on('error', (err) => {
				rej(new Error(`SearchPrefilterService connection error: ${err.message}`));
			});
			socket.on('timeout', () => {
				socket.destroy();
				rej(new Error('SearchPrefilterService timeout'));
			});
			socket.on('end', () => {
				rej(new Error('SearchPrefilterService unexpected socket close'));
			});
			socket.write(command);
		});
		await connect();

		for (const line of text.split("\n")) {
			const normalized = this.normalize(line);
			if (normalized.length === 0) {
				continue;
			}
			const command = `i ${id} ${normalized}\n`;
			await post(command);
		}
		socket.end();
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

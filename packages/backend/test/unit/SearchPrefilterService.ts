/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createServer } from 'node:net';
import { describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { SearchPrefilterService } from '@/core/SearchPrefilterService.js';

async function queryResponse(response: string) {
	const server = createServer(socket => {
		socket.once('data', () => socket.end(response));
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});

	try {
		const address = server.address();
		if (address == null || typeof address === 'string') throw new Error('Missing TCP server address');
		const service = new SearchPrefilterService({
			...loadConfig(),
			prefilter: { host: '127.0.0.1', port: address.port },
		});
		return await service.filter('probe');
	} finally {
		await new Promise<void>((resolve, reject) => {
			server.close(error => error ? reject(error) : resolve());
		});
	}
}

describe('SearchPrefilterService query responses', () => {
	test('accepts an empty successful response', async () => {
		await expect(queryResponse('Ok \n')).resolves.toEqual([]);
	});

	test('retains candidate IDs from a nonempty successful response', async () => {
		await expect(queryResponse('Ok 2 1\n')).resolves.toEqual(['2', '1']);
	});

	test('rejects an unsuccessful response', async () => {
		await expect(queryResponse('Er\n')).rejects.toThrow('SearchPrefilterService: unexpected response - Er');
	});
});

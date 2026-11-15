/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Fastify, { type FastifyInstance } from 'fastify';
import rawBody from 'fastify-raw-body';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { genEd25519KeyPair, genRsaKeyPair, genRFC3230DigestHeader, verifyDraftSignature } from '@misskey-dev/node-http-message-signatures';
import { ActivityPubServerService } from '@/server/ActivityPubServerService.js';
import { createSignedPost } from '@/core/activitypub/ApRequestService.js';
import { QueueService } from '@/core/QueueService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';

const host = 'local.example';
const actor = 'https://remote.example/users/alice';
const activity = { id: 'https://remote.example/activities/1', type: 'Create', actor, object: { type: 'Note', content: 'hello' } };
const servers: FastifyInstance[] = [];
let rsa: Awaited<ReturnType<typeof genRsaKeyPair>>;
let ed25519: Awaited<ReturnType<typeof genEd25519KeyPair>>;

beforeAll(async () => {
	[rsa, ed25519] = await Promise.all([genRsaKeyPair(), genEd25519KeyPair()]);
});

afterEach(async () => {
	await Promise.all(servers.splice(0).map(server => server.close()));
});

async function createServer() {
	const queue = mock<QueueService>();
	const logger = mock<Logger>();
	logger.createSubLogger.mockReturnValue(logger);
	const loggerService = mock<LoggerService>();
	loggerService.getLogger.mockReturnValue(logger);
	const service = new ActivityPubServerService(
		{ host } as never,
		{ federation: 'all' } as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		queue,
		{} as never,
		{} as never,
		{} as never,
		loggerService,
	);
	const server = Fastify();
	servers.push(server);
	await server.register(rawBody, { global: false, encoding: false, runFirst: true });
	await server.register(service.createServer);
	await server.ready();
	return { server, queue };
}

async function headersFor(body: string, mode: '00' | '01' | 'ld', path: string) {
	if (mode === 'ld') {
		return { host, 'content-type': 'application/activity+json', digest: await genRFC3230DigestHeader(body, 'SHA-256') };
	}
	const pair = mode === '00' ? rsa : ed25519;
	const signed = await createSignedPost({
		level: mode,
		key: { keyId: `${actor}#key`, privateKeyPem: pair.privateKey },
		url: `https://${host}${path}`,
		body,
		additionalHeaders: {},
	});
	return Object.fromEntries(Object.entries(signed.request.headers).map(([key, value]) => [key.toLowerCase(), value]));
}

describe.each(['/inbox', '/users/local-user/inbox'])('ActivityPub inbox %s', (path) => {
	test.each(['00', '01'] as const)('enqueues a draft signature verifiable with the level %s key', async (mode) => {
		const { server, queue } = await createServer();
		const body = JSON.stringify(activity);
		const response = await server.inject({ method: 'POST', url: path, headers: await headersFor(body, mode, path), payload: body });
		expect(response.statusCode).toBe(202);
		expect(queue.inbox).toHaveBeenCalledTimes(1);
		const [queued, signature] = queue.inbox.mock.calls[0];
		expect(queued).toEqual(activity);
		expect(signature?.version).toBe('draft');
		if (signature == null || Array.isArray(signature.value)) throw new Error('Expected a draft signature');
		expect(await verifyDraftSignature(signature.value, mode === '00' ? rsa.publicKey : ed25519.publicKey)).toBe(true);
	});

	test.each(['00', 'ld'] as const)('rejects missing and null actors before enqueue for %s', async (mode) => {
		const { server, queue } = await createServer();
		for (const actorValue of [undefined, null]) {
			const body = JSON.stringify({ ...activity, actor: actorValue, signature: { type: 'RsaSignature2017', creator: `${actor}#key` } });
			const response = await server.inject({ method: 'POST', url: path, headers: await headersFor(body, mode, path), payload: body });
			expect(response.statusCode).toBe(400);
		}
		expect(queue.inbox).not.toHaveBeenCalled();
	});

	test('enqueues LD-only activity with a null HTTP signature for later authentication', async () => {
		const { server, queue } = await createServer();
		const body = JSON.stringify({ ...activity, signature: { type: 'RsaSignature2017', creator: `${actor}#key` } });
		const response = await server.inject({ method: 'POST', url: path, headers: await headersFor(body, 'ld', path), payload: body });
		expect(response.statusCode).toBe(202);
		expect(queue.inbox).toHaveBeenCalledExactlyOnceWith(JSON.parse(body), null);
	});

	test.each(['00', 'ld'] as const)('rejects a mismatched Host for %s', async (mode) => {
		const { server, queue } = await createServer();
		const body = JSON.stringify({ ...activity, signature: { type: 'RsaSignature2017', creator: `${actor}#key` } });
		const headers = { ...await headersFor(body, mode, path), host: 'wrong.example' };
		const response = await server.inject({ method: 'POST', url: path, headers, payload: body });
		expect(response.statusCode).toBe(401);
		expect(queue.inbox).not.toHaveBeenCalled();
	});

	test('rejects a body differing from its signed digest', async () => {
		const { server, queue } = await createServer();
		const body = JSON.stringify(activity);
		const response = await server.inject({ method: 'POST', url: path, headers: await headersFor(body, '00', path), payload: JSON.stringify({ ...activity, object: 'tampered' }) });
		expect(response.statusCode).toBe(401);
		expect(queue.inbox).not.toHaveBeenCalled();
	});

	test('rejects activity without HTTP or LD signature', async () => {
		const { server, queue } = await createServer();
		const body = JSON.stringify(activity);
		const response = await server.inject({ method: 'POST', url: path, headers: await headersFor(body, 'ld', path), payload: body });
		expect(response.statusCode).toBe(401);
		expect(queue.inbox).not.toHaveBeenCalled();
	});
});

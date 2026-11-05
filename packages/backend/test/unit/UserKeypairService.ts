/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { afterEach, describe, test } from 'vitest';
import { genEd25519KeyPair, parseRequestSignature, verifyDraftSignature, type PrivateKey } from '@misskey-dev/node-http-message-signatures';
import { mock } from 'vitest-mock-extended';
import type { Redis } from 'ioredis';
import { UserKeypairService } from '@/core/UserKeypairService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { createSignedPost } from '@/core/activitypub/ApRequestService.js';
import type { UserKeypairsRepository } from '@/models/_.js';
import type { MiUserKeypair } from '@/models/UserKeypair.js';

const userId = '000000000000000001';
const actor = `https://example.com/users/${userId}`;
const services: UserKeypairService[] = [];

afterEach(() => {
	for (const service of services.splice(0)) {
		service.dispose();
		service['privateKeyObjectCache'].dispose();
	}
});

function makeService(record: MiUserKeypair) {
	const redisValues = new Map<string, string>();
	const redis = mock<Redis>();
	redis.get.mockImplementation(async (key) => redisValues.get(String(key)) ?? null);
	redis.set.mockImplementation(async (key, value) => {
		redisValues.set(String(key), String(value));
		return 'OK';
	});
	const repository = mock<UserKeypairsRepository>();
	repository.findOneByOrFail.mockResolvedValue(record);
	const events = mock<GlobalEventService>();
	const userEntity = mock<UserEntityService>();
	userEntity.genLocalUserUri.mockReturnValue(actor);
	const service = new UserKeypairService(redis, redis, repository, events, userEntity);
	services.push(service);
	return { service, redisValues, repository, events };
}

async function recordWithKeys() {
	const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
	const ed = await genEd25519KeyPair();
	return {
		rsa,
		ed,
		record: {
			userId,
			publicKey: rsa.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
			privateKey: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
			ed25519PublicKey: ed.publicKey,
			ed25519PrivateKey: ed.privateKey,
		} as MiUserKeypair,
	};
}

async function verifyKey(key: PrivateKey, publicKey: string) {
	const signed = await createSignedPost({ level: '00', key, url: 'https://remote.example/inbox', body: '{}', additionalHeaders: {} });
	const parsed = parseRequestSignature(signed.request);
	assert.equal(parsed.version, 'draft');
	assert.ok(!Array.isArray(parsed.value));
	assert.equal(await verifyDraftSignature(parsed.value, publicKey), true);
}

describe('UserKeypairService', () => {
	test('converts legacy PKCS#1 private keys to PKCS#8 and preserves Ed25519 fields', async () => {
		const { record, rsa } = await recordWithKeys();
		const legacy = { ...record, privateKey: rsa.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString() };
		const { service, repository } = makeService(legacy);
		const fetched = await service.fetcher(userId);
		assert.match(fetched.privateKey, /BEGIN PRIVATE KEY/);
		assert.deepStrictEqual(crypto.createPublicKey(fetched.privateKey).export({ type: 'spki', format: 'pem' }), rsa.publicKey.export({ type: 'spki', format: 'pem' }));
		assert.equal(fetched.ed25519PublicKey, record.ed25519PublicKey);
		assert.equal(fetched.ed25519PrivateKey, record.ed25519PrivateKey);
		assert.deepStrictEqual(repository.update.mock.calls[0], [userId, { privateKey: fetched.privateKey }]);
	});

	test('uses the v2 Redis namespace', async () => {
		const { record } = await recordWithKeys();
		const { service, redisValues } = makeService(record);
		await service.getUserKeypair(userId);
		assert.ok(redisValues.has(`kvcache:userKeypair:v2:${userId}`));
		assert.ok(!redisValues.has(`kvcache:userKeypair:${userId}`));
	});

	test('selects preferred PEM and falls back to RSA', async () => {
		const { record } = await recordWithKeys();
		const { service } = makeService(record);
		for (const type of ['01', '11', 'ed25519']) {
			assert.deepStrictEqual(await service.getLocalUserPrivateKeyPem(record, type), { keyId: `${actor}#ed25519-key`, privateKeyPem: record.ed25519PrivateKey });
		}
		for (const type of ['00', 'anything', undefined]) {
			assert.deepStrictEqual(await service.getLocalUserPrivateKeyPem(record, type), { keyId: `${actor}#main-key`, privateKeyPem: record.privateKey });
		}
		const withoutEd = { ...record, ed25519PublicKey: null, ed25519PrivateKey: null } as MiUserKeypair;
		assert.equal((await service.getLocalUserPrivateKeyPem(withoutEd, 'ed25519')).keyId, `${actor}#main-key`);
	});

	test('imports usable cached keys and honors explicit PEM overrides', async () => {
		const { record } = await recordWithKeys();
		const { service } = makeService(record);
		for (const [type, publicKey] of [['00', record.publicKey], ['ed25519', record.ed25519PublicKey!]] as const) {
			const key = await service.getLocalUserPrivateKey(record, type);
			await verifyKey(key, publicKey);
			const cached = await service.getLocalUserPrivateKey(record, type);
			assert.ok('privateKey' in key);
			assert.ok('privateKey' in cached);
			assert.equal(cached.privateKey, key.privateKey);
		}
		const override = { keyId: `${actor}#override`, privateKeyPem: record.ed25519PrivateKey! };
		const overridden = await service.getLocalUserPrivateKey(override, '00');
		assert.equal(overridden.keyId, override.keyId);
		await verifyKey(overridden, record.ed25519PublicKey!);
	});

	test('creates, persists and prepares a missing Ed25519 keypair, but leaves existing keys unchanged', async () => {
		const { record } = await recordWithKeys();
		const missing = { ...record, ed25519PublicKey: null, ed25519PrivateKey: null } as MiUserKeypair;
		const { service, repository, events } = makeService(missing);
		const prepared = await service.refreshAndPrepareEd25519KeyPair(userId);
		assert.ok(prepared?.ed25519PrivateKey);
		assert.ok(prepared?.ed25519PublicKey);
		assert.equal(repository.update.mock.calls.length, 1);
		assert.deepStrictEqual(repository.update.mock.calls[0], [{ userId }, { ed25519PublicKey: prepared!.ed25519PublicKey, ed25519PrivateKey: prepared!.ed25519PrivateKey }]);
		assert.equal(events.publishInternalEvent.mock.calls.length, 1);
		assert.deepStrictEqual(events.publishInternalEvent.mock.calls[0], ['userKeypairUpdated', { userId }]);
		const imported = await service.getLocalUserPrivateKey(userId, 'ed25519');
		assert.equal(imported.keyId, `${actor}#ed25519-key`);
		await verifyKey(imported, prepared.ed25519PublicKey!);

		const existing = makeService(record);
		assert.equal(await existing.service.refreshAndPrepareEd25519KeyPair(userId), undefined);
		assert.equal(existing.repository.update.mock.calls.length, 0);
		assert.equal(existing.events.publishInternalEvent.mock.calls.length, 0);
	});
});

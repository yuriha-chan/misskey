/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { verifyDraftSignature } from '@misskey-dev/node-http-message-signatures';
import type * as Bull from 'bullmq';
import { InboxProcessorService } from '@/queue/processors/InboxProcessorService.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import { ApInboxService } from '@/core/activitypub/ApInboxService.js';
import { JsonLdService } from '@/core/activitypub/JsonLdService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { QueueLoggerService } from '@/queue/QueueLoggerService.js';
import type { MiRemoteUser } from '@/models/User.js';
import type { MiUserPublickey } from '@/models/UserPublickey.js';
import type { InboxJobData } from '@/queue/types.js';
import type Logger from '@/logger.js';

vi.mock('@misskey-dev/node-http-message-signatures', async (importOriginal) => ({
	...await importOriginal<typeof import('@misskey-dev/node-http-message-signatures')>(),
	verifyDraftSignature: vi.fn(),
}));

const actorUri = 'https://remote.example/users/alice';
const keyId = `${actorUri}#main-key`;

function createProcessor(isSuspended: boolean, isRemoteSuspended = false) {
	const actor = { id: 'alice', uri: actorUri, host: 'remote.example', isSuspended, isRemoteSuspended } as MiRemoteUser;
	const resolver = mock<ApDbResolverService>();
	resolver.getUserFromApId.mockResolvedValue(actor);
	resolver.getAuthUserFromApId.mockResolvedValue({ user: actor, key: { keyPem: 'public-key' } as MiUserPublickey });
	const inbox = mock<ApInboxService>();
	inbox.performActivity.mockResolvedValue('ok');
	const jsonLd = mock<JsonLdService>();
	const utility = mock<UtilityService>();
	utility.toPuny.mockImplementation(value => value);
	utility.isFederationAllowedHost.mockReturnValue(true);
	utility.extractDbHost.mockReturnValue('remote.example');
	const instances = mock<FederatedInstanceService>();
	instances.fetch.mockResolvedValue(null);
	const logger = mock<Logger>();
	logger.createSubLogger.mockReturnValue(logger);
	const queueLogger = mock<QueueLoggerService>();
	queueLogger.logger = logger;
	const processor = new InboxProcessorService(
		{ enableStatsForFederatedInstances: false } as never,
		utility,
		inbox,
		instances,
		{} as never,
		jsonLd,
		{} as never,
		resolver,
		{} as never,
		{ inbox: vi.fn() } as never,
		{ inbox: vi.fn() } as never,
		queueLogger,
	);
	return { processor, resolver, inbox, jsonLd };
}

function createJob(type: string, object: unknown, httpSignature = true) {
	return {
		data: {
			activity: {
				id: 'https://remote.example/activities/1',
				type,
				actor: actorUri,
				object,
				signature: { type: 'RsaSignature2017', creator: keyId },
			},
			signature: httpSignature ? { version: 'draft', value: { keyId } } : null,
		},
	} as Bull.Job<InboxJobData>;
}

beforeEach(() => {
	vi.mocked(verifyDraftSignature).mockReset();
	vi.mocked(verifyDraftSignature).mockResolvedValue(true);
});

describe('InboxProcessorService local suspension', () => {
	test.each(['Create', 'Announce', 'Update', 'Follow', 'Accept', 'Reject', 'Undo', 'Like'])('discards %s before resolving keys or verifying signatures', async (type) => {
		const { processor, resolver, inbox, jsonLd } = createProcessor(true);
		expect(await processor.process(createJob(type, { id: actorUri, type: 'Person' }))).toBe('actor has been suspended');
		expect(resolver.getUserFromApId).toHaveBeenCalledWith(actorUri);
		expect(resolver.getAuthUserFromApId).not.toHaveBeenCalled();
		expect(verifyDraftSignature).not.toHaveBeenCalled();
		expect(jsonLd.use).not.toHaveBeenCalled();
		expect(inbox.performActivity).not.toHaveBeenCalled();
	});

	test('discards LD-only activities before LD-signature processing', async () => {
		const { processor, resolver, jsonLd } = createProcessor(true);
		expect(await processor.process(createJob('Create', { type: 'Note' }, false))).toBe('actor has been suspended');
		expect(resolver.getAuthUserFromApId).not.toHaveBeenCalled();
		expect(jsonLd.use).not.toHaveBeenCalled();
	});

	test.each([
		'https://remote.example/notes/1',
		{ id: 'https://remote.example/users/bob', type: 'Person' },
	])('discards deletion of something other than the actor: %j', async (object) => {
		const { processor, inbox } = createProcessor(true);
		expect(await processor.process(createJob('Delete', object))).toBe('actor has been suspended');
		expect(verifyDraftSignature).not.toHaveBeenCalled();
		expect(inbox.performActivity).not.toHaveBeenCalled();
	});

	test.each([
		actorUri,
		{ id: actorUri, type: 'Person' },
		{ id: actorUri, type: 'Tombstone', formerType: 'Person' },
	])('verifies an account deletion request: %j', async (object) => {
		const { processor, inbox } = createProcessor(true);
		expect(await processor.process(createJob('Delete', object))).toBe('ok');
		expect(verifyDraftSignature).toHaveBeenCalledTimes(1);
		expect(inbox.performActivity).toHaveBeenCalledTimes(1);
	});

	test('does not let an unsigned account deletion request bypass authentication', async () => {
		const { processor, inbox } = createProcessor(true);
		const job = createJob('Delete', actorUri, false);
		delete job.data.activity.signature;
		await expect(processor.process(job)).rejects.toThrow('no valid LD-Signature found');
		expect(inbox.performActivity).not.toHaveBeenCalled();
	});

	test('rejects an account deletion request with an invalid HTTP signature and no LD signature', async () => {
		const { processor, inbox } = createProcessor(true);
		vi.mocked(verifyDraftSignature).mockResolvedValue(false);
		const job = createJob('Delete', actorUri);
		delete job.data.activity.signature;
		await expect(processor.process(job)).rejects.toThrow('no valid LD-Signature found');
		expect(verifyDraftSignature).toHaveBeenCalledTimes(1);
		expect(inbox.performActivity).not.toHaveBeenCalled();
	});

	test.each([false, true])('preserves verification when only remote suspension is %s', async (isRemoteSuspended) => {
		const { processor, inbox } = createProcessor(false, isRemoteSuspended);
		expect(await processor.process(createJob('Create', { type: 'Note' }))).toBe('ok');
		expect(verifyDraftSignature).toHaveBeenCalledTimes(1);
		expect(inbox.performActivity).toHaveBeenCalledTimes(1);
	});

	test('preserves verification for an unknown actor', async () => {
		const { processor, resolver, inbox } = createProcessor(false);
		resolver.getUserFromApId.mockResolvedValue(null);
		expect(await processor.process(createJob('Create', { type: 'Note' }))).toBe('ok');
		expect(verifyDraftSignature).toHaveBeenCalledTimes(1);
		expect(inbox.performActivity).toHaveBeenCalledTimes(1);
	});
});

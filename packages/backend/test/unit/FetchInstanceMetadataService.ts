process.env.NODE_ENV = 'test';

import { jest } from '@jest/globals';
import { ModuleMocker } from 'jest-mock';
import { Test } from '@nestjs/testing';
import { GlobalModule } from '@/GlobalModule.js';
import { FetchInstanceMetadataService } from '@/core/RelayService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { CreateSystemUserService } from '@/core/CreateSystemUserService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { QueueService } from '@/core/QueueService.js';
import { IdService } from '@/core/IdService.js';
import type { RelaysRepository } from '@/models/index.js';
import { DI } from '@/di-symbols.js';
import type { TestingModule } from '@nestjs/testing';
import type { MockFunctionMetadata } from 'jest-mock';
import type { Reis } from 'ioredis'

const mockRedis = {
	hash: {},
	set:
		jest.fn((key, value) => {
			const ret = hash[key];
			this.hash[key] = value;
			return ret;
		}),
};

describe('FetchInstanceMetadataService', () => {
	let app: TestingModule;
	let fetchInstanceMetadataService: FetchInstanceMetadataService;
	let federatedInstanceService: FederatedInstanceService;
	let httpRequestService: HttpRequestService;
	let redisClient: Redis.Redis;

	beforeAll(async () => {
		app = await Test
			.createTestingModule({
				imports: [
					GlobalModule,
				],
				providers: [
					FetchInstanceMetadataService,
					{	
						provide: HttpRequestService,
						useMocker: () => { getJSON: jest.fn(); getHtml: jest.fn(); send: jest.fn(); },
					},
					LoggerService,
					{	
						provide: FederatedInstanceService,
						useMocker: () => { fetch: jest.fn() },
					},
					{
						provide: DI.redis,
						useClass: Redis.Redis,
						useMocker: () => mockRedis,
					},
				],
			})
			.compile();

		app.enableShutdownHooks();

		fetchInstanceMetadataService = app.get<FetchInstanceMetadataService>(FetchInstanceMetadataService);
		federatedInstanceService = app.get<FederatedInstanceService>(FederatedInstanceService);
		redisClient = app.get<Redis.Redis>(DI.redis);
		httpRequestService: app.get<HttpRequestService>(HttpRequestService);
	});

	afterAll(async () => {
		await app.close();
	});

	test('Lock successed and need update', async () => {
		const now = Date.now();
		federatedInstanceService.fetch.mock.mockReturnValue({ infoUpdatedAt: { getTime(): () => now - 10 * 1000 * 60 * 60 * 24 } });
		fetchInstanceMetadata.try_lock = jest.fn(fetchInstanceMetadata.try_lock);
		fetchInstanceMetadata.unlock = jest.fn(fetchInstanceMetadata.unlock);
		httpRequestService.getJSON.mock.mockImplementation = ({ throw Error(); })
		await fetchInstanceMetadataService.fetchInstanceMetadata({ host: "example.com" });
		expect(fetchInstanceMetadataService.try_lock.mock.calls.length).toBe(1);
		expect(fetchInstanceMetadataService.unlock.mock.calls.length).toBe(1);
		expect(federatedInstanceService.fetch.mock.calls.length).toBe(1);
		expect(httpRequestService.getJSON.mock.calls.length).toBeGreaterThan(0);
	});
	test('Lock successed and don't need update', async () => {
		federatedInstanceService.fetch.mock.mockReturnValue({ infoUpdatedAt: { getTime(): () => now - 10 * 1000 * 60 * 60 * 24 } });
		fetchInstanceMetadata.try_lock = jest.fn(fetchInstanceMetadata.try_lock);
		fetchInstanceMetadata.unlock = jest.fn(fetchInstanceMetadata.unlock);
		const now = Date.now();
		federatedInstanceService.fetch.mock.mockReturnValue({ infoUpdatedAt: { getTime(): () => now } });
		await fetchInstanceMetadataService.fetchInstanceMetadata({ host: "example.com" });
		expect(fetchInstanceMetadataService.try_lock.mock.calls.length).toBe(1);
		expect(fetchInstanceMetadataService.unlock.mock.calls.length).toBe(1);
		expect(federatedInstanceService.fetch.mock.calls.length).toBe(1);
		expect(httpRequestService.getJSON.mock.calls.length).toBe(0);
	});
	test('Lock failed', async () => {
		fetchInstanceMetadata.try_lock("example.com");
		fetchInstanceMetadata.try_lock = jest.fn(fetchInstanceMetadata.try_lock);
		fetchInstanceMetadata.unlock = jest.fn(fetchInstanceMetadata.unlock);
		await fetchInstanceMetadataService.fetchInstanceMetadata({ host: "example.com" });
		expect(fetchInstanceMetadataService.try_lock.mock.calls.length).toBe(1);
		expect(fetchInstanceMetadataService.unlock.mock.calls.length).toBe(0);
		expect(federatedInstanceService.fetch.mock.calls.length).toBe(0);
		expect(httpRequestService.getJSON.mock.calls.length).toBe(0);
	});
});

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SummalyResult } from '@misskey-dev/summaly';
import type { Config } from '@/config.js';
import { LoggerService } from '@/core/LoggerService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { loadConfig } from '@/config.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { UrlPreviewService } from '@/server/web/UrlPreviewService.js';
import type { MiMeta } from '@/models/Meta.js';

describe('UrlPreviewService', () => {
	beforeEach(() => vi.stubGlobal('_SUMMALY_VERSION_', 'test'));
	afterEach(() => vi.unstubAllGlobals());

	const sourceUrl = 'https://example.org/';
	const result = {
		url: sourceUrl,
		title: 'Example',
		player: { url: null },
		sensitive: false,
	} as unknown as SummalyResult;

	function createService(filters: string[], summary = result) {
		const config = { ...loadConfig(), url: 'https://misskey.example', mediaProxy: 'https://proxy.example' } as Config;
		const meta = {
			urlPreviewEnabled: true,
			urlPreviewSummaryProxyUrl: 'https://summary.example',
			urlPreviewSensitiveList: filters,
		} as MiMeta;
		const logger = { info: vi.fn(), succ: vi.fn(), warn: vi.fn(), error: vi.fn() };
		const loggerService = { getLogger: vi.fn(() => logger) } as unknown as LoggerService;
		const httpRequestService = { getJson: vi.fn().mockResolvedValue(summary) } as unknown as HttpRequestService;
		const utilityService = new UtilityService(config, meta, loggerService);
		const service = new UrlPreviewService(config, meta, httpRequestService, utilityService, loggerService);
		const reply = { code: vi.fn(), header: vi.fn() };
		const handle = (url: string) => service.handle({ query: { url } } as never, reply as never);
		return { service, meta, httpRequestService, reply, handle };
	}

	test('quoted URL literal matches and marks the preview sensitive', async () => {
		const { service, handle } = createService(['"https://example.org/"']);
		try {
			expect((await handle(sourceUrl) as SummalyResult).sensitive).toBe(true);
		} finally {
			service.dispose();
		}
	});

	test('nonmatching URL remains nonsensitive', async () => {
		const { service, handle } = createService(['"https://other.example/"']);
		try {
			expect((await handle(sourceUrl) as SummalyResult).sensitive).toBe(false);
		} finally {
			service.dispose();
		}
	});

	test.each([
		['matching URL', sourceUrl, true],
		['excluded URL', 'https://example.org/safe', false],
	])('boolean DSL applies to %s', async (_label, url, expected) => {
		const { service, handle } = createService(['(and "https://example.org/" (not "safe"))'], { ...result, url });
		try {
			expect((await handle(url) as SummalyResult).sensitive).toBe(expected);
		} finally {
			service.dispose();
		}
	});

	test('upstream sensitive flag remains true when configured filters do not match', async () => {
		const { service, handle } = createService(['"https://other.example/"'], { ...result, sensitive: true });
		try {
			expect((await handle(sourceUrl) as SummalyResult).sensitive).toBe(true);
		} finally {
			service.dispose();
		}
	});

	test('cached raw summary is reevaluated against the current filter list', async () => {
		const { service, meta, httpRequestService, handle } = createService(['"https://example.org/"']);
		try {
			expect((await handle(sourceUrl) as SummalyResult).sensitive).toBe(true);
			meta.urlPreviewSensitiveList = ['"https://other.example/"'];
			expect((await handle(sourceUrl) as SummalyResult).sensitive).toBe(false);
			expect(httpRequestService.getJson).toHaveBeenCalledTimes(1);
		} finally {
			service.dispose();
		}
	});
});

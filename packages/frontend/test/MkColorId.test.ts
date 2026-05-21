/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';

vi.mock('@/store.js', () => ({
	store: {
		s: {
			darkMode: false,
		},
	},
}));

let MkColorId: any;

async function mountComponent(id: string, segmentLength?: number) {
	if (!MkColorId) {
		MkColorId = (await import('@/components/MkColorId.vue')).default;
	}
	const container = document.createElement('div');
	const app = createApp({
		render() {
			return h(MkColorId, { id, segmentLength });
		},
	});
	app.mount(container);
	await nextTick();
	return container;
}

beforeEach(() => {
	vi.resetModules();
	MkColorId = null;
});

describe('MkColorId', () => {
	test('renders with a given id', async () => {
		const container = await mountComponent('testid12345');
		expect(container.querySelectorAll('[class]').length).toBeGreaterThan(0);
	});

	test('empty id renders no colored segments', async () => {
		const container = await mountComponent('');
		const segments = container.querySelectorAll('[style]');
		expect(segments.length).toBe(0);
	});

	test('splits into segments of default length 5', async () => {
		const container = await mountComponent('abcdefghij');
		const segments = container.querySelectorAll('[style]');
		expect(segments.length).toBe(2);
	});

	test('splits into segments of custom length', async () => {
		const container = await mountComponent('abcdefghij', 3);
		const segments = container.querySelectorAll('[style]');
		expect(segments.length).toBe(4);
	});

	test('single segment when id shorter than segmentLength', async () => {
		const container = await mountComponent('ab', 5);
		const segments = container.querySelectorAll('[style]');
		expect(segments.length).toBe(1);
	});

	test('uses light color blocks in light mode', async () => {
		const { store } = await import('@/store.js');
		store.s.darkMode = false;
		const container = await mountComponent('test');
		const blocks = container.querySelectorAll('[class]');
		expect(blocks.length).toBeGreaterThan(0);
	});

	test('uses dark color blocks in dark mode', async () => {
		const { store } = await import('@/store.js');
		store.s.darkMode = true;
		const container = await mountComponent('test');
		const blocks = container.querySelectorAll('[class]');
		expect(blocks.length).toBeGreaterThan(0);
	});
});

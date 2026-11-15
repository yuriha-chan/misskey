/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';

let MkCountdown: any;

async function mountComponent(to: number) {
	if (!MkCountdown) {
		MkCountdown = (await import('@/components/MkCountdown.vue')).default;
	}
	const container = document.createElement('div');
	const app = createApp({
		render() {
			return h(MkCountdown, { to });
		},
	});
	app.mount(container);
	await nextTick();
	return container;
}

beforeEach(() => {
	vi.resetModules();
	MkCountdown = null;
	vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
	vi.useRealTimers();
});

function getFormatted(container: HTMLElement): string {
	return container.querySelector('span')?.textContent ?? '';
}

describe('MkCountdown', () => {
	test('displays 00:00 when target is in the past', async () => {
		const container = await mountComponent(Date.now() - 10000);
		expect(getFormatted(container)).toBe('00:00');
	});

	test('displays 00:00 when target is now', async () => {
		const container = await mountComponent(Date.now());
		expect(getFormatted(container)).toBe('00:00');
	});

	test('displays seconds only for < 1 minute', async () => {
		const container = await mountComponent(Date.now() + 45000);
		expect(getFormatted(container)).toBe('00:45');
	});

	test('displays minutes and seconds for >= 1 minute', async () => {
		const container = await mountComponent(Date.now() + 125000);
		expect(getFormatted(container)).toBe('02:05');
	});

	test('displays hours for >= 1 hour', async () => {
		const container = await mountComponent(Date.now() + 3661000);
		expect(getFormatted(container)).toBe('01:01:01');
	});

	test('pads numbers with leading zeros', async () => {
		const container = await mountComponent(Date.now() + 61000);
		expect(getFormatted(container)).toBe('01:01');
	});

	test('stops at 00:00 after time passes', async () => {
		const container = await mountComponent(Date.now() + 5000);
		expect(getFormatted(container)).toBe('00:05');

		vi.advanceTimersByTime(6000);
		await nextTick();
		expect(getFormatted(container)).toBe('00:00');
	});
});

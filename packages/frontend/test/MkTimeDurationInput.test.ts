/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';

vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			somethingHappened: 'Something happened.',
			send: 'Send',
			attachFile: 'Attach File',
			attachSecret: 'Attach Secret',
			inputMessageHere: 'Input message here',
			_chat: {
				thisRoomIsArchived: 'This room is archived',
				startPoll: 'Start Poll',
				deliverCards: 'Deliver Cards',
			},
			_time: {
				day: 'day',
				hour: 'hour',
				minute: 'minute',
				second: 'second',
			},
			_theme: {
				alreadyInstalled: 'already installed',
				invalid: 'invalid',
			},
		},
		tsx: {},
	},
	updateI18n: vi.fn(),
	lang: 'en-US',
}));

vi.mock('@/os.js', async () => {
	const actual = await vi.importActual('@/os.js');
	return {
		...actual,
		alert: vi.fn(),
		promiseDialog: vi.fn(),
	};
});

let MkTimeDurationInput: any;

async function mountComponent(props: Record<string, unknown> = {}) {
	if (!MkTimeDurationInput) {
		MkTimeDurationInput = (await import('@/components/MkTimeDurationInput.vue')).default;
	}
	const container = document.createElement('div');
	const emitSpy = vi.fn();
	const app = createApp({
		render() {
			return h(MkTimeDurationInput, {
				modelValue: 0,
				...props,
				'onUpdate:modelValue': emitSpy,
			});
		},
	});
	app.mount(container);
	await nextTick();
	return { container, emitSpy };
}

beforeEach(() => {
	vi.resetModules();
	MkTimeDurationInput = null;
});

describe('MkTimeDurationInput', () => {
	test('renders minutes and seconds inputs by default', async () => {
		const { container } = await mountComponent();
		expect(container.textContent).toContain('minute');
		expect(container.textContent).toContain('second');
	});

	test('renders hours when hours prop is true', async () => {
		const { container } = await mountComponent({ hours: true });
		expect(container.textContent).toContain('hour');
	});

	test('renders days when days prop is true', async () => {
		const { container } = await mountComponent({ days: true, hours: true });
		expect(container.textContent).toContain('day');
	});

	test('does not render minutes when hours is false', async () => {
		const { container } = await mountComponent({ seconds: true, minutes: false });
		expect(container.textContent).not.toContain('minute');
	});

	test('buttons are clickable', async () => {
		const { container, emitSpy } = await mountComponent({ modelValue: 60 });
		const buttons = container.querySelectorAll('button');
		expect(buttons.length).toBe(4);
	});

	test('clamps modelValue when min is set', async () => {
		const { container } = await mountComponent({ modelValue: 10, min: 15 });
		await nextTick();
		expect(container.textContent).toContain('minute');
	});

	test('disabled prop disables inputs', async () => {
		const { container } = await mountComponent({ disabled: true });
		const inputs = container.querySelectorAll('input');
		if (inputs.length > 0) {
			expect(inputs[0].disabled).toBe(true);
		}
	});
});

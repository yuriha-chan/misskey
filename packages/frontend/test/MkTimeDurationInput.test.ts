/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';

vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			_time: {
				day: 'day',
				hour: 'hour',
				minute: 'minute',
				second: 'second',
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

function findButton(container: HTMLElement, iconSelector: string): HTMLButtonElement | null {
	const buttons = container.querySelectorAll('button');
	for (const button of buttons) {
		if (button.querySelector(iconSelector)) return button as HTMLButtonElement;
	}
	return null;
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

	test('decrement buttons decrease and large-step decreases more than small-step', async () => {
		const { container, emitSpy } = await mountComponent({ modelValue: 60 });

		emitSpy.mockClear();
		findButton(container, '.ti-chevron-left')!.click();
		await nextTick();
		const smallDec = emitSpy.mock.calls[0][0] as number;

		emitSpy.mockClear();
		findButton(container, '.ti-chevrons-left')!.click();
		await nextTick();
		const largeDec = emitSpy.mock.calls[0][0] as number;

		expect(smallDec).toBeLessThan(60);
		expect(largeDec).toBeLessThan(60);
		expect(60 - largeDec).toBeGreaterThan(60 - smallDec);
	});

	test('increment buttons increase and large-step increases more than small-step', async () => {
		const { container, emitSpy } = await mountComponent({ modelValue: 60 });

		emitSpy.mockClear();
		findButton(container, '.ti-chevron-right')!.click();
		await nextTick();
		const smallInc = emitSpy.mock.calls[0][0] as number;

		emitSpy.mockClear();
		findButton(container, '.ti-chevrons-right')!.click();
		await nextTick();
		const largeInc = emitSpy.mock.calls[0][0] as number;

		expect(smallInc).toBeGreaterThan(60);
		expect(largeInc).toBeGreaterThan(60);
		expect(largeInc - 60).toBeGreaterThan(smallInc - 60);
	});

	test('decrement clamps modelValue to min', async () => {
		const { container, emitSpy } = await mountComponent({ modelValue: 10, min: 15 });
		await nextTick();

		findButton(container, '.ti-chevrons-left')!.click();
		await nextTick();
		expect(emitSpy).toHaveBeenCalledWith(15);
	});

	test('disabled prop disables inputs', async () => {
		const { container } = await mountComponent({ disabled: true });
		const inputs = container.querySelectorAll('input');
		expect(inputs.length).toBeGreaterThan(0);
		expect(inputs[0].disabled).toBe(true);
	});
});

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, assert, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/vue';
import type { RenderResult } from '@testing-library/vue';
import * as Misskey from 'misskey-js';
import './init';
import { preferState } from './init';

const commitSpy = vi.fn();

describe('MkR18ConsentDialog', () => {
	afterEach(() => {
		cleanup();
		commitSpy.mockClear();
		preferState.hideR18Content = true;
	});

	const renderDialog = async () => {
		const [mod, preferMod] = await Promise.all([
			import('@/components/MkR18ConsentDialog.vue'),
			import('@/preferences.js'),
		]);
		preferMod.prefer.commit = commitSpy;
		return render(mod.default, {
			global: {
				stubs: {
					MkModalWindow: {
						template: '<div data-testid="modal"><slot name="header"/><slot/></div>',
						emits: ['close', 'closed'],
					},
					MkRadios: {
						template: `
							<div data-testid="radios">
								<button
									v-for="opt in options"
									:key="opt.value"
									:data-testid="'radio-' + opt.value"
									@click="$emit('update:modelValue', opt.value)"
								>{{ opt.label }}</button>
							</div>
						`,
						props: ['modelValue', 'options'],
						emits: ['update:modelValue'],
					},
					MkSwitch: {
						template: `
							<label data-testid="r18-toggle">
								<input
									type="checkbox"
									:checked="modelValue"
									@change="$emit('update:modelValue', !modelValue)"
								/>
								<slot/>
							</label>
						`,
						props: ['modelValue'],
						emits: ['update:modelValue'],
					},
					MkButton: {
						template: '<button data-testid="save-btn" :disabled="disabled" @click="$emit(\'click\')"><slot/></button>',
						props: ['primary', 'rounded', 'gradate', 'disabled'],
						emits: ['click'],
					},
					MkInfo: {
						template: '<div data-testid="info"><slot/></div>',
					},
				},
			},
		});
	};

	test('save button is disabled when age is not selected', async () => {
		const screen = await renderDialog();
		const saveBtn = screen.getByTestId('save-btn');
		assert.ok(saveBtn.hasAttribute('disabled') || (saveBtn as HTMLButtonElement).disabled,
			'save button should be disabled initially');
	});

	test('selecting under 17 hides R18 toggle and enables save', async () => {
		const screen = await renderDialog();
		const under17 = screen.getByTestId('radio-false');
		await fireEvent.click(under17);
		const toggle = screen.queryByTestId('r18-toggle');
		assert.ok(!toggle, 'R18 toggle should not appear when under 17');
		const saveBtn = screen.getByTestId('save-btn');
		assert.ok(!saveBtn.hasAttribute('disabled'), 'save button should be enabled');
	});

	test('selecting over 18 shows R18 toggle and enables save', async () => {
		const screen = await renderDialog();
		const over18 = screen.getByTestId('radio-true');
		await fireEvent.click(over18);
		const toggle = screen.getByTestId('r18-toggle');
		assert.ok(toggle, 'R18 toggle should appear when over 18');
		const saveBtn = screen.getByTestId('save-btn');
		assert.ok(!saveBtn.hasAttribute('disabled'), 'save button should be enabled');
	});

	test('clicking save when under 17 commits hideR18Content=true', async () => {
		commitSpy.mockClear();
		const screen = await renderDialog();
		assert.strictEqual(commitSpy.mock.calls.length, 0, 'no commit before save');
		const under17 = screen.getByTestId('radio-false');
		await fireEvent.click(under17);
		assert.strictEqual(commitSpy.mock.calls.length, 0, 'no commit before save');
		const saveBtn = screen.getByTestId('save-btn');
		await fireEvent.click(saveBtn);
		assert.strictEqual(commitSpy.mock.calls.length, 1);
		assert.strictEqual(commitSpy.mock.calls[0][0], 'hideR18Content');
		assert.strictEqual(commitSpy.mock.calls[0][1], true);
	});

	test('clicking save when over 18 commits selected toggle value', async () => {
		commitSpy.mockClear();
		const screen = await renderDialog();
		assert.strictEqual(commitSpy.mock.calls.length, 0, 'no commit before save');
		const over18 = screen.getByTestId('radio-true');
		await fireEvent.click(over18);
		assert.strictEqual(commitSpy.mock.calls.length, 0, 'no commit before save');
		const saveBtn = screen.getByTestId('save-btn');
		await fireEvent.click(saveBtn);
		assert.strictEqual(commitSpy.mock.calls.length, 1);
		assert.strictEqual(commitSpy.mock.calls[0][0], 'hideR18Content');
		assert.strictEqual(commitSpy.mock.calls[0][1], true);
	});

	test('clicking save when over 18 with toggle toggled commits toggled value', async () => {
		commitSpy.mockClear();
		const screen = await renderDialog();
		assert.strictEqual(commitSpy.mock.calls.length, 0, 'no commit before save');
		const over18 = screen.getByTestId('radio-true');
		await fireEvent.click(over18);
		assert.strictEqual(commitSpy.mock.calls.length, 0, 'no commit before save');
		const toggle = screen.getByTestId('r18-toggle').querySelector('input')!;
		await fireEvent.click(toggle);
		const saveBtn = screen.getByTestId('save-btn');
		await fireEvent.click(saveBtn);
		assert.strictEqual(commitSpy.mock.calls.length, 1);
		assert.strictEqual(commitSpy.mock.calls[0][0], 'hideR18Content');
		assert.strictEqual(commitSpy.mock.calls[0][1], false);
	});

	test('R18 toggle is checked when hideR18Content is true', async () => {
		const screen = await renderDialog();
		const over18 = screen.getByTestId('radio-true');
		await fireEvent.click(over18);
		const toggleInput = screen.getByTestId('r18-toggle').querySelector('input')!;
		assert.ok(toggleInput.checked, 'toggle should be checked when hideR18Content is true');
	});
});

describe('MkNote R18 filtering', () => {
	const baseNote: Misskey.entities.Note = {
		id: 'test-note-id',
		createdAt: new Date().toJSON(),
		userId: 'user-id',
		user: {
			id: 'user-id',
			username: 'testuser',
			host: null,
		} as Misskey.entities.UserLite,
		text: 'This is a test note',
		cw: null,
		visibility: 'public',
		renoteCount: 0,
		repliesCount: 0,
		reactionAcceptance: null,
		files: [],
		fileIds: [],
		emojis: {},
		channelId: null,
		localOnly: false,
		reactions: {},
		uri: null,
		url: null,
		isR18: false,
	};

	const makeNote = (isR18: boolean): Misskey.entities.Note => ({
		...baseNote,
		isR18,
	});

	const renderNote = async (note: Misskey.entities.Note): Promise<RenderResult> => {
		const mod = await import('@/components/MkNote.vue');
		return render(mod.default, {
			props: { note, mock: true },
			global: {
				stubs: {
					MkNoteSub: { template: '<div/>' },
					MkNoteHeader: { template: '<div/>' },
					MkNoteSimple: { template: '<div/>' },
					MkReactionsViewer: { template: '<div/>' },
					MkReactionsViewerDetails: { template: '<div/>' },
					MkMediaList: { template: '<div/>' },
					MkCwButton: { template: '<div/>' },
					MkPoll: { template: '<div/>' },
					MkUsersTooltip: { template: '<div/>' },
					MkUrlPreview: { template: '<div/>' },
					MkInstanceTicker: { template: '<div/>' },
					MkRippleEffect: { template: '<div/>' },
					MkA: { template: '<a><slot/></a>' },
					MkAvatar: { template: '<div/>' },
					MkTime: { template: '<time/>' },
					MkUserName: { template: '<span>{{user?.username}}</span>', props: ['user'] },
					Mfm: { template: '<span>{{text}}</span>', props: ['text'] },
					MkButton: { template: '<button/>' },
					I18n: { template: '<span><slot/></span>' },
					MkSignin: { template: '<div/>' },
					MkSignup: { template: '<div/>' },
				},
			},
		});
	};

	afterEach(() => {
		cleanup();
	});

	test('R18 note is hidden when hideR18Content is true', async () => {
		preferState.hideR18Content = true;
		const screen = await renderNote(makeNote(true));
		assert.ok(!screen.container.textContent || screen.container.textContent.trim() === '',
			'R18 note should not be rendered when hideR18Content is true');
	});

	test('R18 note is visible when hideR18Content is false', async () => {
		preferState.hideR18Content = false;
		const screen = await renderNote(makeNote(true));
		assert.ok(screen.container.textContent && screen.container.textContent.trim() !== '',
			'R18 note should be rendered when hideR18Content is false');
	});

	test('non-R18 note is visible when hideR18Content is true', async () => {
		preferState.hideR18Content = true;
		const screen = await renderNote(makeNote(false));
		assert.ok(screen.container.textContent && screen.container.textContent.trim() !== '',
			'non-R18 note should be rendered even when hideR18Content is true');
	});

	test('non-R18 note is visible when hideR18Content is false', async () => {
		preferState.hideR18Content = false;
		const screen = await renderNote(makeNote(false));
		assert.ok(screen.container.textContent && screen.container.textContent.trim() !== '',
			'non-R18 note should be rendered when hideR18Content is false');
	});
});

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, assert, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/vue';
import type { RenderResult } from '@testing-library/vue';
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import './init';
import { preferState } from './init';
import { components } from '@/components/index.js';
import { directives } from '@/directives/index.js';

vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: vi.fn().mockResolvedValue([]),
	pendingApiRequestsCount: ref(0),
}));

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
						template: `
							<div data-testid="modal">
								<button data-testid="modal-close" @click="$emit('close')">X</button>
								<button data-testid="modal-ok" :disabled="okButtonDisabled" @click="$emit('ok')">OK</button>
								<slot name="header"/>
								<slot/>
							</div>
						`,
						props: ['withOkButton', 'okButtonDisabled', 'width', 'height', 'canClose'],
						emits: ['close', 'closed', 'ok'],
						methods: {
							close() {
								this.$emit('closed');
							},
						},
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
				},
			},
		});
	};

	test('OK button is disabled when age is not selected', async () => {
		const screen = await renderDialog();
		const okBtn = screen.getByTestId('modal-ok') as HTMLButtonElement;
		assert.ok(okBtn.disabled, 'OK button should be disabled initially');
	});

	test('selecting under 17 hides R18 toggle and enables OK', async () => {
		const screen = await renderDialog();
		const under17 = screen.getByTestId('radio-under17');
		await fireEvent.click(under17);
		const toggle = screen.queryByTestId('r18-toggle');
		assert.ok(!toggle, 'R18 toggle should not appear when under 17');
		const okBtn = screen.getByTestId('modal-ok') as HTMLButtonElement;
		assert.ok(!okBtn.disabled, 'OK button should be enabled');
	});

	test('selecting over 18 shows R18 toggle and enables OK', async () => {
		const screen = await renderDialog();
		const over18 = screen.getByTestId('radio-over18');
		await fireEvent.click(over18);
		const toggle = screen.getByTestId('r18-toggle');
		assert.ok(toggle, 'R18 toggle should appear when over 18');
		const okBtn = screen.getByTestId('modal-ok') as HTMLButtonElement;
		assert.ok(!okBtn.disabled, 'OK button should be enabled');
	});

	test('clicking OK when under 17 commits hideR18Content=true', async () => {
		commitSpy.mockClear();
		const screen = await renderDialog();
		assert.strictEqual(commitSpy.mock.calls.length, 0, 'no commit before OK');
		const under17 = screen.getByTestId('radio-under17');
		await fireEvent.click(under17);
		assert.strictEqual(commitSpy.mock.calls.length, 0, 'no commit before OK');
		const okBtn = screen.getByTestId('modal-ok');
		await fireEvent.click(okBtn);
		assert.strictEqual(commitSpy.mock.calls.length, 1);
		assert.strictEqual(commitSpy.mock.calls[0][0], 'hideR18Content');
		assert.strictEqual(commitSpy.mock.calls[0][1], true);
	});

	test('clicking OK when over 18 commits selected toggle value', async () => {
		commitSpy.mockClear();
		const screen = await renderDialog();
		assert.strictEqual(commitSpy.mock.calls.length, 0, 'no commit before OK');
		const over18 = screen.getByTestId('radio-over18');
		await fireEvent.click(over18);
		assert.strictEqual(commitSpy.mock.calls.length, 0, 'no commit before OK');
		const okBtn = screen.getByTestId('modal-ok');
		await fireEvent.click(okBtn);
		assert.strictEqual(commitSpy.mock.calls.length, 1);
		assert.strictEqual(commitSpy.mock.calls[0][0], 'hideR18Content');
		assert.strictEqual(commitSpy.mock.calls[0][1], true);
	});

	test('clicking OK when over 18 with toggle toggled commits toggled value', async () => {
		commitSpy.mockClear();
		const screen = await renderDialog();
		assert.strictEqual(commitSpy.mock.calls.length, 0, 'no commit before OK');
		const over18 = screen.getByTestId('radio-over18');
		await fireEvent.click(over18);
		assert.strictEqual(commitSpy.mock.calls.length, 0, 'no commit before OK');
		const toggle = screen.getByTestId('r18-toggle').querySelector('input')!;
		await fireEvent.click(toggle);
		const okBtn = screen.getByTestId('modal-ok');
		await fireEvent.click(okBtn);
		assert.strictEqual(commitSpy.mock.calls.length, 1);
		assert.strictEqual(commitSpy.mock.calls[0][0], 'hideR18Content');
		assert.strictEqual(commitSpy.mock.calls[0][1], false);
	});

	test('R18 toggle is checked when hideR18Content is true', async () => {
		const screen = await renderDialog();
		const over18 = screen.getByTestId('radio-over18');
		await fireEvent.click(over18);
		const toggleInput = screen.getByTestId('r18-toggle').querySelector('input')!;
		assert.ok(toggleInput.checked, 'toggle should be checked when hideR18Content is true');
	});
});

	// var: static import cascade above triggers $i getter before let would exit TDZ
	var fakeI: Misskey.entities.MeDetailed | null = {
	id: 'test-user',
	username: 'testuser',
	host: null,
	policies: { canSearchNotes: false },
} as Misskey.entities.MeDetailed;

vi.mock('@/i.js', () => ({
	get $i() { return fakeI; },
	get iAmModerator() { return false; },
	get iAmAdmin() { return false; },
	ensureSignin: () => {},
	get notesCount() { return 0; },
	incNotesCount: () => {},
}));

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
		reactionEmojis: {},
		reactionCount: 0,
		channelId: null,
		localOnly: false,
		reactions: {},
		uri: undefined,
		url: undefined,
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
			global: { directives, components },
		});
	};

	const defaultFakeI: Misskey.entities.MeDetailed = {
		id: 'test-user',
		username: 'testuser',
		host: null,
		policies: { canSearchNotes: false },
	} as Misskey.entities.MeDetailed;

	beforeEach(() => {
		fakeI = defaultFakeI;
	});

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

	test('R18 note is hidden for visitors', async () => {
		fakeI = null;
		preferState.hideR18Content = false;
		const screen = await renderNote(makeNote(true));
		assert.ok(!screen.container.textContent || screen.container.textContent.trim() === '',
			'R18 note should not be rendered for visitors even when hideR18Content is false');
	});
});

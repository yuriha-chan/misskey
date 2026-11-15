/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';

const apiCalls: Array<[string, any]> = [];
const misskeyApiMock = vi.fn((endpoint: string, params: any) => {
	apiCalls.push([endpoint, params]);
	return Promise.resolve();
});

vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: (endpoint: string, params: any) => misskeyApiMock(endpoint, params),
}));

vi.mock('@/utility/autocomplete.js', () => ({
	Autocomplete: class { destroy() {} },
}));

vi.mock('@/utility/emoji-picker.js', () => ({
	emojiPicker: { show: vi.fn(), hide: vi.fn() },
}));

vi.mock('@/utility/format-time-string.js', () => ({
	formatTimeString: vi.fn(() => '1h'),
}));

vi.mock('@/drag-and-drop.js', () => ({
	checkDragDataType: vi.fn(() => false),
	getDragData: vi.fn(),
}));

vi.mock('@/os.js', async () => {
	const actual = await vi.importActual('@/os.js');
	return {
		...actual,
		alert: vi.fn(),
		confirm: vi.fn(),
		popup: vi.fn(),
		popupMenu: vi.fn(),
		popupAsyncWithDialog: vi.fn().mockResolvedValue({ dispose: vi.fn() }),
		launchUploader: vi.fn(),
	};
});

vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			somethingHappened: 'Something happened.',
			send: 'Send',
			attachFile: 'Attach File',
			attachSecret: 'Attach Secret',
			attach: 'Attach',
			selectFile: 'Select file',
			onlyOneFileCanBeAttached: 'Only one file can be attached',
			inputMessageHere: 'Input message here',
			_chat: {
				thisRoomIsArchived: 'This room is archived',
				startPoll: 'Start Poll',
				deliverCards: 'Deliver Cards',
				secretAttached: 'Secret attached',
			},
		},
		tsx: {},
	},
	updateI18n: vi.fn(),
	lang: 'en-US',
}));

vi.mock('@/local-storage.js', () => ({
	miLocalStorage: {
		getItem: vi.fn(() => null),
		setItem: vi.fn(),
		removeItem: vi.fn(),
		getItemAsJson: vi.fn(() => null),
		setItemAsJson: vi.fn(),
	},
}));

vi.mock('@/preferences.js', () => ({
	prefer: {
		s: {},
		model: vi.fn(),
	},
}));

let RoomForm: any;

async function mountRoomForm(extraProps: Record<string, unknown> = {}) {
	if (!RoomForm) {
		RoomForm = (await import('@/pages/chat/room.form.vue')).default;
	}
	const container = document.createElement('div');
	const app = createApp({
		render() {
			return h(RoomForm, {
				isArchived: false,
				members: {},
				...extraProps,
			});
		},
	});
	const MkLoading = (await import('@/components/global/MkLoading.vue')).default;
	app.component('MkLoading', MkLoading);
	app.mount(container);
	await nextTick();
	return { container, app };
}

function setText(container: HTMLElement, text: string) {
	const textarea = container.querySelector('textarea');
	if (!textarea) throw new Error('textarea not found');
	textarea.value = text;
	textarea.dispatchEvent(new Event('input'));
}

function getSendButton(container: HTMLElement): HTMLButtonElement | null {
	const buttons = container.querySelectorAll('button');
	for (const button of buttons) {
		if (button.querySelector('.ti-send')) return button as HTMLButtonElement;
	}
	return null;
}

beforeEach(() => {
	vi.resetModules();
	RoomForm = null;
	apiCalls.length = 0;
	misskeyApiMock.mockClear();
});

describe('room.form', () => {
	test('renders textarea input and send button', async () => {
		const { container } = await mountRoomForm();
		const textarea = container.querySelector('textarea');
		expect(textarea).not.toBeNull();
		expect(textarea!.getAttribute('placeholder')).toBe('Input message here');
		const sendBtn = getSendButton(container);
		expect(sendBtn).not.toBeNull();
	});

	test('send button is disabled when empty', async () => {
		const { container } = await mountRoomForm();
		const sendBtn = getSendButton(container);
		expect(sendBtn).not.toBeNull();
		expect(sendBtn!.disabled).toBe(true);
	});

	test('send button is enabled when text is entered', async () => {
		const { container } = await mountRoomForm();
		setText(container, 'Hello');
		await nextTick();
		const sendBtn = getSendButton(container);
		expect(sendBtn).not.toBeNull();
		expect(sendBtn!.disabled).toBe(false);
	});

	test('sends message to room api when room is provided', async () => {
		const { container } = await mountRoomForm({
			room: { id: 'room-1', name: 'Test Room' },
		});
		setText(container, 'Hello Room');
		await nextTick();

		const sendBtn = getSendButton(container);
		sendBtn!.click();
		await nextTick();

		expect(misskeyApiMock).toHaveBeenCalledWith(
			'chat/messages/create-to-room',
			expect.objectContaining({ text: 'Hello Room', toRoomId: 'room-1' }),
		);
	});

	test('sends message to user api when user is provided', async () => {
		const { container } = await mountRoomForm({
			user: { id: 'user-1', username: 'Alice' },
		});
		setText(container, 'Hello Alice');
		await nextTick();

		const sendBtn = getSendButton(container);
		sendBtn!.click();
		await nextTick();

		expect(misskeyApiMock).toHaveBeenCalledWith(
			'chat/messages/create-to-user',
			expect.objectContaining({ text: 'Hello Alice', toUserId: 'user-1' }),
		);
	});

	test('clears text after sending', async () => {
		const { container } = await mountRoomForm({
			user: { id: 'user-1', username: 'Alice' },
		});
		setText(container, 'Hello');
		await nextTick();

		const sendBtn = getSendButton(container);
		sendBtn!.click();
		await nextTick();
		await nextTick();
		await nextTick();

		const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
		expect(textarea.value).toBe('');
	});

	test('send button is disabled when archived', async () => {
		const { container } = await mountRoomForm({ isArchived: true });
		setText(container, 'Hello');
		await nextTick();
		const sendBtn = getSendButton(container);
		expect(sendBtn!.disabled).toBe(true);
	});
});

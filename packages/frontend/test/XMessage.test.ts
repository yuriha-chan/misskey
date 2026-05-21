/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';

const $i = reactive({
	id: 'user-1',
	username: 'me',
	policies: { chatAvailability: 'available' },
});

vi.mock('@/i.js', () => ({
	$i,
	ensureSignin: () => $i,
	iAmModerator: false,
	iAmAdmin: false,
}));

vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			edited: 'edited',
			isDeleted: 'is deleted',
			_chat: {
				scheduled: 'Scheduled',
				started: 'Started',
				finished: 'Finished',
				secretRevealed: 'Secret revealed',
				cardRevealed: 'Card revealed',
				cardDelivered: 'Delivered',
				gotVotes: 'votes',
				voters: 'Voters',
				startsIn: 'Starts in',
				secretCommited: 'committed',
			},
			_time: {
				second: 's',
			},
		},
		tsx: {
			_chat: {
				pollScheduled({ what }: any) { return `poll scheduled: ${what}`; },
				pollStarted({ what }: any) { return `poll started: ${what}`; },
				pollFinished({ what }: any) { return `poll finished: ${what}`; },
				secretCommited({ title }: any) { return `secret: ${title}`; },
				userHasJoined({ who }: any) { return `${who} joined`; },
				userHasLeft({ who }: any) { return `${who} left`; },
				userHasKicked({ who }: any) { return `${who} kicked`; },
			},
		},
	},
	updateI18n: vi.fn(),
	lang: 'en-US',
}));

vi.mock('@/os.js', () => ({
	alert: vi.fn(),
	confirm: vi.fn(),
	popup: vi.fn(),
	popupMenu: vi.fn(),
}));

vi.mock('@@/js/config.js', () => ({
	url: 'https://misskey.test',
	host: 'misskey.test',
	hostname: 'misskey.test',
	port: '',
	apiUrl: 'https://misskey.test/api',
	wsOrigin: 'https://misskey.test',
	lang: 'en-US',
	langs: ['en-US'],
	version: '0.0.0',
	ui: null,
	debug: false,
	isSafeMode: false,
	prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)'),
}));

vi.mock('@@/js/is-link.js', () => ({
	isLink: vi.fn(() => false),
}));

vi.mock('@/utility/extract-url-from-mfm.js', () => ({
	extractUrlFromMfm: vi.fn(() => []),
}));

vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utility/sound.js', () => ({
	playMisskeySfx: vi.fn(),
}));

vi.mock('@/utility/copy-to-clipboard.js', () => ({
	copyToClipboard: vi.fn(),
}));

vi.mock('@/utility/reaction-picker.js', () => ({
	reactionPicker: { show: vi.fn() },
}));

vi.mock('@/preferences.js', () => ({
	prefer: {
		s: { dataSaver: { media: false }, useStickyIcons: false, 'chat.showSenderName': false, animation: false },
		model: vi.fn(),
	},
}));

vi.mock('@/di.js', () => ({
	DI: {
		mfmEmojiReactCallback: Symbol('mfmEmojiReactCallback'),
	},
}));

vi.mock('@/store.js', () => ({
	store: {
		s: { darkMode: false },
	},
}));

vi.mock('@/components/MkUrlPreview.vue', () => ({
	default: { template: '<span></span>' },
}));

vi.mock('@/components/MkUserCardMini.vue', () => ({
	default: { template: '<span></span>' },
}));

vi.mock('@/components/MkAvatars.vue', () => ({
	default: { template: '<span></span>' },
}));

function StubMfm(props: any) {
	return h('span', null, props.text ?? '');
}
StubMfm.props = { text: String, plain: Boolean, isNote: Boolean, i: Object, nyaize: String, enableEmojiMenu: Boolean, enableEmojiMenuReaction: Boolean };

let XMessage: any;

function makeUser(id: string, username = 'user') {
	return { id, username, host: null, name: username.toUpperCase() };
}

function makeMembership(userId: string, overrides: Record<string, any> = {}) {
	return {
		id: `mem-${userId}`,
		userId,
		user: makeUser(userId),
		bubbleColor: '',
		bubbleStyle: '',
		...overrides,
	};
}

async function mountXMessage(item: any, membership?: any) {
	if (!XMessage) {
		XMessage = (await import('@/pages/chat/XMessage.vue')).default;
	}
	const container = document.createElement('div');
	const app = createApp({
		render() {
			return h(XMessage, { item, membership });
		},
	});
	app.component('Mfm', StubMfm as any);
	app.mount(container);
	await nextTick();
	return container;
}

beforeEach(() => {
	vi.resetModules();
	XMessage = null;
});

describe('XMessage', () => {
	test('renders a chat message with text', async () => {
		const container = await mountXMessage({
			type: 'message' as const,
			data: {
				id: 'msg-1',
				text: 'Hello world',
				createdAt: '2024-01-01T00:00:00Z',
				fromUserId: 'user-2',
				fromUser: makeUser('user-2', 'bob'),
				reactions: [],
			},
		});
		expect(container.textContent).toContain('Hello world');
	});

	test('renders join event', async () => {
		const container = await mountXMessage({
			type: 'join' as const,
			data: {
				id: 'join-1',
				userId: 'user-2',
				user: makeUser('user-2', 'bob'),
				createdAt: '2024-01-01T00:00:00Z',
			},
		});
		expect(container.textContent).toContain('joined');
	});

	test('renders leave event', async () => {
		const container = await mountXMessage({
			type: 'leave' as const,
			data: {
				userId: 'user-2',
				user: makeUser('user-2', 'bob'),
				createdAt: '2024-01-01T00:00:00Z',
				kicked: false,
			},
		});
		expect(container.textContent).toContain('left');
		expect(container.textContent).not.toContain('kicked');
	});

	test('renders kicked leave event', async () => {
		const container = await mountXMessage({
			type: 'leave' as const,
			data: {
				userId: 'user-2',
				user: makeUser('user-2', 'bob'),
				createdAt: '2024-01-01T00:00:00Z',
				kicked: true,
			},
		});
		expect(container.textContent).toContain('kicked');
	});

	test('renders poll scheduled event', async () => {
		const container = await mountXMessage({
			type: 'pollScheduled' as const,
			data: {
				id: 'poll-1',
				title: 'Test poll',
				startsAt: '2024-12-31T00:00:00Z',
				createdAt: '2024-01-01T00:00:00Z',
				choices: ['Option A'],
				fromUserId: 'user-2',
				anonymous: false,
				voteForUsers: false,
			},
		});
		expect(container.textContent).toContain('poll scheduled: Test poll');
	});

	test('renders poll started event', async () => {
		const container = await mountXMessage({
			type: 'pollStarted' as const,
			data: {
				id: 'poll-1',
				title: 'Test poll',
				choices: ['Option A'],
				fromUserId: 'user-2',
				anonymous: false,
				voteForUsers: false,
			},
		});
		expect(container.textContent).toContain('poll started: Test poll');
	});

	test('renders secret revealed event', async () => {
		const container = await mountXMessage({
			type: 'secretRevealed' as const,
			data: {
				id: 'sec-1',
				title: 'Secret title',
				plaintext: 'the secret',
			},
		});
		expect(container.textContent).toContain('Secret revealed');
		expect(container.textContent).toContain('the secret');
	});
});

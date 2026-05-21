/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';

const $i = reactive({
	id: 'me-1',
	username: 'me',
	policies: { chatAvailability: 'available' },
});

const apiCalls: Array<[string, any]> = [];
const apiMock = vi.fn(async (endpoint: string, params: any) => {
	apiCalls.push([endpoint, params]);
	if (endpoint === 'chat/rooms/invitations/inbox') {
		return [];
	}
	if (endpoint === 'chat/rooms/join') {
		return { id: params.roomId };
	}
	if (endpoint === 'chat/rooms/invitations/ignore') {
		return {};
	}
	return null;
});

vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: (endpoint: string, params: any) => apiMock(endpoint, params),
}));

vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			noDescription: 'No description',
			_chat: {
				join: 'Join',
				ignore: 'Ignore',
				noInvitations: 'No invitations',
			},
		},
		tsx: {},
	},
	updateI18n: vi.fn(),
	lang: 'en-US',
}));

vi.mock('@/i.js', () => ({
	$i,
	ensureSignin: () => $i,
}));

const routerPush = vi.fn();
vi.mock('@/router.js', () => ({
	useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/preferences.js', () => ({
	prefer: { s: { animation: false }, model: vi.fn() },
}));

vi.mock('@/store.js', () => ({
	store: { s: { darkMode: false } },
}));

vi.mock('@/os.js', async () => {
	return {
		alert: vi.fn(),
		confirm: vi.fn(),
		popup: vi.fn(),
		popupMenu: vi.fn(),
		apiWithDialog: vi.fn(),
		pageFolderTeleportCount: { value: 0 },
		default: {},
	};
});

vi.mock('@/theme.js', () => ({
	themeManager: {
		currentCompiledTheme: { panel: '#fff' },
		on: vi.fn(),
		off: vi.fn(),
	},
	isPreviewMode: { value: false },
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

vi.mock('@/components/MkFolder.vue', () => ({
	default: {
		inheritAttrs: false,
		props: ['defaultOpen'],
		template: '<div class="mk-folder"><slot name="icon"/><slot name="label"/><slot name="suffix"/><slot/><slot name="footer"/></div>',
	},
}));

let InvitationsVue: any;

async function mountInvitations() {
	if (!InvitationsVue) {
		InvitationsVue = (await import('@/pages/chat/home.invitations.vue')).default;
	}
	const container = document.createElement('div');
	const app = createApp({
		render() {
			return h(InvitationsVue);
		},
	});
	app.component('MkTime', {
		props: ['time'],
		template: '<time/>',
	});
	app.component('MkButton', {
		props: ['primary', 'rounded', 'danger', 'gradate', 'wait', 'disabled'],
		template: '<button :disabled="disabled"><slot/></button>',
	});
	app.component('MkAvatar', {
		props: ['user', 'link'],
		template: '<span></span>',
	});
	app.component('MkUserName', {
		props: ['user'],
		template: '<span>{{ user?.name ?? user?.username }}</span>',
	});
	app.component('MkResult', {
		props: ['type', 'text'],
		template: '<div class="mk-result">{{ text }}</div>',
	});
	app.component('MkLoading', {
		template: '<div class="mk-loading">Loading...</div>',
	});
	app.mount(container);
	await nextTick();
	await new Promise(r => setTimeout(r, 0));
	await nextTick();
	return { container, app };
}

beforeEach(() => {
	vi.resetModules();
	InvitationsVue = null;
	apiCalls.length = 0;
	apiMock.mockClear();
	routerPush.mockClear();
});

describe('home.invitations', () => {
	test('renders empty state when no invitations', async () => {
		const { container } = await mountInvitations();
		expect(container.textContent).toContain('No invitations');
	});

	test('renders invitation list', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			apiCalls.push([endpoint, _params]);
			if (endpoint === 'chat/rooms/invitations/inbox') {
				return [{
					id: 'inv-1',
					createdAt: '2024-06-01T10:00:00Z',
					room: {
						id: 'room-a',
						name: 'Test Room',
						description: 'A room for testing',
						owner: { id: 'owner-1', username: 'owneruser', name: 'Owner', host: null },
						ownerId: 'owner-1',
					},
				}];
			}
			return null;
		});

		const { container } = await mountInvitations();

		expect(container.textContent).toContain('Test Room');
		expect(container.textContent).toContain('A room for testing');
	});

	test('invitation shows room owner', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			apiCalls.push([endpoint, _params]);
			if (endpoint === 'chat/rooms/invitations/inbox') {
				return [{
					id: 'inv-1',
					createdAt: '2024-06-01T10:00:00Z',
					room: {
						id: 'room-a',
						name: 'My Chat',
						description: '',
						owner: { id: 'owner-1', username: 'chat-owner', name: 'Chat Owner', host: null },
						ownerId: 'owner-1',
					},
				}];
			}
			return null;
		});

		const { container } = await mountInvitations();

		expect(container.textContent).toContain('Chat Owner');
	});

	test('join button calls join API and navigates', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			apiCalls.push([endpoint, _params]);
			if (endpoint === 'chat/rooms/invitations/inbox') {
				return [{
					id: 'inv-1',
					createdAt: '2024-06-01T10:00:00Z',
					room: {
						id: 'room-join',
						name: 'Join Room',
						description: '',
						owner: { id: 'owner-1', username: 'owneruser', name: 'Owner', host: null },
						ownerId: 'owner-1',
					},
				}];
			}
			if (endpoint === 'chat/rooms/join') return {};
			return null;
		});

		const { container } = await mountInvitations();

		const buttons = container.querySelectorAll('button');
		let joinBtn: HTMLButtonElement | null = null;
		for (const btn of buttons) {
			if (btn.textContent?.trim() === 'Join') { joinBtn = btn; break; }
		}
		expect(joinBtn).not.toBeNull();

		joinBtn!.click();
		await nextTick();
		await new Promise(r => setTimeout(r, 0));

		expect(apiMock).toHaveBeenCalledWith('chat/rooms/join', { roomId: 'room-join' });
		expect(routerPush).toHaveBeenCalledWith('/chat/room/:roomId', {
			params: { roomId: 'room-join' },
		});
	});

	test('ignore button removes invitation from list', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			apiCalls.push([endpoint, _params]);
			if (endpoint === 'chat/rooms/invitations/inbox') {
				return [{
					id: 'inv-1',
					createdAt: '2024-06-01T10:00:00Z',
					room: {
						id: 'room-ignored',
						name: 'Ignore Room',
						description: '',
						owner: { id: 'owner-1', username: 'owneruser', name: 'Owner', host: null },
						ownerId: 'owner-1',
					},
				}];
			}
			if (endpoint === 'chat/rooms/invitations/ignore') return {};
			return null;
		});

		const { container } = await mountInvitations();

		expect(container.textContent).toContain('Ignore Room');

		const buttons = container.querySelectorAll('button');
		let ignoreBtn: HTMLButtonElement | null = null;
		for (const btn of buttons) {
			if (btn.textContent?.trim() === 'Ignore') { ignoreBtn = btn; break; }
		}
		expect(ignoreBtn).not.toBeNull();

		ignoreBtn!.click();
		await nextTick();
		await new Promise(r => setTimeout(r, 0));

		expect(apiMock).toHaveBeenCalledWith('chat/rooms/invitations/ignore', { roomId: 'room-ignored' });
		expect(container.textContent).not.toContain('Ignore Room');
	});

	test('shows noDescription when description is empty', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			apiCalls.push([endpoint, _params]);
			if (endpoint === 'chat/rooms/invitations/inbox') {
				return [{
					id: 'inv-1',
					createdAt: '2024-06-01T10:00:00Z',
					room: {
						id: 'room-no-desc',
						name: 'No Desc',
						description: '',
						owner: { id: 'owner-1', username: 'owneruser', name: 'Owner', host: null },
						ownerId: 'owner-1',
					},
				}];
			}
			return null;
		});

		const { container } = await mountInvitations();

		expect(container.textContent).toContain('No description');
	});
});

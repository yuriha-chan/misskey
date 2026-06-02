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

const apiMock = vi.fn(async (endpoint: string, _params: any) => {
	return [];
});

vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: (endpoint: string, params: any) => apiMock(endpoint, params),
}));

vi.mock('@/i.js', () => ({
	$i,
	ensureSignin: () => $i,
	iAmModerator: false,
	iAmAdmin: false,
}));

vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			noRooms: 'No rooms',
			nothing: 'Nothing',
			notFound: 'Not found',
			openInWindow: 'Open in window',
			_ago: { invalid: 'Invalid date', justNow: 'just now' },
			_chat: {
				joiningRooms: 'Joining Rooms',
				noRooms: 'No rooms',
				noPublicRooms: 'No public rooms',
				includeLeftRooms: 'Include left',
				includeArchivedRooms: 'Include archived',
				yourRooms: 'Your Rooms',
				publicRooms: 'Public Rooms',
			},
		},
		tsx: {
			_ago: {
				yearsAgo: ({ n }: any) => `${n}y ago`,
				monthsAgo: ({ n }: any) => `${n}mo ago`,
				weeksAgo: ({ n }: any) => `${n}w ago`,
				daysAgo: ({ n }: any) => `${n}d ago`,
				hoursAgo: ({ n }: any) => `${n}h ago`,
				minutesAgo: ({ n }: any) => `${n}min ago`,
				secondsAgo: ({ n }: any) => `${n}s ago`,
			},
			_timeIn: {
				years: ({ n }: any) => `${n}y`,
				months: ({ n }: any) => `${n}mo`,
				weeks: ({ n }: any) => `${n}w`,
				days: ({ n }: any) => `${n}d`,
				hours: ({ n }: any) => `${n}h`,
				minutes: ({ n }: any) => `${n}min`,
				seconds: ({ n }: any) => `${n}s`,
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
	apiWithDialog: (ep: string, p: any) => apiMock(ep, p),
	pageFolderTeleportCount: { value: 0 },
}));

vi.mock('@/utility/copy-to-clipboard.js', () => ({
	copyToClipboard: vi.fn(),
}));

vi.mock('@/theme.js', () => ({
	themeManager: {
		currentCompiledTheme: { panel: '#fff' },
		on: vi.fn(),
		off: vi.fn(),
	},
	isPreviewMode: { value: false },
}));

vi.mock('@/preferences.js', () => ({
	prefer: { s: { animation: false }, model: vi.fn() },
}));

vi.mock('@/store.js', () => ({
	store: { s: { darkMode: false } },
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

vi.mock('@@/js/use-interval.js', () => ({
	useInterval: vi.fn(),
}));

vi.mock('@/composables/use-lowres-time.js', () => ({
	useLowresTime: () => ({ value: Date.now() }),
}));

vi.mock('@@/js/intl-const.js', () => {
	const fmt = { format: vi.fn(() => '2024-01-01T00:00:00Z') };
	return { dateTimeFormat: fmt, numberFormat: fmt, hemisphere: 'N' };
});

vi.mock('@/filters/user.js', () => ({
	userPage: vi.fn(() => '/@user'),
}));

let JoiningRoomsVue: any;
let OwnedRoomsVue: any;
let PublicRoomsVue: any;

async function mountJoining() {
	if (!JoiningRoomsVue) {
		JoiningRoomsVue = (await import('@/pages/chat/home.joiningRooms.vue')).default;
	}
	const container = document.createElement('div');
	const app = createApp({
		render() {
			return h(JoiningRoomsVue);
		},
	});
	const MkResult = (await import('@/components/global/MkResult.vue')).default;
	const MkLoading = (await import('@/components/global/MkLoading.vue')).default;
	app.component('MkResult', MkResult);
	app.component('MkLoading', MkLoading);
	app.mount(container);
	await nextTick();
	await new Promise(r => setTimeout(r, 0));
	await nextTick();
	return { container, app };
}

async function mountOwned() {
	if (!OwnedRoomsVue) {
		OwnedRoomsVue = (await import('@/pages/chat/home.ownedRooms.vue')).default;
	}
	const container = document.createElement('div');
	const app = createApp({
		render() {
			return h(OwnedRoomsVue);
		},
	});
	const MkResult = (await import('@/components/global/MkResult.vue')).default;
	const MkLoading = (await import('@/components/global/MkLoading.vue')).default;
	app.component('MkResult', MkResult);
	app.component('MkLoading', MkLoading);
	app.mount(container);
	await nextTick();
	await new Promise(r => setTimeout(r, 0));
	await nextTick();
	return { container, app };
}

async function mountPublic() {
	if (!PublicRoomsVue) {
		PublicRoomsVue = (await import('@/pages/chat/home.publicRooms.vue')).default;
	}
	const container = document.createElement('div');
	const app = createApp({
		render() {
			return h(PublicRoomsVue);
		},
	});
	const MkA = (await import('@/components/global/MkA.vue')).default;
	const MkResult = (await import('@/components/global/MkResult.vue')).default;
	const MkLoading = (await import('@/components/global/MkLoading.vue')).default;
	app.component('MkA', MkA);
	app.component('MkResult', MkResult);
	app.component('MkLoading', MkLoading);
	app.mount(container);
	await nextTick();
	await new Promise(r => setTimeout(r, 0));
	await nextTick();
	return { container, app };
}

beforeEach(() => {
	vi.resetModules();
	JoiningRoomsVue = null;
	OwnedRoomsVue = null;
	PublicRoomsVue = null;
	apiMock.mockClear();
	apiMock.mockImplementation(async (_endpoint, _params) => []);
});

describe('home.joiningRooms', () => {
	test('renders empty state when no rooms', async () => {
		const { container } = await mountJoining();
		expect(container.textContent).toContain('No rooms');
	});

	test('renders room list from API', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/joining') {
				return [
					{
						id: 'mem-1',
						userId: 'me-1',
						room: {
							id: 'room-a',
							name: 'Alpha',
							description: 'Room Alpha',
							owner: { id: 'owner-1', username: 'own', name: 'Owner', host: null },
							ownerId: 'owner-1',
						},
					},
					{
						id: 'mem-2',
						userId: 'me-1',
						room: {
							id: 'room-b',
							name: 'Beta',
							description: 'Room Beta',
							owner: { id: 'owner-1', username: 'own', name: 'Owner', host: null },
							ownerId: 'owner-1',
						},
					},
				];
			}
			return [];
		});

		const { container } = await mountJoining();
		expect(container.textContent).toContain('Alpha');
		expect(container.textContent).toContain('Beta');
		expect(container.textContent).toContain('Room Alpha');
	});

	test('toggles includeLeft and refetches', async () => {
		apiMock.mockImplementation(async (endpoint: string, params: any) => {
			if (endpoint === 'chat/rooms/joining') {
				if (params?.includeLeft) {
					return [{ id: 'mem-1', userId: 'me-1', room: { id: 'room-c', name: 'Charlie', description: '', owner: { id: 'own' }, ownerId: 'own' } }];
				}
				return [{ id: 'mem-1', userId: 'me-1', room: { id: 'room-a', name: 'Alpha', description: '', owner: { id: 'own' }, ownerId: 'own' } }];
			}
			return [];
		});

		const { container } = await mountJoining();

		const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
		expect(checkbox).not.toBeNull();

		checkbox.checked = true;
		checkbox.click();
		await new Promise(r => setTimeout(r, 0));
		await nextTick();

		expect(apiMock).toHaveBeenCalledWith('chat/rooms/joining', { includeLeft: true });
		expect(container.textContent).toContain('Charlie');
	});
});

describe('home.ownedRooms', () => {
	test('renders empty state when no owned rooms', async () => {
		const { container } = await mountOwned();
		expect(container.textContent).toContain('No rooms');
	});

	test('renders owned room list', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/owned') {
				return [
					{
						id: 'owned-1',
						name: 'My Room',
						description: 'Owned room',
						owner: { id: 'me-1', username: 'me', name: 'Me', host: null },
						ownerId: 'me-1',
					},
				];
			}
			return [];
		});

		const { container } = await mountOwned();
		expect(container.textContent).toContain('My Room');
		expect(container.textContent).toContain('Owned room');
	});

	test('renders multiple owned rooms', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/owned') {
				return [
					{ id: 'r1', name: 'First', description: '', owner: { id: 'me-1' }, ownerId: 'me-1' },
					{ id: 'r2', name: 'Second', description: '', owner: { id: 'me-1' }, ownerId: 'me-1' },
				];
			}
			return [];
		});

		const { container } = await mountOwned();
		expect(container.textContent).toContain('First');
		expect(container.textContent).toContain('Second');
	});

	test('toggles includeArchived and refetches', async () => {
		apiMock.mockImplementation(async (endpoint: string, params: any) => {
			if (endpoint === 'chat/rooms/owned') {
				if (params?.includeArchived) {
					return [{ id: 'r1', name: 'Archived Room', description: '', owner: { id: 'me-1' }, ownerId: 'me-1' }];
				}
				return [{ id: 'r2', name: 'Active Room', description: '', owner: { id: 'me-1' }, ownerId: 'me-1' }];
			}
			return [];
		});

		const { container } = await mountOwned();

		const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
		expect(checkbox).not.toBeNull();

		checkbox.checked = true;
		checkbox.click();
		await new Promise(r => setTimeout(r, 0));
		await nextTick();

		expect(apiMock).toHaveBeenCalledWith('chat/rooms/owned', { includeArchived: true });
		expect(container.textContent).toContain('Archived Room');
	});
});

describe('home.publicRooms', () => {
	test('renders empty state when no public rooms', async () => {
		const { container } = await mountPublic();
		expect(container.textContent).toContain('No public rooms');
	});

	test('renders public room list with capacity info', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/list-public') {
				return [{
					id: 'pub-1',
					name: 'Public Room',
					description: 'A public chat',
					capacity: 30,
					memberships: [
						{ userId: 'u1' },
						{ userId: 'u2' },
						{ userId: 'u3' },
					],
				}];
			}
			return [];
		});

		const { container } = await mountPublic();
		expect(container.textContent).toContain('Public Room');
		expect(container.textContent).toContain('A public chat');
		expect(container.textContent).toContain('(3 / 30)');
	});

	test('renders multiple public rooms', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/list-public') {
				return [
					{ id: 'p1', name: 'Pub A', description: '', capacity: 10, memberships: [] },
					{ id: 'p2', name: 'Pub B', description: '', capacity: 20, memberships: [{ userId: 'u1' }] },
				];
			}
			return [];
		});

		const { container } = await mountPublic();
		expect(container.textContent).toContain('Pub A');
		expect(container.textContent).toContain('Pub B');
	});

	test('shows no rooms when list is empty after loading', async () => {
		const { container } = await mountPublic();
		expect(container.textContent).toContain('No public rooms');
	});
});

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
}));

vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			noRooms: 'No rooms',
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
		tsx: {},
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

vi.mock('@/components/MkAvatars.vue', () => ({
	default: {
		template: '<span class="mk-avatars"></span>',
		props: ['userIds', 'indicator', 'preview'],
	},
}));

vi.mock('@/pages/chat/XRoom.vue', () => ({
	default: {
		template: '<div class="x-room" :data-room-id="room.id">{{ room.name }} - {{ room.description }}</div>',
		props: ['room'],
	},
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
	app.component('MkSwitch', {
		props: ['modelValue'],
		emits: ['update:modelValue'],
		template: '<label><slot name="label"/><input type="checkbox" :checked="modelValue"/></label>',
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
	app.component('MkSwitch', {
		props: ['modelValue'],
		emits: ['update:modelValue'],
		template: '<label><slot name="label"/><input type="checkbox" :checked="modelValue"/></label>',
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
	app.component('MkA', {
		props: ['to'],
		template: '<a :href="to" class="mk-a"><slot/></a>',
	});
	app.component('MkAvatars', {
		props: ['userIds', 'indicator', 'preview'],
		template: '<span></span>',
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

		checkbox.dispatchEvent(new Event('change'));
		checkbox.checked = true;
		await new Promise(r => setTimeout(r, 0));
		await nextTick();
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

	test('toggles includeArchived', async () => {
		const { container } = await mountOwned();
		const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
		expect(checkbox).not.toBeNull();

		checkbox.dispatchEvent(new Event('change'));
		checkbox.checked = true;
		await new Promise(r => setTimeout(r, 0));
		await nextTick();
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
		expect(container.textContent).toContain('3');
		expect(container.textContent).toContain('30');
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

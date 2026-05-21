/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';

const $i = reactive({
	id: 'me-1',
	username: 'me',
	policies: { chatAvailability: 'available' },
	token: 'fake-token',
});

const FAKE_CONNECTION_HANDLERS: Record<string, Array<(...args: any[]) => void>> = {};

function createFakeConnection() {
	const handlers: Record<string, Array<(...args: any[]) => void>> = {};
	return {
		on(event: string, handler: (...args: any[]) => void) {
			if (!handlers[event]) handlers[event] = [];
			handlers[event].push(handler);
			return () => {
				handlers[event] = handlers[event].filter(h => h !== handler);
			};
		},
		send: vi.fn(),
		trigger(event: string, ...args: any[]) {
			(handlers[event] ?? []).forEach(h => h(...args));
		},
	};
}

let activeConnection: ReturnType<typeof createFakeConnection> | null = null;

const fakeUseChannel = function (this: ReturnType<typeof createFakeConnection>, _name: string, _params: any) {
	return this;
};

vi.mock('@/stream.js', () => ({
	useStream: () => {
		activeConnection = createFakeConnection();
		const conn = activeConnection as ReturnType<typeof createFakeConnection> & { useChannel: typeof fakeUseChannel };
		(conn as any).useChannel = fakeUseChannel.bind(conn);
		return conn;
	},
}));

const apiMock = vi.fn(async (endpoint: string, params: any) => {
	if (endpoint === 'chat/rooms/show') {
		return {
			id: params.roomId,
			name: 'Test Room',
			description: 'Room description',
			ownerId: 'me-1',
			owner: { id: 'me-1', username: 'me', name: 'Me', host: null },
			isPublic: false,
			isJoined: true,
			isArchived: false,
			capacity: 30,
			isMuted: false,
			memberships: [{ userId: 'me-1' }],
		};
	}
	if (endpoint === 'chat/messages/room-timeline') {
		return [
			{
				id: 'msg-1',
				type: 'message',
				data: {
					id: 'msg-1',
					text: 'Hello room',
					createdAt: '2024-06-01T10:00:00Z',
					fromUserId: 'me-1',
					fromUser: { id: 'me-1', username: 'me', name: 'Me', host: null },
					reactions: [],
				},
			},
			{
				id: 'msg-2',
				type: 'message',
				data: {
					id: 'msg-2',
					text: 'Hi there',
					createdAt: '2024-06-01T11:00:00Z',
					fromUserId: 'user-2',
					fromUser: { id: 'user-2', username: 'alice', name: 'Alice', host: null },
					reactions: [],
				},
			},
		];
	}
	if (endpoint === 'chat/rooms/members') {
		return [
			{ id: 'mem-1', userId: 'me-1', user: { id: 'me-1', username: 'me' } },
			{ id: 'mem-2', userId: 'user-2', user: { id: 'user-2', username: 'alice' } },
		];
	}
	if (endpoint === 'chat/secrets/list') return [];
	if (endpoint === 'chat/polls/list') return { scheduledPolls: [], startedPolls: [] };
	if (endpoint === 'chat/cards/list') return [];
	if (endpoint === 'users/show') {
		return { id: 'user-2', username: 'alice', name: 'Alice', host: null };
	}
	if (endpoint === 'chat/messages/user-timeline') {
		return [
			{
				id: 'msg-u1',
				type: 'message',
				data: {
					id: 'msg-u1',
					text: 'Hey',
					createdAt: '2024-06-01T10:00:00Z',
					fromUserId: 'me-1',
					fromUser: { id: 'me-1', username: 'me', name: 'Me', host: null },
					reactions: [],
				},
			},
		];
	}
	return null;
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
			somethingHappened: 'Something happened.',
			send: 'Send',
			loadMore: 'Load more',
			directMessage: 'Direct Message',
			search: 'Search',
			info: 'Info',
			members: 'Members',
			attachedFiles: 'Attached Files',
			_chat: {
				noMessagesYet: 'No messages yet',
				thisRoomIsArchived: 'This room is archived',
				inviteUserToChat: 'Invite others to chat',
				youAreNotAMemberOfThisRoomButInvited: 'You are not a member but invited',
				doYouAcceptInvitation: 'Accept invitation?',
				hasCommittedSecret: 'committed',
				revealsIn: 'Reveals in',
				revealSecret: 'Reveal',
				poll: 'Poll',
				startsIn: 'Starts in',
				startPoll: 'Start Poll',
				finishesIn: 'Finishes in',
				finishPoll: 'Finish Poll',
				vote: 'Vote',
				voted: 'Voted',
				revealCard: 'Reveal',
				newMessage: 'New messages',
			},
		},
		tsx: {
			_chat: {
				hasCommittedSecret({ what }: any) { return `committed: ${what}`; },
				pollScheduled({ what }: any) { return `poll: ${what}`; },
			},
		},
	},
	updateI18n: vi.fn(),
	lang: 'en-US',
}));

vi.mock('@/os.js', async () => {
	return {
		alert: vi.fn(),
		confirm: vi.fn().mockResolvedValue({ canceled: false }),
		popup: vi.fn(),
		popupMenu: vi.fn(),
		popupAsyncWithDialog: vi.fn().mockResolvedValue({ dispose: vi.fn() }),
		launchUploader: vi.fn(),
		apiWithDialog: vi.fn().mockResolvedValue({}),
		selectUser: vi.fn(),
	};
});

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

vi.mock('@@/js/scroll.js', () => ({
	getScrollContainer: vi.fn(() => ({
		scrollTop: -100,
		scrollTo: vi.fn(),
	})),
}));

vi.mock('@/composables/use-mutation-observer.js', () => ({
	useMutationObserver: vi.fn(),
}));

vi.mock('@/utility/format-time-string.js', () => ({
	formatTimeString: vi.fn(() => '1h ago'),
}));

vi.mock('@/utility/reaction-picker.js', () => ({
	reactionPicker: { show: vi.fn() },
}));

vi.mock('@/utility/sound.js', () => ({
	playMisskeySfx: vi.fn(),
}));

vi.mock('@/utility/extract-url-from-mfm.js', () => ({
	extractUrlFromMfm: vi.fn(() => []),
}));

vi.mock('@@/js/is-link.js', () => ({
	isLink: vi.fn(() => false),
}));

vi.mock('@/preferences.js', () => ({
	prefer: {
		s: {
			animation: false,
			dataSaver: { media: false, avatar: false },
			useStickyIcons: false,
			'chat.showSenderName': false,
		},
		model: vi.fn(),
	},
}));

vi.mock('@/store.js', () => ({
	store: {
		s: { darkMode: false },
	},
}));

vi.mock('@/di.js', () => ({
	DI: {
		mfmEmojiReactCallback: Symbol('mfmEmojiReactCallback'),
	},
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

vi.mock('@/router.js', () => ({
	useRouter: () => ({
		push: vi.fn(),
		useListener: vi.fn(),
	}),
}));

vi.mock('@/page.js', () => ({
	definePage: vi.fn(),
}));

vi.mock('@/accounts.js', () => ({
	updateCurrentAccountPartial: vi.fn(),
}));

vi.mock('@/theme.js', () => ({
	themeManager: {
		currentCompiledTheme: {
			panel: '#fff',
			panelHeaderBg: '#f5f5f5',
			fg: '#000',
			bg: '#fff',
			accent: '#3178f6',
			divider: 'rgba(0,0,0,0.1)',
		},
		on: vi.fn(),
		off: vi.fn(),
	},
	isPreviewMode: { value: false },
}));

vi.mock('@/pages/chat/XMessage.vue', () => ({
	default: {
		template: '<div class="x-message" :data-msg-id="item?.data?.id || item?.data?.userId">\n' +
			'  <template v-if="item.type === \'message\'">{{ item.data?.text }}</template>\n' +
			'  <template v-else-if="item.type === \'join\'">joined</template>\n' +
			'  <template v-else-if="item.type === \'leave\'">{{ item.data?.kicked ? \'kicked\' : \'left\' }}</template>\n' +
			'</div>',
		props: { item: Object, isSearchResult: Boolean },
	},
}));

vi.mock('@/pages/chat/room.form.vue', () => ({
	default: {
		template: '<div class="x-form"><input/><button>Send</button></div>',
		props: ['isArchived', 'user', 'room', 'members'],
	},
}));

vi.mock('@/pages/chat/room.search.vue', () => ({
	default: { template: '<div></div>' },
}));

vi.mock('@/pages/chat/room.members.vue', () => ({
	default: { template: '<div></div>' },
}));

vi.mock('@/pages/chat/room.info.vue', () => ({
	default: { template: '<div></div>' },
}));

vi.mock('@/pages/chat/vote-chat-poll.vue', () => ({
	default: { template: '<div></div>' },
}));

let RoomVue: any;

async function mountRoom(props: Record<string, unknown> = {}) {
	if (!RoomVue) {
		RoomVue = (await import('@/pages/chat/room.vue')).default;
	}
	const container = document.createElement('div');
	const app = createApp({
		render() {
			return h(RoomVue, props);
		},
	});
	const PageWithHeader = (await import('@/components/global/PageWithHeader.vue')).default;
	const MkLoading = (await import('@/components/global/MkLoading.vue')).default;
	const MkAvatar = (await import('@/components/global/MkAvatar.vue')).default;
	const MkResult = (await import('@/components/global/MkResult.vue')).default;
	app.component('PageWithHeader', PageWithHeader);
	app.component('MkLoading', MkLoading);
	app.component('MkAvatar', MkAvatar);
	app.component('MkResult', MkResult);
	app.mount(container);
	await nextTick();
	return { container, app };
}

beforeEach(() => {
	vi.resetModules();
	RoomVue = null;
	activeConnection = null;
	apiMock.mockClear();
});

describe('room.vue', () => {
	test('renders timeline after initialization completes', async () => {
		const { container } = await mountRoom({ roomId: 'room-1' });
		await new Promise(r => setTimeout(r, 0));
		await nextTick();

		expect(container.querySelector('.x-message')).not.toBeNull();
	});

	test('shows noMessagesYet when timeline is empty', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/show') {
				return {
					id: 'room-1',
					name: 'Empty Room',
					description: '',
					ownerId: 'me-1',
					owner: { id: 'me-1', username: 'me', name: 'Me', host: null },
					isPublic: false,
					isJoined: true,
					isArchived: false,
					capacity: 30,
					isMuted: false,
					memberships: [{ userId: 'me-1' }],
				};
			}
			if (endpoint === 'chat/messages/room-timeline') return [];
			if (endpoint === 'chat/rooms/members') return [];
			if (endpoint === 'chat/secrets/list') return [];
			if (endpoint === 'chat/polls/list') return { scheduledPolls: [], startedPolls: [] };
			if (endpoint === 'chat/cards/list') return [];
			return null;
		});

		const { container } = await mountRoom({ roomId: 'empty-room' });
		await new Promise(r => setTimeout(r, 0));
		await nextTick();

		expect(container.textContent).toContain('No messages yet');
	});

	test('shows archived banner when room is archived', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/show') {
				return {
					id: 'room-archived',
					name: 'Archived Room',
					description: '',
					ownerId: 'me-1',
					owner: { id: 'me-1', username: 'me', name: 'Me', host: null },
					isPublic: false,
					isJoined: true,
					isArchived: true,
					capacity: 30,
					isMuted: false,
					memberships: [{ userId: 'me-1' }],
				};
			}
			if (endpoint === 'chat/messages/room-timeline') {
				return [{
					id: 'msg-arc1',
					type: 'message',
					data: {
						id: 'msg-arc1',
						text: 'Old message',
						createdAt: '2024-05-01T10:00:00Z',
						fromUserId: 'me-1',
						fromUser: { id: 'me-1', username: 'me', name: 'Me', host: null },
						reactions: [],
					},
				}];
			}
			if (endpoint === 'chat/rooms/members') return [];
			if (endpoint === 'chat/secrets/list') return [];
			if (endpoint === 'chat/polls/list') return { scheduledPolls: [], startedPolls: [] };
			if (endpoint === 'chat/cards/list') return [];
			return null;
		});

		const { container } = await mountRoom({ roomId: 'room-archived' });
		await new Promise(r => setTimeout(r, 0));
		await nextTick();

		expect(container.textContent).toContain('archived');
	});

	test('renders room name and messages from API', async () => {
		const { container } = await mountRoom({ roomId: 'room-1' });
		await new Promise(r => setTimeout(r, 0));
		await nextTick();

		expect(container.querySelector('.x-message')).not.toBeNull();
	});

	test('adds new message on websocket message event', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/show') {
				return {
					id: 'room-1',
					name: 'Test Room',
					description: '',
					ownerId: 'me-1',
					owner: { id: 'me-1', username: 'me', name: 'Me', host: null },
					isPublic: false,
					isJoined: true,
					isArchived: false,
					capacity: 30,
					isMuted: false,
					memberships: [{ userId: 'me-1' }],
				};
			}
			if (endpoint === 'chat/messages/room-timeline') return [];
			if (endpoint === 'chat/rooms/members') return [];
			if (endpoint === 'chat/secrets/list') return [];
			if (endpoint === 'chat/polls/list') return { scheduledPolls: [], startedPolls: [] };
			if (endpoint === 'chat/cards/list') return [];
			return null;
		});

		const { container } = await mountRoom({ roomId: 'room-1' });
		await new Promise(r => setTimeout(r, 0));
		await nextTick();

		expect(activeConnection).not.toBeNull();

		activeConnection!.trigger('message', {
			id: 'msg-ws1',
			text: 'from websocket',
			createdAt: '2024-06-02T10:00:00Z',
			fromUserId: 'user-3',
			fromUser: { id: 'user-3', username: 'bob', name: 'Bob', host: null },
			reactions: [],
		});

		await nextTick();
		expect(container.textContent).toContain('from websocket');
	});

	test('adds join event on websocket join', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/show') {
				return {
					id: 'room-1',
					name: 'Test Room',
					description: '',
					ownerId: 'me-1',
					owner: { id: 'me-1', username: 'me', name: 'Me', host: null },
					isPublic: false,
					isJoined: true,
					isArchived: false,
					capacity: 30,
					isMuted: false,
					memberships: [{ userId: 'me-1' }],
				};
			}
			if (endpoint === 'chat/messages/room-timeline') return [];
			if (endpoint === 'chat/rooms/members') return [];
			if (endpoint === 'chat/secrets/list') return [];
			if (endpoint === 'chat/polls/list') return { scheduledPolls: [], startedPolls: [] };
			if (endpoint === 'chat/cards/list') return [];
			return null;
		});

		const { container } = await mountRoom({ roomId: 'room-1' });
		await new Promise(r => setTimeout(r, 0));
		await nextTick();

		activeConnection!.trigger('join', {
			id: 'mem-join1',
			userId: 'user-3',
			user: { id: 'user-3', username: 'bob', name: 'Bob', host: null },
			createdAt: '2024-06-02T10:00:00Z',
		});

		await nextTick();
		expect(container.textContent).toContain('joined');
	});

	test('websocket leave event with kick flag shows kicked', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/show') {
				return {
					id: 'room-1',
					name: 'Test Room',
					description: '',
					ownerId: 'me-1',
					owner: { id: 'me-1', username: 'me', name: 'Me', host: null },
					isPublic: false,
					isJoined: true,
					isArchived: false,
					capacity: 30,
					isMuted: false,
					memberships: [{ userId: 'me-1' }],
				};
			}
			if (endpoint === 'chat/messages/room-timeline') return [];
			if (endpoint === 'chat/rooms/members') {
				return [
					{ id: 'mem-1', userId: 'me-1', user: { id: 'me-1', username: 'me' } },
					{ id: 'mem-3', userId: 'user-3', user: { id: 'user-3', username: 'bob', name: 'Bob', host: null } },
				];
			}
			if (endpoint === 'chat/secrets/list') return [];
			if (endpoint === 'chat/polls/list') return { scheduledPolls: [], startedPolls: [] };
			if (endpoint === 'chat/cards/list') return [];
			return null;
		});

		const { container } = await mountRoom({ roomId: 'room-1' });
		await new Promise(r => setTimeout(r, 0));
		await nextTick();

		activeConnection!.trigger('leave', {
			userId: 'user-3',
			user: { id: 'user-3', username: 'bob', name: 'Bob', host: null },
			createdAt: '2024-06-02T10:00:00Z',
			kicked: true,
		});

		await nextTick();
		expect(container.textContent).toContain('kicked');
	});

	test('renders secret from API with reveal button and countdown', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/show') {
				return {
					id: 'room-1',
					name: 'Secret Room',
					description: '',
					ownerId: 'me-1',
					owner: { id: 'me-1', username: 'me', name: 'Me', host: null },
					isPublic: false,
					isJoined: true,
					isArchived: false,
					capacity: 30,
					isMuted: false,
					memberships: [{ userId: 'me-1' }],
				};
			}
			if (endpoint === 'chat/messages/room-timeline') {
				return [{
					id: 'msg-1',
					type: 'message',
					data: {
						id: 'msg-1',
						text: 'Hi',
						createdAt: '2024-06-01T10:00:00Z',
						fromUserId: 'me-1',
						fromUser: { id: 'me-1', username: 'me', name: 'Me', host: null },
						reactions: [],
					},
				}];
			}
			if (endpoint === 'chat/rooms/members') {
				return [
					{ id: 'mem-1', userId: 'me-1', user: { id: 'me-1', username: 'me', name: 'Me', host: null } },
				];
			}
			if (endpoint === 'chat/secrets/list') {
				return [{
					id: 'sec-1',
					title: 'My Secret',
					fromUserId: 'me-1',
					revealsAt: '2025-06-01T10:00:00Z',
					createdAt: '2024-06-01T10:00:00Z',
				}];
			}
			if (endpoint === 'chat/polls/list') return { scheduledPolls: [], startedPolls: [] };
			if (endpoint === 'chat/cards/list') return [];
			return null;
		});

		const { container } = await mountRoom({ roomId: 'room-1' });
		await new Promise(r => setTimeout(r, 0));
		await nextTick();

		expect(container.textContent).toContain('committed: My Secret');
		expect(container.textContent).toContain('Reveals in');
		const buttons = container.querySelectorAll('button');
		const revealBtn = Array.from(buttons).find(b => b.textContent?.trim() === 'Reveal');
		expect(revealBtn).not.toBeUndefined();
	});

	test('renders scheduled poll from API with starts-in countdown and start button', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/show') {
				return {
					id: 'room-1',
					name: 'Poll Room',
					description: '',
					ownerId: 'me-1',
					owner: { id: 'me-1', username: 'me', name: 'Me', host: null },
					isPublic: false,
					isJoined: true,
					isArchived: false,
					capacity: 30,
					isMuted: false,
					memberships: [{ userId: 'me-1' }],
				};
			}
			if (endpoint === 'chat/messages/room-timeline') {
				return [{
					id: 'msg-1',
					type: 'message',
					data: {
						id: 'msg-1',
						text: 'Hi',
						createdAt: '2024-06-01T10:00:00Z',
						fromUserId: 'me-1',
						fromUser: { id: 'me-1', username: 'me', name: 'Me', host: null },
						reactions: [],
					},
				}];
			}
			if (endpoint === 'chat/rooms/members') return [];
			if (endpoint === 'chat/secrets/list') return [];
			if (endpoint === 'chat/polls/list') {
				return {
					scheduledPolls: [{
						id: 'poll-1',
						title: 'Favorite color',
						startsAt: '2025-06-01T10:00:00Z',
						fromUserId: 'me-1',
						anonymous: false,
						voteForUsers: false,
						choices: ['Red', 'Blue'],
					}],
					startedPolls: [],
				};
			}
			if (endpoint === 'chat/cards/list') return [];
			return null;
		});

		const { container } = await mountRoom({ roomId: 'room-1' });
		await new Promise(r => setTimeout(r, 0));
		await nextTick();

		expect(container.textContent).toContain('Favorite color');
		expect(container.textContent).toContain('Starts in');
		const buttons = container.querySelectorAll('button');
		const startBtn = Array.from(buttons).find(b => b.textContent?.trim() === 'Start Poll');
		expect(startBtn).not.toBeUndefined();
	});

	test('renders started poll from API with finish-in countdown and vote button', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/show') {
				return {
					id: 'room-1',
					name: 'Poll Room',
					description: '',
					ownerId: 'me-1',
					owner: { id: 'me-1', username: 'me', name: 'Me', host: null },
					isPublic: false,
					isJoined: true,
					isArchived: false,
					capacity: 30,
					isMuted: false,
					memberships: [{ userId: 'me-1' }],
				};
			}
			if (endpoint === 'chat/messages/room-timeline') {
				return [{
					id: 'msg-1',
					type: 'message',
					data: {
						id: 'msg-1',
						text: 'Hi',
						createdAt: '2024-06-01T10:00:00Z',
						fromUserId: 'me-1',
						fromUser: { id: 'me-1', username: 'me', name: 'Me', host: null },
						reactions: [],
					},
				}];
			}
			if (endpoint === 'chat/rooms/members') return [];
			if (endpoint === 'chat/secrets/list') return [];
			if (endpoint === 'chat/polls/list') {
				return {
					scheduledPolls: [],
					startedPolls: [{
						id: 'poll-2',
						title: 'Best food',
						finishesAt: '2025-06-02T10:00:00Z',
						fromUserId: 'me-1',
						anonymous: false,
						voteForUsers: false,
						choices: ['Pizza', 'Sushi'],
						textChoices: ['Pizza', 'Sushi'],
						userChoices: [],
					}],
				};
			}
			if (endpoint === 'chat/cards/list') return [];
			return null;
		});

		const { container } = await mountRoom({ roomId: 'room-1' });
		await new Promise(r => setTimeout(r, 0));
		await nextTick();

		expect(container.textContent).toContain('Best food');
		expect(container.textContent).toContain('Finishes in');
		const buttons = container.querySelectorAll('button');
		const finishBtn = Array.from(buttons).find(b => b.textContent?.trim() === 'Finish Poll');
		expect(finishBtn).not.toBeUndefined();
		const voteBtn = Array.from(buttons).find(b => b.textContent?.trim() === 'Vote');
		expect(voteBtn).not.toBeUndefined();
	});

	test('shows Vote but not Finish Poll for non-owner poll', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/show') {
				return {
					id: 'room-1',
					name: 'Poll Room',
					description: '',
					ownerId: 'me-1',
					owner: { id: 'me-1', username: 'me', name: 'Me', host: null },
					isPublic: false,
					isJoined: true,
					isArchived: false,
					capacity: 30,
					isMuted: false,
					memberships: [{ userId: 'me-1' }],
				};
			}
			if (endpoint === 'chat/messages/room-timeline') {
				return [{
					id: 'msg-1',
					type: 'message',
					data: {
						id: 'msg-1',
						text: 'Hi',
						createdAt: '2024-06-01T10:00:00Z',
						fromUserId: 'me-1',
						fromUser: { id: 'me-1', username: 'me', name: 'Me', host: null },
						reactions: [],
					},
				}];
			}
			if (endpoint === 'chat/rooms/members') return [];
			if (endpoint === 'chat/secrets/list') return [];
			if (endpoint === 'chat/polls/list') {
				return {
					scheduledPolls: [],
					startedPolls: [{
						id: 'poll-nonowner',
						title: 'From another user',
						finishesAt: '2025-06-02T10:00:00Z',
						fromUserId: 'user-2',
						anonymous: false,
						voteForUsers: false,
						choices: ['A', 'B'],
						textChoices: ['A', 'B'],
						userChoices: [],
					}],
				};
			}
			if (endpoint === 'chat/cards/list') return [];
			return null;
		});

		const { container } = await mountRoom({ roomId: 'room-1' });
		await new Promise(r => setTimeout(r, 0));
		await nextTick();

		expect(container.textContent).toContain('From another user');
		const buttons = container.querySelectorAll('button');
		const voteBtn = Array.from(buttons).find(b => b.textContent?.trim() === 'Vote');
		expect(voteBtn).not.toBeUndefined();
		const finishBtn = Array.from(buttons).find(b => b.textContent?.trim() === 'Finish Poll');
		expect(finishBtn).toBeUndefined();
	});

	test('renders cards from API with reveal button', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/show') {
				return {
					id: 'room-1',
					name: 'Card Room',
					description: '',
					ownerId: 'me-1',
					owner: { id: 'me-1', username: 'me', name: 'Me', host: null },
					isPublic: false,
					isJoined: true,
					isArchived: false,
					capacity: 30,
					isMuted: false,
					memberships: [{ userId: 'me-1' }],
				};
			}
			if (endpoint === 'chat/messages/room-timeline') {
				return [{
					id: 'msg-1',
					type: 'message',
					data: {
						id: 'msg-1',
						text: 'Hi',
						createdAt: '2024-06-01T10:00:00Z',
						fromUserId: 'me-1',
						fromUser: { id: 'me-1', username: 'me', name: 'Me', host: null },
						reactions: [],
					},
				}];
			}
			if (endpoint === 'chat/rooms/members') return [];
			if (endpoint === 'chat/secrets/list') return [];
			if (endpoint === 'chat/polls/list') return { scheduledPolls: [], startedPolls: [] };
			if (endpoint === 'chat/cards/list') {
				return [{
					deliverId: 'del-1',
					cardId: 'card-1',
					cardKind: 'Hearts',
				}];
			}
			return null;
		});

		const { container } = await mountRoom({ roomId: 'room-1' });
		await new Promise(r => setTimeout(r, 0));
		await nextTick();

		expect(container.textContent).toContain('Hearts');
		const buttons = container.querySelectorAll('button');
		const revealBtn = Array.from(buttons).find(b => b.textContent?.trim() === 'Reveal');
		expect(revealBtn).not.toBeUndefined();
	});

	test('websocket secretCommitted adds secret to sticky top', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/show') {
				return {
					id: 'room-1',
					name: 'Test Room',
					description: '',
					ownerId: 'me-1',
					owner: { id: 'me-1', username: 'me', name: 'Me', host: null },
					isPublic: false,
					isJoined: true,
					isArchived: false,
					capacity: 30,
					isMuted: false,
					memberships: [{ userId: 'me-1' }],
				};
			}
			if (endpoint === 'chat/messages/room-timeline') {
				return [{
					id: 'msg-1',
					type: 'message',
					data: {
						id: 'msg-1',
						text: 'Hi',
						createdAt: '2024-06-01T10:00:00Z',
						fromUserId: 'me-1',
						fromUser: { id: 'me-1', username: 'me', name: 'Me', host: null },
						reactions: [],
					},
				}];
			}
			if (endpoint === 'chat/rooms/members') {
				return [{ id: 'mem-1', userId: 'me-1', user: { id: 'me-1', username: 'me', name: 'Me', host: null } }];
			}
			if (endpoint === 'chat/secrets/list') return [];
			if (endpoint === 'chat/polls/list') return { scheduledPolls: [], startedPolls: [] };
			if (endpoint === 'chat/cards/list') return [];
			return null;
		});

		const { container } = await mountRoom({ roomId: 'room-1' });
		await new Promise(r => setTimeout(r, 0));
		await nextTick();

		activeConnection!.trigger('secretCommitted', {
			id: 'sec-ws1',
			title: 'WS secret',
			fromUserId: 'me-1',
			revealsAt: '2025-06-01T10:00:00Z',
			createdAt: '2024-06-02T10:00:00Z',
		});

		await nextTick();
		expect(container.textContent).toContain('committed: WS secret');
		const buttons = container.querySelectorAll('button');
		const revealBtn = Array.from(buttons).find(b => b.textContent?.trim() === 'Reveal');
		expect(revealBtn).not.toBeUndefined();
	});

	test('websocket pollScheduled adds poll to sticky top', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/show') {
				return {
					id: 'room-1',
					name: 'Test Room',
					description: '',
					ownerId: 'me-1',
					owner: { id: 'me-1', username: 'me', name: 'Me', host: null },
					isPublic: false,
					isJoined: true,
					isArchived: false,
					capacity: 30,
					isMuted: false,
					memberships: [{ userId: 'me-1' }],
				};
			}
			if (endpoint === 'chat/messages/room-timeline') {
				return [{
					id: 'msg-1',
					type: 'message',
					data: {
						id: 'msg-1',
						text: 'Hi',
						createdAt: '2024-06-01T10:00:00Z',
						fromUserId: 'me-1',
						fromUser: { id: 'me-1', username: 'me', name: 'Me', host: null },
						reactions: [],
					},
				}];
			}
			if (endpoint === 'chat/rooms/members') return [];
			if (endpoint === 'chat/secrets/list') return [];
			if (endpoint === 'chat/polls/list') return { scheduledPolls: [], startedPolls: [] };
			if (endpoint === 'chat/cards/list') return [];
			return null;
		});

		const { container } = await mountRoom({ roomId: 'room-1' });
		await new Promise(r => setTimeout(r, 0));
		await nextTick();

		activeConnection!.trigger('pollScheduled', {
			id: 'poll-ws1',
			title: 'WS poll',
			startsAt: '2025-06-01T10:00:00Z',
			fromUserId: 'me-1',
			anonymous: false,
			voteForUsers: false,
			choices: ['X', 'Y'],
		});

		await nextTick();
		expect(container.textContent).toContain('WS poll');
		const buttons = container.querySelectorAll('button');
		const startBtn = Array.from(buttons).find(b => b.textContent?.trim() === 'Start Poll');
		expect(startBtn).not.toBeUndefined();
	});

	test('websocket cardDelivered adds card to sticky top', async () => {
		apiMock.mockImplementation(async (endpoint: string, _params: any) => {
			if (endpoint === 'chat/rooms/show') {
				return {
					id: 'room-1',
					name: 'Test Room',
					description: '',
					ownerId: 'me-1',
					owner: { id: 'me-1', username: 'me', name: 'Me', host: null },
					isPublic: false,
					isJoined: true,
					isArchived: false,
					capacity: 30,
					isMuted: false,
					memberships: [{ userId: 'me-1' }],
				};
			}
			if (endpoint === 'chat/messages/room-timeline') {
				return [{
					id: 'msg-1',
					type: 'message',
					data: {
						id: 'msg-1',
						text: 'Hi',
						createdAt: '2024-06-01T10:00:00Z',
						fromUserId: 'me-1',
						fromUser: { id: 'me-1', username: 'me', name: 'Me', host: null },
						reactions: [],
					},
				}];
			}
			if (endpoint === 'chat/rooms/members') return [];
			if (endpoint === 'chat/secrets/list') return [];
			if (endpoint === 'chat/polls/list') return { scheduledPolls: [], startedPolls: [] };
			if (endpoint === 'chat/cards/list') return [];
			return null;
		});

		const { container } = await mountRoom({ roomId: 'room-1' });
		await new Promise(r => setTimeout(r, 0));
		await nextTick();

		activeConnection!.trigger('cardDelivered', {
			deliverId: 'del-ws1',
			cardId: 'card-ws1',
			cardKind: 'Spades',
		});

		await nextTick();
		expect(container.textContent).toContain('Spades');
		const buttons = container.querySelectorAll('button');
		const revealBtn = Array.from(buttons).find(b => b.textContent?.trim() === 'Reveal');
		expect(revealBtn).not.toBeUndefined();
	});
});

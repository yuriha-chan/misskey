/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	popup: vi.fn(),
	alert: vi.fn(),
	misskeyApi: vi.fn(),
	storeState: {
		accountTokens: {} as Record<string, string>,
		accountInfos: {} as Record<string, any>,
	},
	preferState: {
		accounts: [] as [string, { id: string; username: string }][],
	},
	activeAccount: null as Record<string, any> | null,
}));

vi.mock('@@/js/config.js', () => ({ apiUrl: '/api', host: 'example.test' }));
vi.mock('@/os.js', () => ({
	alert: mocks.alert,
	popup: mocks.popup,
	waiting: vi.fn(),
	popupMenu: vi.fn(),
	success: vi.fn(),
}));
vi.mock('@/store.js', () => ({
	store: {
		get s() {
			return mocks.storeState;
		},
		set: vi.fn(async (key: string, value: unknown) => {
			mocks.storeState[key as keyof typeof mocks.storeState] = value as never;
		}),
	},
}));
vi.mock('@/preferences.js', () => ({
	prefer: {
		get s() {
			return mocks.preferState;
		},
		commit: vi.fn((key: string, value: unknown) => {
			mocks.preferState[key as keyof typeof mocks.preferState] = value as never;
		}),
	},
}));
vi.mock('@/i.js', () => ({
	get $i() {
		return mocks.activeAccount;
	},
}));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.misskeyApi }));
vi.mock('@/utility/unison-reload.js', () => ({
	unisonReload: vi.fn(),
	reloadChannel: { postMessage: vi.fn() },
}));
vi.mock('@/utility/show-suspended-dialog.js', () => ({ showSuspendedDialog: vi.fn() }));
vi.mock('@/signout.js', () => ({ signout: vi.fn() }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { setItem: vi.fn(), getItem: vi.fn() } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { alreadyLoggedIn: 'already logged in' } } }));

import { getAccountWithSigninDialog } from '@/accounts.js';

const host = 'example.test';
const revokedTokenErrorId = 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14';

type Account = { id: string; username: string; token?: string; accountParents?: unknown[] };
type SigninResponse = { id: string; i: string; finished: true };
type PopupHandlers = { done: (response: SigninResponse) => Promise<void> };

function account(id: string, username: string, token?: string): Account {
	return { id, username, ...(token ? { token } : {}) };
}

function response(user: Account, status = 200): Response {
	return new Response(JSON.stringify(user), { status });
}

function installPopupHandler() {
	let handlers: PopupHandlers | undefined;
	mocks.popup.mockImplementation((_component, _props, popupHandlers: PopupHandlers) => {
		handlers = popupHandlers;
		return { dispose: vi.fn() };
	});
	return async (result: SigninResponse) => {
		const operation = getAccountWithSigninDialog();
		await handlers!.done(result);
		return await operation;
	};
}

function setSavedAccounts(...saved: { user: Account; token: string }[]) {
	mocks.storeState.accountTokens = Object.fromEntries(saved.map(({ user, token }) => [`${host}/${user.id}`, token]));
	mocks.storeState.accountInfos = Object.fromEntries(saved.map(({ user }) => [`${host}/${user.id}`, user]));
	mocks.preferState.accounts = saved.map(({ user }) => [host, { id: user.id, username: user.username }]);
}

describe('getAccountWithSigninDialog post-authentication dispatch', () => {
	beforeEach(() => {
		mocks.storeState.accountTokens = {};
		mocks.storeState.accountInfos = {};
		mocks.preferState.accounts = [];
		mocks.activeAccount = account('active-id', 'active-user', 'active-token');
		mocks.popup.mockReset();
		mocks.alert.mockReset();
		mocks.misskeyApi.mockReset();
		mocks.misskeyApi.mockResolvedValue([]);
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('keeps an already-saved account with a valid old token', async () => {
		const savedUser = account('saved-id', 'saved-user');
		const savedInfo = { ...savedUser, name: 'existing info' };
		setSavedAccounts({ user: savedInfo, token: 'old-native-token' });
		const fetch = vi.mocked(window.fetch);
		fetch.mockResolvedValue(response(savedUser) as Response);
		const completeSignin = installPopupHandler();

		const result = await completeSignin({ id: savedUser.id, i: 'returned-new-token', finished: true });

		expect(result).toBeNull();
		expect(mocks.alert).toHaveBeenCalledWith({ type: 'info', text: 'already logged in' });
		expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ i: 'old-native-token' });
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(mocks.storeState.accountTokens[`${host}/${savedUser.id}`]).toBe('old-native-token');
		expect(mocks.storeState.accountInfos[`${host}/${savedUser.id}`]).toEqual(savedInfo);
		expect(mocks.activeAccount).toEqual(account('active-id', 'active-user', 'active-token'));
	});

	test('replaces a revoked saved token with the returned credential without switching accounts', async () => {
		const savedUser = account('saved-id', 'saved-user');
		const savedInfo = { ...savedUser, name: 'stale info' };
		const fetchedUser = { ...savedUser, name: 'fresh info' };
		setSavedAccounts({ user: savedInfo, token: 'revoked-old-token' });
		const fetch = vi.mocked(window.fetch);
		fetch
			.mockResolvedValueOnce(new Response(JSON.stringify({ error: { id: revokedTokenErrorId } }), { status: 401 }))
			.mockResolvedValueOnce(response(fetchedUser) as Response);
		const completeSignin = installPopupHandler();

		const result = await completeSignin({ id: savedUser.id, i: 'returned-new-token', finished: true });

		expect(result).toEqual({ id: savedUser.id, token: 'returned-new-token' });
		expect(fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
			{ i: 'revoked-old-token' },
			{ i: 'returned-new-token' },
		]);
		expect(mocks.storeState.accountTokens[`${host}/${savedUser.id}`]).toBe('returned-new-token');
		expect(mocks.storeState.accountInfos[`${host}/${savedUser.id}`]).toEqual(fetchedUser);
		expect(mocks.preferState.accounts).toEqual([
			[host, { id: savedUser.id, username: savedUser.username }],
		]);
		expect(mocks.activeAccount).toEqual(account('active-id', 'active-user', 'active-token'));
		expect(mocks.misskeyApi).toHaveBeenCalledWith('i/get-sub-account-tokens', {}, 'returned-new-token');
	});

	test('adds a previously unsaved identity using the returned credential', async () => {
		const newUser = account('new-id', 'new-user');
		mocks.preferState.accounts = [[host, { id: 'active-id', username: 'active-user' }]];
		const fetch = vi.mocked(window.fetch);
		fetch.mockResolvedValue(response(newUser) as Response);
		const completeSignin = installPopupHandler();

		const result = await completeSignin({ id: newUser.id, i: 'new-credential', finished: true });

		expect(result).toEqual({ id: newUser.id, token: 'new-credential' });
		expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ i: 'new-credential' });
		expect(mocks.storeState.accountTokens[`${host}/${newUser.id}`]).toBe('new-credential');
		expect(mocks.storeState.accountInfos[`${host}/${newUser.id}`]).toEqual(newUser);
		expect(mocks.preferState.accounts).toContainEqual([host, { id: newUser.id, username: newUser.username }]);
		expect(mocks.activeAccount).toEqual(account('active-id', 'active-user', 'active-token'));
	});
});

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { describe, beforeAll, test, expect, vi } from 'vitest';
import * as OTPAuth from 'otpauth';
// node-fetch only supports it's own Blob yet
// https://github.com/node-fetch/node-fetch/pull/1664
import { Blob } from 'node-fetch';
import { api, castAsError, createAppToken, initTestDb, post, randomString, role, sendEnvUpdateRequest, signup, simpleGet, uploadFile } from '../utils.js';
import type * as misskey from 'misskey-js';
import { MiUser } from '@/models/_.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { MiUserKeypair } from '@/models/UserKeypair.js';

const waitForPushToTlOptions = { timeout: 3000, interval: 25 };

describe('Endpoints', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let carol: misskey.entities.SignupResponse;
	let dave: misskey.entities.SignupResponse;

	beforeAll(async () => {
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
		carol = await signup({ username: 'carol' });
		dave = await signup({ username: 'dave' });
		await api('admin/update-meta', { federation: 'all' }, alice as misskey.entities.SignupResponse);
	}, 1000 * 60 * 2);

	describe('Sub-account authentication', () => {
		const password = 'test';
		const uniqueUsername = (prefix: string) => `${prefix}${randomString('abcdefghijklmnopqrstuvwxyz0123456789', 8)}`;
		const createSubAccount = async (parent: { token: string }) => {
			const res = await api('i/create-sub-account', {
				username: uniqueUsername('sub'),
			}, parent);
			assert.strictEqual(res.status, 200);
			return res.body;
		};
		const otpToken = (secret: string): string => OTPAuth.TOTP.generate({
			secret: OTPAuth.Secret.fromBase32(secret),
			digits: 6,
		});
		const enableTwoFactor = async (user: { token: string }, userPassword: string) => {
			const register = await api('i/2fa/register', { password: userPassword }, user);
			assert.strictEqual(register.status, 200);
			const done = await api('i/2fa/done', { token: otpToken(register.body.secret) }, user);
			assert.strictEqual(done.status, 200);
			return register.body.secret;
		};
		const setSubAccountPassword = async (userId: string) => {
			const connection = await initTestDb(true);
			try {
				const passwordHash = await bcrypt.hash(password, 8);
				await connection.getRepository(MiUserProfile).update({ userId }, { password: passwordHash });
			} finally {
				await connection.destroy();
			}
		};
		const assertDeletedState = async (ids: string[], isDeleted: boolean) => {
			const connection = await initTestDb(true);
			try {
				const users = connection.getRepository(MiUser);
				for (const id of ids) {
					const user = await users.findOneByOrFail({ id });
					assert.strictEqual(user.id, id);
					assert.strictEqual(user.isDeleted, isDeleted);
				}
			} finally {
				await connection.destroy();
			}
		};

		test('creates a linked sub-account with usable RSA and Ed25519 keys', async () => {
			const parent = await signup({ username: uniqueUsername('parent'), password });
			const child = await createSubAccount(parent);
			const connection = await initTestDb(true);
			try {
				const profile = await connection.getRepository(MiUserProfile).findOneByOrFail({ userId: child.id });
				assert.strictEqual(profile.mainAccountId, parent.id);
				const keys = await connection.getRepository(MiUserKeypair).findOneByOrFail({ userId: child.id });
				const message = Buffer.from('sub-account federation keys');
				for (const [privatePem, publicPem, type, algorithm] of [
					[keys.privateKey, keys.publicKey, 'rsa', 'sha256'],
					[keys.ed25519PrivateKey, keys.ed25519PublicKey, 'ed25519', null],
				] as const) {
					assert.ok(privatePem);
					assert.ok(publicPem);
					const privateKey = createPrivateKey(privatePem);
					const publicKey = createPublicKey(publicPem);
					assert.strictEqual(privateKey.asymmetricKeyType, type);
					assert.strictEqual(publicKey.asymmetricKeyType, type);
					assert.strictEqual(verify(algorithm, message, publicKey, sign(algorithm, message, privateKey)), true);
				}
			} finally {
				await connection.destroy();
			}
		});

		test('親トークンの再生成で親子の旧トークンを無効化し、子トークンを再発行する', async () => {
			const parent = await signup({ username: uniqueUsername('parent'), password });
			const children = [await createSubAccount(parent), await createSubAccount(parent)];
			const oldTokens = [parent.token, ...children.map(child => child.i)];

			for (const token of oldTokens) {
				const warm = await api('i', {}, { token });
				assert.strictEqual(warm.status, 200);
			}

			const regenerate = await api('i/regenerate-token', { password }, parent);
			assert.strictEqual(regenerate.status, 204);
			await expect.poll(async () => {
				const responses = await Promise.all(oldTokens.map(token => api('i', {}, { token })));
				return responses.every(response => response.status === 401);
			}, { timeout: 10_000, interval: 100 }).toBe(true);

			const signin = await api('signin-flow', { username: parent.username, password });
			assert.strictEqual(signin.status, 200);
			assert.strictEqual(signin.body.finished, true);
			const newParent = { token: signin.body.i! };
			const tokens = await api('i/get-sub-account-tokens', {}, newParent);
			assert.strictEqual(tokens.status, 200);
			assert.strictEqual(tokens.body.length, children.length);
			assert.deepStrictEqual(tokens.body.map(child => child.id).sort(), children.map(child => child.id).sort());
			for (const child of children) {
				const token = tokens.body.find(item => item.id === child.id);
				assert.ok(token);
				assert.notStrictEqual(token.i, child.i);
				const me = await api('i', {}, { token: token.i });
				assert.strictEqual(me.status, 200);
				assert.strictEqual(me.body.id, child.id);
			}
		});

		test('/i は親アカウントの階層を返し、公開APIやアプリトークンでは返さない', async () => {
			const root = await signup({ username: uniqueUsername('root'), password });
			const child = await createSubAccount(root);
			const grandchild = await createSubAccount({ token: child.i });

			const rootMe = await api('i', {}, root);
			assert.strictEqual(rootMe.status, 200);
			assert.deepStrictEqual((rootMe.body as any).accountParents, []);

			const childMe = await api('i', {}, { token: child.i });
			const grandchildMe = await api('i', {}, { token: grandchild.i });
			assert.strictEqual(childMe.status, 200);
			assert.strictEqual(grandchildMe.status, 200);
			assert.deepStrictEqual((grandchildMe.body as any).accountParents, [
				{ id: child.id, username: childMe.body.username },
				{ id: root.id, username: root.username },
			]);

			const publicAnonymous = await api('users/show', { userId: grandchild.id });
			const publicOtherActor = await api('users/show', { userId: grandchild.id }, root);
			assert.strictEqual(publicAnonymous.status, 200);
			assert.strictEqual(publicOtherActor.status, 200);
			assert.strictEqual('accountParents' in (publicAnonymous.body as any), false);
			assert.strictEqual('accountParents' in (publicOtherActor.body as any), false);

			const appToken = await createAppToken({ token: grandchild.i }, ['read:account']);
			const appTokenMe = await api('i', {}, { token: appToken, bearer: true });
			assert.strictEqual(appTokenMe.status, 200);
			assert.strictEqual('accountParents' in (appTokenMe.body as any), false);
		});

		test('親パスワードでアカウントと子アカウントを削除する', async () => {
			const parent = await signup({ username: uniqueUsername('parent'), password });
			const children = [await createSubAccount(parent), await createSubAccount(parent)];
			const familyIds = [parent.id, ...children.map(child => child.id)];

			const rejected = await api('i/delete-account', { password: 'incorrect' }, parent);
			assert.ok(rejected.status >= 400);
			await assertDeletedState(familyIds, false);

			const deleted = await api('i/delete-account', { password }, parent);
			assert.strictEqual(deleted.status, 204);
			await assertDeletedState(familyIds, true);
		});

		test('i/delete-sub-account は同じ親TOTPを再利用できない', async () => {
			await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '' });
			const parent = await signup({ username: uniqueUsername('parent'), password });
			const children = [await createSubAccount(parent), await createSubAccount(parent)];
			const secret = await enableTwoFactor(parent, password);

			try {
				await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '1' });
				const token = otpToken(secret);
				const first = await api('i/delete-sub-account', {
					subAccountId: children[0].id,
					password,
					token,
				}, parent);
				assert.strictEqual(first.status, 204);
				await assertDeletedState([children[0].id], true);

				const replay = await api('i/delete-sub-account', {
					subAccountId: children[1].id,
					password,
					token,
				}, parent);
				assert.ok(replay.status >= 400);
				await assertDeletedState([parent.id, children[1].id], false);
			} finally {
				await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '' });
			}
		});

		test('親アカウントのTOTPで家族全体を削除できる', async () => {
			await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '' });
			const parent = await signup({ username: uniqueUsername('parent'), password });
			const children = [await createSubAccount(parent), await createSubAccount(parent)];
			const parentSecret = await enableTwoFactor(parent, password);
			const childSecrets = [];
			for (const child of children) {
				await setSubAccountPassword(child.id);
				childSecrets.push(await enableTwoFactor({ token: child.i }, password));
			}
			assert.notStrictEqual(parentSecret, childSecrets[0]);
			assert.notStrictEqual(parentSecret, childSecrets[1]);
			assert.notStrictEqual(childSecrets[0], childSecrets[1]);
			const familyIds = [parent.id, ...children.map(child => child.id)];

			try {
				await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '1' });
				const deleted = await api('i/delete-account', {
					password,
					token: otpToken(parentSecret),
				}, parent);
				assert.strictEqual(deleted.status, 204);
				await assertDeletedState(familyIds, true);
			} finally {
				await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '' });
			}
		});
	});

	describe('signup', () => {
		test('不正なユーザー名でアカウントが作成できない', async () => {
			const res = await api('signup', {
				username: 'test.',
				password: 'test',
			});
			assert.strictEqual(res.status, 400);
		});

		test('空のパスワードでアカウントが作成できない', async () => {
			const res = await api('signup', {
				username: 'test',
				password: '',
			});
			assert.strictEqual(res.status, 400);
		});

		test('正しくアカウントが作成できる', async () => {
			const me = {
				username: 'test1',
				password: 'test1',
			};

			const res = await api('signup', me);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.username, me.username);
		});

		test('同じユーザー名のアカウントは作成できない', async () => {
			const res = await api('signup', {
				username: 'test1',
				password: 'test1',
			});

			assert.strictEqual(res.status, 400);
		});
	});

	describe('signin-flow', () => {
		test('間違ったパスワードでサインインできない', async () => {
			const res = await api('signin-flow', {
				username: 'test1',
				password: 'bar',
			});

			assert.strictEqual(res.status, 403);
		});

		test('クエリをインジェクションできない', async () => {
			const res = await api('signin-flow', {
				username: 'test1',
				// @ts-expect-error password must be string
				password: {
					$gt: '',
				},
			});

			assert.strictEqual(res.status, 400);
		});

		test('正しい情報でサインインできる', async () => {
			const res = await api('signin-flow', {
				username: 'test1',
				password: 'test1',
			});

			assert.strictEqual(res.status, 200);
		});
	});

	describe('i/update', () => {
		test('アカウント設定を更新できる', async () => {
			const myName = '大室櫻子';
			const myLocation = '七森中';
			const myBirthday = '2000-09-07';

			const res = await api('i/update', {
				name: myName,
				location: myLocation,
				birthday: myBirthday,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, myName);
			assert.strictEqual(res.body.location, myLocation);
			assert.strictEqual(res.body.birthday, myBirthday);
		});

		test('名前を空白のみにした場合nullになる', async () => {
			const res = await api('i/update', {
				name: ' ',
			}, alice);
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.name, null);
		});

		test('名前の前後に空白（ホワイトスペース）を入れてもトリムされる', async () => {
			const res = await api('i/update', {
				// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#white_space
				name: ' あ い う \u0009\u000b\u000c\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\ufeff',
			}, alice);
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.name, 'あ い う');
		});

		test('誕生日の設定を削除できる', async () => {
			await api('i/update', {
				birthday: '2000-09-07',
			}, alice);

			const res = await api('i/update', {
				birthday: null,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.birthday, null);
		});

		test('不正な誕生日の形式で怒られる', async () => {
			const res = await api('i/update', {
				birthday: '2000/09/07',
			}, alice);
			assert.strictEqual(res.status, 400);
		});
	});

	describe('users/show', () => {
		test('ユーザーが取得できる', async () => {
			const res = await api('users/show', {
				userId: alice.id,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual((res.body as unknown as { id: string }).id, alice.id);
		});

		test('ユーザーが存在しなかったら怒る', async () => {
			const res = await api('users/show', {
				userId: '000000000000000000000000',
			});
			assert.strictEqual(res.status, 404);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('users/show', {
				userId: 'kyoppie',
			});
			assert.strictEqual(res.status, 404);
		});
	});

	describe('notes/show', () => {
		test('投稿が取得できる', async () => {
			const myPost = await post(alice, {
				text: 'test',
			});

			const res = await api('notes/show', {
				noteId: myPost.id,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.id, myPost.id);
			assert.strictEqual(res.body.text, myPost.text);
		});

		test('投稿が存在しなかったら怒る', async () => {
			const res = await api('notes/show', {
				noteId: '000000000000000000000000',
			});
			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('notes/show', {
				noteId: 'kyoppie',
			});
			assert.strictEqual(res.status, 400);
		});
	});

	describe('notes/reactions/create', () => {
		test('リアクションできる', async () => {
			const bobPost = await post(bob, { text: 'hi' });

			const res = await api('notes/reactions/create', {
				noteId: bobPost.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 204);

			const resNote = await api('notes/show', {
				noteId: bobPost.id,
			}, alice);

			assert.strictEqual(resNote.status, 200);
			assert.strictEqual(resNote.body.reactions['🚀'], 1);
		});

		test('自分の投稿にもリアクションできる', async () => {
			const myPost = await post(alice, { text: 'hi' });

			const res = await api('notes/reactions/create', {
				noteId: myPost.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 204);
		});

		test('二重にリアクションすると上書きされる', async () => {
			const bobPost = await post(bob, { text: 'hi' });

			await api('notes/reactions/create', {
				noteId: bobPost.id,
				reaction: '🥰',
			}, alice);

			const res = await api('notes/reactions/create', {
				noteId: bobPost.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 204);

			const resNote = await api('notes/show', {
				noteId: bobPost.id,
			}, alice);

			assert.strictEqual(resNote.status, 200);
			assert.deepStrictEqual(resNote.body.reactions, { '🚀': 1 });
		});

		test('存在しない投稿にはリアクションできない', async () => {
			const res = await api('notes/reactions/create', {
				noteId: '000000000000000000000000',
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('リノートにリアクションできない', async () => {
			const bobNote = await post(bob, { text: 'hi' });
			const bobRenote = await post(bob, { renoteId: bobNote.id });

			const res = await api('notes/reactions/create', {
				noteId: bobRenote.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 400);
			assert.ok(res.body);
			assert.strictEqual(castAsError(res.body).error.code, 'CANNOT_REACT_TO_RENOTE');
		});

		test('引用にリアクションできる', async () => {
			const bobNote = await post(bob, { text: 'hi' });
			const bobRenote = await post(bob, { text: 'hi again', renoteId: bobNote.id });

			const res = await api('notes/reactions/create', {
				noteId: bobRenote.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 204);
		});

		test('空文字列のリアクションは\u2764にフォールバックされる', async () => {
			const bobNote = await post(bob, { text: 'hi' });

			const res = await api('notes/reactions/create', {
				noteId: bobNote.id,
				reaction: '',
			}, alice);

			assert.strictEqual(res.status, 204);

			const reaction = await api('notes/reactions', {
				noteId: bobNote.id,
			});

			assert.strictEqual(reaction.body.length, 1);
			assert.strictEqual(reaction.body[0].type, '\u2764');
		});

		test('絵文字ではない文字列のリアクションは\u2764にフォールバックされる', async () => {
			const bobNote = await post(bob, { text: 'hi' });

			const res = await api('notes/reactions/create', {
				noteId: bobNote.id,
				reaction: 'Hello!',
			}, alice);

			assert.strictEqual(res.status, 204);

			const reaction = await api('notes/reactions', {
				noteId: bobNote.id,
			});

			assert.strictEqual(reaction.body.length, 1);
			assert.strictEqual(reaction.body[0].type, '\u2764');
		});

		test('空のパラメータで怒られる', async () => {
			// @ts-expect-error param must not be empty
			const res = await api('notes/reactions/create', {}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('notes/reactions/create', {
				noteId: 'kyoppie',
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('following/create', () => {
		test('フォローできる', async () => {
			const res = await api('following/create', {
				userId: alice.id,
			}, bob);

			assert.strictEqual(res.status, 200);

			const connection = await initTestDb(true);
			const Users = connection.getRepository(MiUser);
			const newBob = await Users.findOneByOrFail({ id: bob.id });
			assert.strictEqual(newBob.followersCount, 0);
			assert.strictEqual(newBob.followingCount, 1);
			const newAlice = await Users.findOneByOrFail({ id: alice.id });
			assert.strictEqual(newAlice.followersCount, 1);
			assert.strictEqual(newAlice.followingCount, 0);
			connection.destroy();
		});

		test('既にフォローしている場合は怒る', async () => {
			const res = await api('following/create', {
				userId: alice.id,
			}, bob);

			assert.strictEqual(res.status, 400);
		});

		test('存在しないユーザーはフォローできない', async () => {
			const res = await api('following/create', {
				userId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('自分自身はフォローできない', async () => {
			const res = await api('following/create', {
				userId: alice.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('空のパラメータで怒られる', async () => {
			// @ts-expect-error params must not be empty
			const res = await api('following/create', {}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('following/create', {
				userId: 'foo',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('following/delete', () => {
		test('フォロー解除できる', async () => {
			await api('following/create', {
				userId: alice.id,
			}, bob);

			const res = await api('following/delete', {
				userId: alice.id,
			}, bob);

			assert.strictEqual(res.status, 200);

			const connection = await initTestDb(true);
			const Users = connection.getRepository(MiUser);
			const newBob = await Users.findOneByOrFail({ id: bob.id });
			assert.strictEqual(newBob.followersCount, 0);
			assert.strictEqual(newBob.followingCount, 0);
			const newAlice = await Users.findOneByOrFail({ id: alice.id });
			assert.strictEqual(newAlice.followersCount, 0);
			assert.strictEqual(newAlice.followingCount, 0);
			connection.destroy();
		});

		test('フォローしていない場合は怒る', async () => {
			const res = await api('following/delete', {
				userId: alice.id,
			}, bob);

			assert.strictEqual(res.status, 400);
		});

		test('存在しないユーザーはフォロー解除できない', async () => {
			const res = await api('following/delete', {
				userId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('自分自身はフォロー解除できない', async () => {
			const res = await api('following/delete', {
				userId: alice.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('空のパラメータで怒られる', async () => {
			// @ts-expect-error params must not be empty
			const res = await api('following/delete', {}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('following/delete', {
				userId: 'kyoppie',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('channels/search', () => {
		test('空白検索で一覧を取得できる', async () => {
			await api('channels/create', {
				name: 'aaa',
				description: 'bbb',
			}, bob);
			await api('channels/create', {
				name: 'ccc1',
				description: 'ddd1',
			}, bob);
			await api('channels/create', {
				name: 'ccc2',
				description: 'ddd2',
			}, bob);

			const res = await api('channels/search', {
				query: '',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 3);
		});
		test('名前のみの検索で名前を検索できる', async () => {
			const res = await api('channels/search', {
				query: 'aaa',
				type: 'nameOnly',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 1);
			assert.strictEqual(res.body[0].name, 'aaa');
		});
		test('名前のみの検索で名前を複数検索できる', async () => {
			const res = await api('channels/search', {
				query: 'ccc',
				type: 'nameOnly',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 2);
		});
		test('名前のみの検索で説明は検索できない', async () => {
			const res = await api('channels/search', {
				query: 'bbb',
				type: 'nameOnly',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 0);
		});
		test('名前と説明の検索で名前を検索できる', async () => {
			const res = await api('channels/search', {
				query: 'ccc1',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 1);
			assert.strictEqual(res.body[0].name, 'ccc1');
		});
		test('名前と説明での検索で説明を検索できる', async () => {
			const res = await api('channels/search', {
				query: 'ddd1',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 1);
			assert.strictEqual(res.body[0].name, 'ccc1');
		});
		test('名前と説明の検索で名前を複数検索できる', async () => {
			const res = await api('channels/search', {
				query: 'ccc',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 2);
		});
		test('名前と説明での検索で説明を複数検索できる', async () => {
			const res = await api('channels/search', {
				query: 'ddd',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 2);
		});
	});

	describe('drive', () => {
		test('ドライブ情報を取得できる', async () => {
			const res = await api('drive', {}, alice);
			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			expect(res.body).toHaveProperty('usage', 0);
		});
	});

	describe('drive/files/create', () => {
		const assignRole = async (userId: string, policies: Record<string, unknown>) => {
			const createdRole = await role(alice, {}, policies);

			const assign = await api('admin/roles/assign', {
				userId,
				roleId: createdRole.id,
			}, alice);

			assert.strictEqual(assign.status, 204);

			return createdRole;
		};

		const cleanupRole = async (userId: string, roleId: string) => {
			await api('admin/roles/unassign', {
				userId,
				roleId,
			}, alice);

			await api('admin/roles/delete', {
				roleId,
			}, alice);
		};

		test('ファイルを作成できる', async () => {
			const res = await uploadFile(alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body!.name, '192.jpg');
		});

		test('ファイルに名前を付けられる', async () => {
			const res = await uploadFile(alice, { name: 'Belmond.jpg' });

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body!.name, 'Belmond.jpg');
		});

		test('ファイルに名前を付けられるが、拡張子は正しいものになる', async () => {
			const res = await uploadFile(alice, { name: 'Belmond.png' });

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body!.name, 'Belmond.png.jpg');
		});

		test('ファイル無しで怒られる', async () => {
			// @ts-expect-error params must not be empty
			const res = await api('drive/files/create', {}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('SVGファイルを作成できる', async () => {
			const res = await uploadFile(alice, { path: 'image.svg' });

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body!.name, 'image.svg');
			assert.strictEqual(res.body!.type, 'image/svg+xml');
		});

		for (const type of ['webp', 'avif']) {
			const mediaType = `image/${type}`;

			const getWebpublicType = async (user: misskey.entities.SignupResponse, fileId: string): Promise<string> => {
				// drive/files/create does not expose webpublicType directly, so get it by posting it
				const res = await post(user, {
					text: mediaType,
					fileIds: [fileId],
				});
				const apRes = await simpleGet(`notes/${res.id}`, 'application/activity+json');
				assert.strictEqual(apRes.status, 200);
				assert.ok(Array.isArray(apRes.body.attachment));
				return apRes.body.attachment[0].mediaType;
			};

			test(`透明な${type}ファイルを作成できる`, async () => {
				const path = `with-alpha.${type}`;
				const res = await uploadFile(alice, { path });

				assert.strictEqual(res.status, 200);
				assert.strictEqual(res.body!.name, path);
				assert.strictEqual(res.body!.type, mediaType);

				const webpublicType = await getWebpublicType(alice, res.body!.id);
				assert.strictEqual(webpublicType, 'image/webp');
			});

			test(`透明じゃない${type}ファイルを作成できる`, async () => {
				const path = `without-alpha.${type}`;
				const res = await uploadFile(alice, { path });
				assert.strictEqual(res.status, 200);
				assert.strictEqual(res.body!.name, path);
				assert.strictEqual(res.body!.type, mediaType);

				const webpublicType = await getWebpublicType(alice, res.body!.id);
				assert.strictEqual(webpublicType, 'image/webp');
			});
		}

		test('uploadableFileTypes が */* なら任意のファイルをアップロードできる', async () => {
			const createdRole = await assignRole(bob.id, {
				uploadableFileTypes: {
					useDefault: false,
					priority: 1,
					value: ['*/*'],
				},
			});

			try {
				const res = await uploadFile(bob, {
					blob: new Blob([new Uint8Array(10)]),
				});

				assert.strictEqual(res.status, 200);
			} finally {
				await cleanupRole(bob.id, createdRole.id);
			}
		});

		test('uploadableFileTypes に含まれない MIME type は拒否される', async () => {
			const createdRole = await assignRole(bob.id, {
				uploadableFileTypes: {
					useDefault: false,
					priority: 1,
					value: ['image/png'],
				},
			});

			try {
				const res = await uploadFile(bob, { path: '192.jpg' });

				assert.strictEqual(res.status, 400);
				assert.ok(res.body);
				assert.strictEqual(castAsError(res.body).error.code, 'UNALLOWED_FILE_TYPE');
			} finally {
				await cleanupRole(bob.id, createdRole.id);
			}
		});

		test('maxFileSizeMb 制限付きロールでも制限内ならアップロードできる', async () => {
			const allowAllTypesRole = await assignRole(bob.id, {
				uploadableFileTypes: {
					useDefault: false,
					priority: 1,
					value: ['*/*'],
				},
			});
			const tinyAttachmentRole = await assignRole(bob.id, {
				maxFileSizeMb: {
					useDefault: false,
					priority: 1,
					value: 10 / 1024 / 1024, // 10バイト
				},
			});

			try {
				const res = await uploadFile(bob, {
					blob: new Blob([new Uint8Array(10)]),
				});

				assert.strictEqual(res.status, 200);
			} finally {
				await cleanupRole(bob.id, tinyAttachmentRole.id);
				await cleanupRole(bob.id, allowAllTypesRole.id);
			}
		});

		test('maxFileSizeMb 制限を超えると 413 になる', async () => {
			const allowAllTypesRole = await assignRole(bob.id, {
				uploadableFileTypes: {
					useDefault: false,
					priority: 1,
					value: ['*/*'],
				},
			});
			const tinyAttachmentRole = await assignRole(bob.id, {
				maxFileSizeMb: {
					useDefault: false,
					priority: 1,
					value: 10 / 1024 / 1024, // 10バイト
				},
			});

			try {
				const res = await uploadFile(bob, {
					blob: new Blob([new Uint8Array(11)]),
				});

				assert.strictEqual(res.status, 413);
				assert.ok(res.body);
				assert.strictEqual(castAsError(res.body).error.code, 'MAX_FILE_SIZE_EXCEEDED');
			} finally {
				await cleanupRole(bob.id, tinyAttachmentRole.id);
				await cleanupRole(bob.id, allowAllTypesRole.id);
			}
		});
	});

	describe('drive/files/update', () => {
		test('名前を更新できる', async () => {
			const file = (await uploadFile(alice)).body;
			const newName = 'いちごパスタ.png';

			const res = await api('drive/files/update', {
				fileId: file!.id,
				name: newName,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, newName);
		});

		test('他人のファイルは更新できない', async () => {
			const file = (await uploadFile(alice)).body;

			const res = await api('drive/files/update', {
				fileId: file!.id,
				name: 'いちごパスタ.png',
			}, bob);

			assert.strictEqual(res.status, 400);
		});

		test('親フォルダを更新できる', async () => {
			const file = (await uploadFile(alice)).body;
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			const res = await api('drive/files/update', {
				fileId: file!.id,
				folderId: folder.id,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.folderId, folder.id);
		});

		test('親フォルダを無しにできる', async () => {
			const file = (await uploadFile(alice)).body;

			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			await api('drive/files/update', {
				fileId: file!.id,
				folderId: folder.id,
			}, alice);

			const res = await api('drive/files/update', {
				fileId: file!.id,
				folderId: null,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.folderId, null);
		});

		test('他人のフォルダには入れられない', async () => {
			const file = (await uploadFile(alice)).body;
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, bob)).body;

			const res = await api('drive/files/update', {
				fileId: file!.id,
				folderId: folder.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('存在しないフォルダで怒られる', async () => {
			const file = (await uploadFile(alice)).body;

			const res = await api('drive/files/update', {
				fileId: file!.id,
				folderId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('不正なフォルダIDで怒られる', async () => {
			const file = (await uploadFile(alice)).body;

			const res = await api('drive/files/update', {
				fileId: file!.id,
				folderId: 'foo',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('ファイルが存在しなかったら怒る', async () => {
			const res = await api('drive/files/update', {
				fileId: '000000000000000000000000',
				name: 'いちごパスタ.png',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('不正なファイル名で怒られる', async () => {
			const file = (await uploadFile(alice)).body;
			const newName = '';

			const res = await api('drive/files/update', {
				fileId: file!.id,
				name: newName,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('drive/files/update', {
				fileId: 'kyoppie',
				name: 'いちごパスタ.png',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('drive/folders/create', () => {
		test('フォルダを作成できる', async () => {
			const res = await api('drive/folders/create', {
				name: 'test',
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, 'test');
		});
	});

	describe('drive/folders/update', () => {
		test('名前を更新できる', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				name: 'new name',
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, 'new name');
		});

		test('他人のフォルダを更新できない', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, bob)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				name: 'new name',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('親フォルダを更新できる', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const parentFolder = (await api('drive/folders/create', {
				name: 'parent',
			}, alice)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: parentFolder.id,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.parentId, parentFolder.id);
		});

		test('親フォルダを無しに更新できる', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const parentFolder = (await api('drive/folders/create', {
				name: 'parent',
			}, alice)).body;
			await api('drive/folders/update', {
				folderId: folder.id,
				parentId: parentFolder.id,
			}, alice);

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: null,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.parentId, null);
		});

		test('他人のフォルダを親フォルダに設定できない', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const parentFolder = (await api('drive/folders/create', {
				name: 'parent',
			}, bob)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: parentFolder.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('フォルダが循環するような構造にできない', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const parentFolder = (await api('drive/folders/create', {
				name: 'parent',
			}, alice)).body;
			await api('drive/folders/update', {
				folderId: parentFolder.id,
				parentId: folder.id,
			}, alice);

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: parentFolder.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('フォルダが循環するような構造にできない(再帰的)', async () => {
			const folderA = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const folderB = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const folderC = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			await api('drive/folders/update', {
				folderId: folderB.id,
				parentId: folderA.id,
			}, alice);
			await api('drive/folders/update', {
				folderId: folderC.id,
				parentId: folderB.id,
			}, alice);

			const res = await api('drive/folders/update', {
				folderId: folderA.id,
				parentId: folderC.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('フォルダが循環するような構造にできない(自身)', async () => {
			const folderA = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			const res = await api('drive/folders/update', {
				folderId: folderA.id,
				parentId: folderA.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('存在しない親フォルダを設定できない', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('不正な親フォルダIDで怒られる', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: 'foo',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('存在しないフォルダを更新できない', async () => {
			const res = await api('drive/folders/update', {
				folderId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('不正なフォルダIDで怒られる', async () => {
			const res = await api('drive/folders/update', {
				folderId: 'foo',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('notes/replies', () => {
		test('自分に閲覧権限のない投稿は含まれない', async () => {
			const alicePost = await post(alice, {
				text: 'foo',
			});

			await post(bob, {
				replyId: alicePost.id,
				text: 'bar',
				visibility: 'specified',
				visibleUserIds: [alice.id],
			});

			const res = await api('notes/replies', {
				noteId: alicePost.id,
			}, carol);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 0);
		});
	});

	describe('notes/timeline', () => {
		test('フォロワー限定投稿が含まれる', async () => {
			await api('following/create', {
				userId: carol.id,
			}, dave);

			const carolPost = await post(carol, {
				text: 'foo',
				visibility: 'followers',
			});

			await vi.waitFor(async () => {
				const res = await api('notes/timeline', {}, dave);

				assert.strictEqual(res.status, 200);
				assert.strictEqual(Array.isArray(res.body), true);
				assert.strictEqual(res.body.length, 1);
				assert.strictEqual(res.body[0].id, carolPost.id);
			}, waitForPushToTlOptions);
		});
	});

	describe('URL preview', () => {
		test('Error from summaly becomes HTTP 422', async () => {
			const res = await simpleGet('/url?url=https://e:xample.com');
			assert.strictEqual(res.status, 422);
			assert.strictEqual(res.body.error.code, 'URL_PREVIEW_FAILED');
		});
	});

	describe('パーソナルメモ機能のテスト', () => {
		test('他者に関するメモを更新できる', async () => {
			const memo = '10月まで低浮上とのこと。';

			const res1 = await api('users/update-memo', {
				memo,
				userId: bob.id,
			}, alice);

			const res2 = await api('users/show', {
				userId: bob.id,
			}, alice);
			assert.strictEqual(res1.status, 204);
			assert.strictEqual((res2.body as unknown as { memo: string })?.memo, memo);
		});

		test('自分に関するメモを更新できる', async () => {
			const memo = 'チケットを月末までに買う。';

			const res1 = await api('users/update-memo', {
				memo,
				userId: alice.id,
			}, alice);

			const res2 = await api('users/show', {
				userId: alice.id,
			}, alice);
			assert.strictEqual(res1.status, 204);
			assert.strictEqual((res2.body as unknown as { memo: string })?.memo, memo);
		});

		test('メモを削除できる', async () => {
			const memo = '10月まで低浮上とのこと。';

			await api('users/update-memo', {
				memo,
				userId: bob.id,
			}, alice);

			await api('users/update-memo', {
				memo: '',
				userId: bob.id,
			}, alice);

			const res = await api('users/show', {
				userId: bob.id,
			}, alice);

			// memoには常に文字列かnullが入っている(5cac151)
			assert.strictEqual((res.body as unknown as { memo: string | null }).memo, null);
		});

		test('メモは個人ごとに独立して保存される', async () => {
			const memoAliceToBob = '10月まで低浮上とのこと。';
			const memoCarolToBob = '例の件について今度問いただす。';

			await Promise.all([
				api('users/update-memo', {
					memo: memoAliceToBob,
					userId: bob.id,
				}, alice),
				api('users/update-memo', {
					memo: memoCarolToBob,
					userId: bob.id,
				}, carol),
			]);

			const [resAlice, resCarol] = await Promise.all([
				api('users/show', {
					userId: bob.id,
				}, alice),
				api('users/show', {
					userId: bob.id,
				}, carol),
			]);

			assert.strictEqual((resAlice.body as unknown as { memo: string }).memo, memoAliceToBob);
			assert.strictEqual((resCarol.body as unknown as { memo: string }).memo, memoCarolToBob);
		});
	});
});

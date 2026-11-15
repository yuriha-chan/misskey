import { describe, test, beforeAll, vi } from 'vitest';
import assert, { rejects, strictEqual } from 'node:assert';
import * as Misskey from 'misskey-js';
import { createAccount, fetchAdmin, type LoginUser, resolveRemoteUser, waitForFollowRelation, WAIT_FOR_SLOW_FEDERATION } from './utils.js';

const [aAdmin, bAdmin] = await Promise.all([
	fetchAdmin('a.test'),
	fetchAdmin('b.test'),
]);

describe('User Suspension', () => {
	describe('Suspension', () => {
		describe('Check suspend/unsuspend consistency', () => {
			let alice: LoginUser, bob: LoginUser;
			let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

			beforeAll(async () => {
				[alice, bob] = await Promise.all([
					createAccount('a.test'),
					createAccount('b.test'),
				]);

				[bobInA, aliceInB] = await Promise.all([
					resolveRemoteUser('b.test', bob.id, alice),
					resolveRemoteUser('a.test', alice.id, bob),
				]);
			});

			test('Bob follows Alice, and remote suspension preserves the existing follow', async () => {
				await bob.client.request('following/create', { userId: aliceInB.id });
				await waitForFollowRelation(bob, alice, 1);

				const followers = await alice.client.request('users/followers', { userId: alice.id });
				strictEqual(followers.length, 1); // followed by Bob

				await aAdmin.client.request('admin/suspend-user', { userId: alice.id });

				await vi.waitFor(async () => {
					const aliceInBRaw = await bAdmin.client.request('admin/show-user', { userId: aliceInB.id });
					strictEqual(aliceInBRaw.isRemoteSuspended, true);
					const renewedAliceInB = await bob.client.request('users/show', { userId: aliceInB.id });
					strictEqual(renewedAliceInB.isSuspended, true);
				}, WAIT_FOR_SLOW_FEDERATION);

				await rejects(
					async () => await bob.client.request('following/create', { userId: aliceInB.id }),
					(err: any) => {
						strictEqual(err.code, 'ALREADY_FOLLOWING');
						return true;
					},
				);
			});

			test('Alice gets unsuspended, and Bob still follows Alice', async () => {
				await aAdmin.client.request('admin/unsuspend-user', { userId: alice.id });

				await vi.waitFor(async () => {
					const aliceInBRenewed = await bAdmin.client.request('admin/show-user', { userId: aliceInB.id });
					strictEqual(aliceInBRenewed.isRemoteSuspended, false);
				}, WAIT_FOR_SLOW_FEDERATION);
				await waitForFollowRelation(bob, alice, 1);

				await rejects(
					async () => await bob.client.request('following/create', { userId: aliceInB.id }),
					(err: any) => {
						strictEqual(err.code, 'ALREADY_FOLLOWING');
						return true;
					},
				);
			});

			test('Alice can follow Bob', async () => {
				await alice.client.request('following/create', { userId: bobInA.id });
				await waitForFollowRelation(alice, bob, 1);

				const bobFollowers = await bob.client.request('users/followers', { userId: bob.id });
				strictEqual(bobFollowers.length, 1); // followed by Alice
				assert(bobFollowers[0].follower != null);
				const renewedAliceInB = bobFollowers[0].follower;
				assert(aliceInB.username === renewedAliceInB.username);
				assert(aliceInB.host === renewedAliceInB.host);
				assert(aliceInB.id === renewedAliceInB.id);
			});

			test('Alice follows Bob, and Alice gets suspended, the following relation hidden', async () => {
				await aAdmin.client.request('admin/suspend-user', { userId: alice.id });

				await vi.waitFor(async () => {
					const renewedAliceInB = await bob.client.request('users/show', { userId: aliceInB.id });
					strictEqual(renewedAliceInB.isSuspended, true);
					const aliceInBRaw = await bAdmin.client.request('admin/show-user', { userId: aliceInB.id });
					strictEqual(aliceInBRaw.isRemoteSuspended, true);

					const bobFollowers = await bob.client.request('users/followers', { userId: bob.id });
					strictEqual(bobFollowers.length, 0); // Relation is hidden
				}, WAIT_FOR_SLOW_FEDERATION);
			});
		});
	});
});

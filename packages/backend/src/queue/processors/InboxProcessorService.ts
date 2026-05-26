/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL } from 'node:url';
import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { verifyDraftSignature } from '@misskey-dev/node-http-message-signatures';
import * as Bull from 'bullmq';
import type Logger from '@/logger.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { FetchInstanceMetadataService } from '@/core/FetchInstanceMetadataService.js';
import InstanceChart from '@/core/chart/charts/instance.js';
import ApRequestChart from '@/core/chart/charts/ap-request.js';
import FederationChart from '@/core/chart/charts/federation.js';
import { getApId, isActor, isDelete } from '@/core/activitypub/type.js';
import type { IActivity } from '@/core/activitypub/type.js';
import type { MiRemoteUser } from '@/models/User.js';
import type { MiUserPublickey } from '@/models/UserPublickey.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import { StatusError } from '@/misc/status-error.js';
import { UtilityService } from '@/core/UtilityService.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import { JsonLdError, JsonLdService } from '@/core/activitypub/JsonLdService.js';
import { ApInboxService } from '@/core/activitypub/ApInboxService.js';
import { bindThis } from '@/decorators.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { CollapsedQueue } from '@/misc/collapsed-queue.js';
import { MiNote } from '@/models/Note.js';
import { MiMeta } from '@/models/Meta.js';
import { DI } from '@/di-symbols.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type { InboxJobData } from '../types.js';

type UpdateInstanceJob = {
	latestRequestReceivedAt: Date,
	shouldUnsuspend: boolean,
};

@Injectable()
export class InboxProcessorService implements OnApplicationShutdown {
	private logger: Logger;
	private updateInstanceQueue: CollapsedQueue<MiNote['id'], UpdateInstanceJob>;

	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		private utilityService: UtilityService,
		private apInboxService: ApInboxService,
		private federatedInstanceService: FederatedInstanceService,
		private fetchInstanceMetadataService: FetchInstanceMetadataService,
		private jsonLdService: JsonLdService,
		private apPersonService: ApPersonService,
		private apDbResolverService: ApDbResolverService,
		private instanceChart: InstanceChart,
		private apRequestChart: ApRequestChart,
		private federationChart: FederationChart,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('inbox');
		this.updateInstanceQueue = new CollapsedQueue(process.env.NODE_ENV !== 'test' ? 60 * 1000 * 5 : 0, this.collapseUpdateInstanceJobs, this.performUpdateInstance);
	}

	@bindThis
	public async process(job: Bull.Job<InboxJobData>): Promise<string> {
		// versioned signature or plain signature
		const signature = job.data.signature ? (('version' in job.data.signature) ? job.data.signature.value : job.data.signature) : null;
		if (Array.isArray(signature)) {
			throw new Bull.UnrecoverableError('Array signature (RFC 9401) is not supported');
		}
		let activity = job.data.activity;

		//#region Log
		const info = Object.assign({}, activity);
		delete info['@context'];
		this.logger.debug(JSON.stringify(info, null, 2));
		//#endregion

		let httpSignatureValidated = false;
		let httpSignatureError = "";
		let authUser: {
				user: MiRemoteUser | null;
				key: MiUserPublickey | null;
			} | null = null;
		const actorUri = getApId(activity.actor);

		if (signature) {
			const host = this.utilityService.toPuny(new URL(signature.keyId).hostname);

			if (!this.utilityService.isFederationAllowedHost(host)) {
				return `Blocked request: ${host}`;
			}

			// inbox blocking based on actorUri
			const actorHost = this.utilityService.toPuny(new URL(actorUri).hostname);

			if (!this.utilityService.isFederationAllowedHost(actorHost)) {
				return `Blocked request: ${actorHost}`;
			}

			const keyIdLower = signature.keyId.toLowerCase();
			if (keyIdLower.startsWith('acct:')) {
				return `Old keyId is no longer supported. ${keyIdLower}`;
			}

			{
				let userExistenceCheckApId: string | null = null;

				// 存在しないActorに対するActorのDeleteアクティビティは無視する。
				// actorとobjectが同じならばそれはActorに違いない
				if (isDelete(activity) && typeof activity.object === 'object' && (isActor(activity.object) || getApId(activity.actor) === getApId(activity.object))) {
					userExistenceCheckApId = getApId(activity.object);
				}

				if (userExistenceCheckApId != null) {
					const user = await this.apDbResolverService.getUserFromApId(userExistenceCheckApId);
					if (user == null) {
						return `skip: user not found for delete activity. ${getApId(userExistenceCheckApId)}`;
					}
				}
			}

			// HTTP-Signature keyIdを元にDBから取得
			authUser = await this.apDbResolverService.getAuthUserFromApId(actorUri, signature?.keyId);

			// authUser が取得できない場合、公開鍵を取得できない場合はHTTP-Signatureを失敗とする
			if (authUser == null || authUser.user == null) {
				httpSignatureError = `failed to resolve user ${getApId(activity.actor)}`;
			} else if (authUser.key == null) {
				httpSignatureError = `failed to resolve user publicKey ${getApId(activity.actor)}`;
			} else {
				// HTTP-Signatureの検証: activity.actor の公開鍵でsignature が検証できるかを確かめる
				const errorLogger = (message: any) => this.logger.error(message);
				httpSignatureValidated = await verifyDraftSignature(signature, authUser.key.keyPem, errorLogger) && authUser.user.uri !== getApId(activity.actor);
			}
		} else {
			httpSignatureError = "no signature found";
		}

		// HTTP-Signature が存在しない場合や、HTTP-Signature の検証に失敗した場合、JSON LD Signatureによる検証を行う。
		if (!httpSignatureValidated) {
			const ldSignature = activity.signature;
			// creator がない場合もLD Signature 検証失敗とする
			if (ldSignature && ldSignature.creator) {
				if (ldSignature.type !== 'RsaSignature2017') {
					throw new Bull.UnrecoverableError(`skip: unsupported LD-signature type ${ldSignature.type}`);
				}

				authUser = await this.apDbResolverService.getAuthUserFromApId(actorUri, ldSignature.creator);

				if (authUser == null || authUser.user == null) {
					throw new Bull.UnrecoverableError(`deny: HTTP-Signature の検証に失敗 (${httpSignatureError})し、LD-Signatureに指定されたユーザーを解決できませんでした。`);
				}

				if (authUser.key == null) {
					throw new Bull.UnrecoverableError(`deny: HTTP-Signature の検証に失敗 (${httpSignatureError})し、LD-Signatureに指定されたユーザーの公開鍵を取得できませんでした。`);
				}

				const jsonLd = this.jsonLdService.use();

				delete activity.signature;
				try {
					activity = await jsonLd.compact(activity) as IActivity;
				} catch (error) {
					throw new Bull.UnrecoverableError(`deny: HTTP-Signature failed (${httpSignatureError}) and can't compact activity for LD-Signature verification: ${error}`);
				}
				try {
					// Security: GHSA-2vxv-pv3m-3wvj
					// @included 指令などを悪用することにより、署名検証の前処理の正規化(compact)でJSONの構造が大きく変わり、
					// 署名者が署名した内容とは異なるデータを受容することを防ぐ
					jsonLd.checkForForbiddenDirectives(activity);
				} catch (error) {
					throw new Bull.UnrecoverableError(`deny: ${error}`);
				}
				// Security: ldSignatureの検証に使った公開鍵の所有者と、アクティビティのActorが一致することを確かめる
				const actorUriAfterCompaction = getApId(activity.actor);
				if (authUser.user.uri !== actorUriAfterCompaction) {
					throw new Bull.UnrecoverableError(`deny: LD-Signature user(${authUser.user.uri}) !== activity(after normalization).actor(${actorUri})`);
				}
				// Security: 正規化に関する未知の攻撃により、ブロックされているホストのアクティビティを受容することを防ぐ
				const ldHost = this.utilityService.extractDbHost(actorUriAfterCompaction);
				if (!this.utilityService.isFederationAllowedHost(ldHost)) {
					throw new Bull.UnrecoverableError(`Blocked request: ${ldHost}`);
				}

				//#region Log
				const compactedInfo = Object.assign({}, activity);
				delete compactedInfo['@context'];
				this.logger.debug(`compacted: ${JSON.stringify(compactedInfo, null, 2)}`);
				//#endregion

				activity.signature = ldSignature;

				jsonLd.freeze();

				// LD-Signature検証
				let verified;
				try {
					verified = await jsonLd.verifyRsaSignature2017(activity, authUser.key.keyPem);
					if (!verified) {
						throw new Bull.UnrecoverableError(`deny: HTTP-Signatureの検証に失敗 (${httpSignatureError})し、 LD-Signatureの検証に失敗しました`);
					}
				} catch (error) {
					if (error instanceof JsonLdError) {
						throw new Bull.UnrecoverableError(`deny: HTTP-Signature verification failed (${httpSignatureError}) and encountered a JSON-LD error while verifying signature: ${error}`);
					} else {
						throw error;
					}
				}
			} else {
				throw new Bull.UnrecoverableError(`deny: HTTP-Signature verification failed (${httpSignatureError}) and no valid LD-Signature found.`);
			}
		}

		// for typecheck, can't be reached
		if (authUser === null || authUser.user === null) {
			return 'failed';
		}
		let signVerifiedUser: MiRemoteUser = authUser.user;

		// Security: activity.idがあればホストが署名者のホストと一致することを確認する
		if (typeof activity.id === 'string') {
			const signerHost = this.utilityService.extractDbHost(signVerifiedUser.uri!);
			const activityIdHost = this.utilityService.extractDbHost(activity.id);
			if (signerHost !== activityIdHost) {
				throw new Bull.UnrecoverableError(`deny: signerHost(${signerHost}) !== activity.id host(${activityIdHost}`);
			}
		} else {
			throw new Bull.UnrecoverableError('deny: activity id is not a string');
		}

		this.apRequestChart.inbox();
		this.federationChart.inbox(signVerifiedUser.host);

		// Update instance stats
		process.nextTick(async () => {
			const i = await (this.meta.enableStatsForFederatedInstances
				? this.federatedInstanceService.fetchOrRegister(signVerifiedUser.host)
				: this.federatedInstanceService.fetch(signVerifiedUser.host));

			if (i == null) return;

			this.updateInstanceQueue.enqueue(i.id, {
				latestRequestReceivedAt: new Date(),
				shouldUnsuspend: i.suspensionState === 'autoSuspendedForNotResponding',
			});

			if (this.meta.enableChartsForFederatedInstances) {
				this.instanceChart.requestReceived(i.host);
			}

			this.fetchInstanceMetadataService.fetchInstanceMetadata(i);
		});

		// アクティビティを処理
		try {
			const result = await this.apInboxService.performActivity(signVerifiedUser, activity);
			if (result && !result.startsWith('ok')) {
				this.logger.warn(`inbox activity ignored (maybe): id=${activity.id} reason=${result}`);
				return result;
			}
		} catch (e) {
			if (e instanceof IdentifiableError) {
				switch (e.id) {
					case '689ee33f-f97c-479a-ac49-1b9f8140af99':
						return 'blocked notes with prohibited words';
					case '85ab9bd7-3a41-4530-959d-f07073900109':
						return 'actor has been suspended';
					case 'd450b8a9-48e4-4dab-ae36-f4db763fda7c': // invalid Note
						return e.message;
					case '9f466dab-c856-48cd-9e65-ff90ff750580':
						return 'note contains too many mentions';
					case '09d79f9e-64f1-4316-9cfa-e75c4d091574': // Instance is blocked
						return 'skip: blocked instance';
				}
			}
			throw e;
		}
		return 'ok';
	}

	@bindThis
	public collapseUpdateInstanceJobs(oldJob: UpdateInstanceJob, newJob: UpdateInstanceJob) {
		const latestRequestReceivedAt = oldJob.latestRequestReceivedAt < newJob.latestRequestReceivedAt
			? newJob.latestRequestReceivedAt
			: oldJob.latestRequestReceivedAt;
		const shouldUnsuspend = oldJob.shouldUnsuspend || newJob.shouldUnsuspend;
		return {
			latestRequestReceivedAt,
			shouldUnsuspend,
		};
	}

	@bindThis
	public async performUpdateInstance(id: string, job: UpdateInstanceJob) {
		await this.federatedInstanceService.update(id, {
			latestRequestReceivedAt: new Date(),
			isNotResponding: false,
			// もしサーバーが死んでるために配信が止まっていた場合には自動的に復活させてあげる
			suspensionState: job.shouldUnsuspend ? 'none' : undefined,
		});
	}

	@bindThis
	public async dispose(): Promise<void> {
		await this.updateInstanceQueue.performAllNow();
	}

	@bindThis
	async onApplicationShutdown(signal?: string) {
		await this.dispose();
	}
}

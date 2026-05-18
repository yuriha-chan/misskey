/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL, domainToASCII } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import RE2 from 're2';
import semver from 'semver';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { bindThis } from '@/decorators.js';
import { MiMeta, SoftwareSuspension } from '@/models/Meta.js';
import { MiInstance } from '@/models/Instance.js';

import { parseFilter } from '@/misc/parse-filter.js';

@Injectable()
export class UtilityService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,
	) {
	}

	@bindThis
	public getFullApAccount(username: string, host: string | null): string {
		return host ? `${username}@${this.toPuny(host)}` : `${username}@${this.toPuny(this.config.host)}`;
	}

	@bindThis
	public isSelfHost(host: string | null): boolean {
		if (host == null) return true;
		return this.toPuny(this.config.host) === this.toPuny(host);
	}

	@bindThis
	public isUriLocal(uri: string): boolean {
		return this.punyHost(uri) === this.toPuny(this.config.host);
	}

	// メールアドレスのバリデーションを行う
	// https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address
	@bindThis
	public validateEmailFormat(email: string): boolean {
		const regexp = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
		return regexp.test(email);
	}

	@bindThis
	public isBlockedHost(blockedHosts: string[], host: string | null): boolean {
		if (host == null) return false;
		return blockedHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`));
	}

	@bindThis
	public isSilencedHost(silencedHosts: string[] | undefined, host: string | null): boolean {
		if (!silencedHosts || host == null) return false;
		return silencedHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`));
	}

	@bindThis
	public isMediaSilencedHost(silencedHosts: string[] | undefined, host: string | null): boolean {
		if (!silencedHosts || host == null) return false;
		return silencedHosts.some(x => host.toLowerCase() === x);
	}

	@bindThis
	public concatNoteContentsForKeyWordCheck(content: {
		cw?: string | null;
		text?: string | null;
		pollChoices?: string[] | null;
		others?: string[] | null;
	}): string {
		/**
		 * ノートの内容を結合してキーワードチェック用の文字列を生成する
		 * cwとtextは内容が繋がっているかもしれないので間に何も入れずにチェックする
		 */
		return `${content.cw ?? ''}${content.text ?? ''}\n${(content.pollChoices ?? []).join('\n')}\n${(content.others ?? []).join('\n')}`;
	}

	@bindThis
	public isKeyWordIncluded(keyWords: string[], text: string, cw: string, pollChoices: string | '', files: string[] | []): boolean {
		if (keyWords.length === 0) return false;
		if (text === '' && cw === '' && files.length === 0) {
			return false;
		}

		const textAndChoices = pollChoices === '' ? text : text + '\n' + pollChoices;
		
		const coerceFloat = (v: any) =>
		  (typeof v === 'number') ? v :
		  (typeof v === 'string') ? parseFloat(v) :
		  v ? 1 : 0;

		const apply = function(node: any[], testText: string): any {
			try {
				switch (node[0]) {
					case "keyword": return testText.includes && testText.includes(node[1]);
					case "regexp":  return new RE2(node[1], node[2]).test(testText);
					case "slowRegexp": return new RegExp(node[1], node[2]).test(testText);
					case "and": return node.slice(1).every(n => apply(n, testText));
					case "or": return node.slice(1).some(n => apply(n, testText));
					case "not": return !apply(node[1], testText);
					case "poll": return (node[2].reduce((acc: number, v: any) => acc + apply(v, testText) === true ? 1 : 0) >= coerceFloat(node[1]));
					case "weighted": return coerceFloat(apply(node[2], testText)) * coerceFloat(node[1]);
					case "average": return node[1].reduce((acc: number, v: any) => acc + coerceFloat(apply(v, testText)));
					case "shorterThan": return testText.length < coerceFloat(node[1]);
					case "longerThan": return testText.length > coerceFloat(node[1]);
					case "hasFile": return files.length > 0;
					case "cw": return node.slice(1).every((n: any) => apply(n, cw));
					case "text": return node.slice(1).every((n: any) => apply(n, text));
					case "pollChoices": return node.slice(1).every((n: any) => apply(n, pollChoices));
					case "textAndChoices": return node.slice(1).every((n: any) => apply(n, textAndChoices));
					default: return false;
				}
			} catch (err) {
				return false;
			}
		}
		const nodes = keyWords.map(filter => {
			try {
				return parseFilter(filter, {});
			} catch (err) {
				// empty filter
				return ["or"];
			}
		});
		try {
			return nodes.some(n => apply(n, cw === '' ? textAndChoices : cw));
		} catch (err) {
			return false;
		}
	}

	@bindThis
	public extractDbHost(uri: string): string {
		const url = new URL(uri);
		return this.toPuny(url.host);
	}

	@bindThis
	public toPuny(host: string): string {
		return domainToASCII(host.toLowerCase());
	}

	@bindThis
	public toPunyNullable(host: string | null | undefined): string | null {
		if (host == null) return null;
		return domainToASCII(host.toLowerCase());
	}

	@bindThis
	public punyHost(url: string): string {
		const urlObj = new URL(url);
		const host = `${this.toPuny(urlObj.hostname)}${urlObj.port.length > 0 ? ':' + urlObj.port : ''}`;
		return host;
	}

	@bindThis
	public isFederationAllowedHost(host: string): boolean {
		if (this.isSelfHost(host)) return true;
		if (this.meta.federation === 'none') return false;
		if (this.meta.federation === 'specified' && !this.meta.federationHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`))) return false;
		if (this.isBlockedHost(this.meta.blockedHosts, host)) return false;

		return true;
	}

	@bindThis
	public isFederationAllowedUri(uri: string): boolean {
		const host = this.extractDbHost(uri);
		return this.isFederationAllowedHost(host);
	}

	@bindThis
	public isDeliverSuspendedSoftware(software: Pick<MiInstance, 'softwareName' | 'softwareVersion'>): SoftwareSuspension | undefined {
		if (software.softwareName == null) return undefined;
		if (software.softwareVersion == null) {
			// software version is null; suspend iff versionRange is *
			return this.meta.deliverSuspendedSoftware.find(x =>
				x.software === software.softwareName
				&& x.versionRange.trim() === '*');
		} else {
			const softwareVersion = software.softwareVersion;
			return this.meta.deliverSuspendedSoftware.find(x =>
				x.software === software.softwareName
				&& semver.satisfies(softwareVersion, x.versionRange, { includePrerelease: true }));
		}
	}
}

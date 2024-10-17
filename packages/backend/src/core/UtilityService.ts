/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL } from 'node:url';
import { toASCII } from 'punycode';
import { Inject, Injectable } from '@nestjs/common';
import RE2 from 're2';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { bindThis } from '@/decorators.js';
import { MiMeta } from '@/models/Meta.js';

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
		if (text === '' && cw === '' && files === []) {
			return false;
		}

		const textAndChoices = pollChoices === '' ? text : text + '\n' + pollChoices;
		
		const coerceFloat = v =>
		  (typeof v === 'number') ? v :
		  (typeof v === 'string') ? parseFloat(v) :
		  v ? 1 : 0;

		const apply = function(node, testText) {
			try {
				switch (node[0]) {
					case "keyword": return testText.includes && testText.includes(node[1]);
					case "regexp":  return new RE2(node[1], node[2]).test(testText);
					case "slowRegexp": return new RegExp(node[1], node[2]).test(testText);
					case "and": return node.slice(1).every(n => apply(n, testText));
					case "or": return node.slice(1).some(n => apply(n, testText));
					case "not": return !apply(node[1], testText);
					case "poll": return (node[2].reduce((acc, v) => acc + apply(v, testText) === true ? 1 : 0) >= coerceFloat(node[1]));
					case "weighted": return coerceFloat(apply(node[2], testText)) * coerceFloat(node[1]);
					case "average": return node[1].reduce((acc, v) => acc + coerceFloat(apply(v, testText)));
					case "shorterThan": return testText.length < coerceFloat(node[1]);
					case "longerThan": return  testText.length > coerceFloat(node[1]);
					case "hasFile": return files.length > 0;
					case "cw": return node.slice(1).every(n => apply(n, cw));
					case "text": return node.slice(1).every(n => apply(n, text));
					case "pollChoices": return node.slice(1).every(n => apply(n, pollChoices));
					case "textAndChoices": return node.slice(1).every(n => apply(n, textAndChoices));
					default: return false;
				}
			} catch (err) {
				return false;
			}
		}
		const nodes = keyWords.map(filter => {
			try {
				return parseFilter(filter);
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
		return this.toPuny(url.hostname);
	}

	@bindThis
	public toPuny(host: string): string {
		return toASCII(host.toLowerCase());
	}

	@bindThis
	public toPunyNullable(host: string | null | undefined): string | null {
		if (host == null) return null;
		return toASCII(host.toLowerCase());
	}

	@bindThis
	public isFederationAllowedHost(host: string): boolean {
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
}

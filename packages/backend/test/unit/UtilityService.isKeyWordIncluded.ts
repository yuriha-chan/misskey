/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { parseFilter } from '@/misc/parse-filter.js';
import { UtilityService } from '@/core/UtilityService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/Meta.js';

type FileEntry = { isSensitive: boolean };

function sf(sensitive: boolean): FileEntry {
	return { isSensitive: sensitive };
}

function makeService() {
	return new UtilityService({} as Config, {
		prohibitedWords: [],
		sensitiveWords: [],
		prohibitedWordsForNameOfUser: [],
		r18Filter: [],
	} as unknown as MiMeta, new LoggerService());
}

// ── parseFilter (parser unit) ─────────────────────────────────────────────

describe('parseFilter', () => {
	test('bare keyword', () => {
		expect(parseFilter('hello', {})).toEqual([
			'and',
			['keyword', 'hello'],
		]);
	});

	test('quoted keyword (double quote)', () => {
		expect(parseFilter('"hello world"', {})).toEqual([
			'and',
			['keyword', 'hello world'],
		]);
	});

	test('quoted keyword (single quote)', () => {
		expect(parseFilter("'hello world'", {})).toEqual([
			'and',
			['keyword', 'hello world'],
		]);
	});

	test('regexp with modifier', () => {
		expect(parseFilter('/foo/i', {})).toEqual([
			'and',
			['regexp', 'foo', 'i'],
		]);
	});

	test('regexp without modifier', () => {
		expect(parseFilter('/foo/', {})).toEqual([
			'and',
			['regexp', 'foo', ''],
		]);
	});

	test('slow regexp', () => {
		expect(parseFilter('slow/foo/i', {})).toEqual([
			'and',
			['slowRegexp', 'foo', 'i'],
		]);
	});

	test('space-separated AND keywords', () => {
		expect(parseFilter('a b', {})).toEqual([
			'and',
			['keyword', 'a'],
			['keyword', 'b'],
		]);
	});

	test('s-expression: and', () => {
		const result = parseFilter('(and hello world)', {});
		expect(result).toEqual([
			'and',
			['and', ['keyword', 'hello'], ['keyword', 'world']],
		]);
	});

	test('s-expression: or', () => {
		const result = parseFilter('(or hello world)', {});
		expect(result).toEqual([
			'and',
			['or', ['keyword', 'hello'], ['keyword', 'world']],
		]);
	});

	test('nested: or of ands', () => {
		const result = parseFilter('(or (and hello world) hello)', {});
		expect(result).toEqual([
			'and',
			['or', ['and', ['keyword', 'hello'], ['keyword', 'world']], ['keyword', 'hello']],
		]);
	});

	test('shorterThan', () => {
		expect(parseFilter('(shorterThan 140)', {})).toEqual([
			'and',
			['shorterThan', 140],
		]);
	});

	test('longerThan', () => {
		expect(parseFilter('(longerThan 10)', {})).toEqual([
			'and',
			['longerThan', 10],
		]);
	});

	test('hasFile', () => {
		expect(parseFilter('(hasFile)', {})).toEqual([
			'and',
			['hasFile'],
		]);
	});

	test('hasSensitiveFile', () => {
		expect(parseFilter('(hasSensitiveFile)', {})).toEqual([
			'and',
			['hasSensitiveFile'],
		]);
	});

	test('instance', () => {
		expect(parseFilter('(instance misskey)', {})).toEqual([
			'and',
			['instance', ['keyword', 'misskey']],
		]);
	});

	test('instance with multiple args', () => {
		expect(parseFilter('(instance misskey io)', {})).toEqual([
			'and',
			['instance', ['keyword', 'misskey'], ['keyword', 'io']],
		]);
	});

	test('empty string falls back to ["or"] (parse failure)', () => {
		expect(() => parseFilter('', {})).toThrow();
	});

	test('invalid syntax throws', () => {
		expect(() => parseFilter(')', {})).toThrow();
	});

	test('-prefixed bareword parses as keyword', () => {
		expect(parseFilter('-foo', {})).toEqual([
			'and',
			['keyword', '-foo'],
		]);
	});

	test('s-expression with unknown function name', () => {
		expect(parseFilter('(unknownFn hello)', {})).toEqual([
			'and',
			['unknownFn', ['keyword', 'hello']],
		]);
	});
});

// ── isKeyWordIncluded (integration: parser + evaluator) ───────────────────

describe('isKeyWordIncluded', () => {
	const svc = makeService();

	// ── Empty / short-circuit ──

	test('empty keyWords → false', () => {
		expect(svc.isKeyWordIncluded([], 'text', '', '', [], null)).toBe(false);
	});

	test('empty text + cw + files → false', () => {
		expect(svc.isKeyWordIncluded(['hello'], '', '', '', [], null)).toBe(false);
	});

	test('empty text but has files + hasFile filter → true', () => {
		expect(svc.isKeyWordIncluded(['(hasFile)'], '', '', '', [sf(false)], null)).toBe(true);
	});

	// ── keyword ──

	test('keyword matches substring', () => {
		expect(svc.isKeyWordIncluded(['hello'], 'hello world', '', '', [], null)).toBe(true);
	});

	test('keyword does not match', () => {
		expect(svc.isKeyWordIncluded(['xyz'], 'hello world', '', '', [], null)).toBe(false);
	});

	test('multiple keyWords: any match', () => {
		expect(svc.isKeyWordIncluded(['alpha', 'beta'], 'beta test', '', '', [], null)).toBe(true);
	});

	test('multiple keyWords: none match', () => {
		expect(svc.isKeyWordIncluded(['alpha', 'beta'], 'gamma test', '', '', [], null)).toBe(false);
	});

	// ── regexp ──

	test('regexp matches', () => {
		expect(svc.isKeyWordIncluded(['/foo/i'], 'hello FOO world', '', '', [], null)).toBe(true);
	});

	test('regexp does not match', () => {
		expect(svc.isKeyWordIncluded(['/foo/'], 'hello bar world', '', '', [], null)).toBe(false);
	});

	test('regexp with bad pattern → false (not throw)', () => {
		expect(svc.isKeyWordIncluded(['/[invalid/'], 'text', '', '', [], null)).toBe(false);
	});

	// ── slow regexp ──

	test('slowRegexp matches', () => {
		expect(svc.isKeyWordIncluded(['slow/foo/i'], 'hello FOO world', '', '', [], null)).toBe(true);
	});

	test('slowRegexp does not match', () => {
		expect(svc.isKeyWordIncluded(['slow/bar/'], 'hello foo world', '', '', [], null)).toBe(false);
	});

	test('slowRegexp with bad pattern → false (not throw)', () => {
		expect(svc.isKeyWordIncluded(['slow/[invalid/'], 'text', '', '', [], null)).toBe(false);
	});

	// ── and / or ──

	test('and: all match → true', () => {
		expect(svc.isKeyWordIncluded(['(and hello world)'], 'hello world', '', '', [], null)).toBe(true);
	});

	test('and: one fails → false', () => {
		expect(svc.isKeyWordIncluded(['(and hello xyz)'], 'hello world', '', '', [], null)).toBe(false);
	});

	test('or: any match → true', () => {
		expect(svc.isKeyWordIncluded(['(or xyz hello)'], 'hello world', '', '', [], null)).toBe(true);
	});

	test('or: none match → false', () => {
		expect(svc.isKeyWordIncluded(['(or xyz abc)'], 'hello world', '', '', [], null)).toBe(false);
	});

	// ── not ──

	test('not negates match', () => {
		expect(svc.isKeyWordIncluded(['(not hello)'], 'hello world', '', '', [], null)).toBe(false);
	});

	test('not negates non-match', () => {
		expect(svc.isKeyWordIncluded(['(not xyz)'], 'hello world', '', '', [], null)).toBe(true);
	});

	// ── shorterThan / longerThan ──

	test('shorterThan: below threshold → true', () => {
		expect(svc.isKeyWordIncluded(['(shorterThan 10)'], 'short', '', '', [], null)).toBe(true);
	});

	test('shorterThan: at threshold → false', () => {
		expect(svc.isKeyWordIncluded(['(shorterThan 5)'], 'hello', '', '', [], null)).toBe(false);
	});

	test('shorterThan: above threshold → false', () => {
		expect(svc.isKeyWordIncluded(['(shorterThan 3)'], 'hello', '', '', [], null)).toBe(false);
	});

	test('longerThan: above threshold → true', () => {
		expect(svc.isKeyWordIncluded(['(longerThan 3)'], 'hello', '', '', [], null)).toBe(true);
	});

	test('longerThan: at threshold → false', () => {
		expect(svc.isKeyWordIncluded(['(longerThan 5)'], 'hello', '', '', [], null)).toBe(false);
	});

	test('longerThan: below threshold → false', () => {
		expect(svc.isKeyWordIncluded(['(longerThan 10)'], 'short', '', '', [], null)).toBe(false);
	});

	// ── hasFile ──

	test('hasFile with files → true', () => {
		expect(svc.isKeyWordIncluded(['(hasFile)'], '', '', '', [sf(false)], null)).toBe(true);
	});

	test('hasFile without files → false', () => {
		expect(svc.isKeyWordIncluded(['(hasFile)'], 'text', '', '', [], null)).toBe(false);
	});

	test('hasFile with empty array → false', () => {
		expect(svc.isKeyWordIncluded(['(hasFile)'], 'text', '', '', [], null)).toBe(false);
	});

	// ── hasSensitiveFile ──

	test('hasSensitiveFile: one sensitive → true', () => {
		expect(svc.isKeyWordIncluded(['(hasSensitiveFile)'], '', '', '', [sf(true)], null)).toBe(true);
	});

	test('hasSensitiveFile: all non-sensitive → false', () => {
		expect(svc.isKeyWordIncluded(['(hasSensitiveFile)'], '', '', '', [sf(false), sf(false)], null)).toBe(false);
	});

	test('hasSensitiveFile: mixed, one sensitive → true', () => {
		expect(svc.isKeyWordIncluded(['(hasSensitiveFile)'], '', '', '', [sf(false), sf(true), sf(false)], null)).toBe(true);
	});

	test('hasSensitiveFile: no files → false', () => {
		expect(svc.isKeyWordIncluded(['(hasSensitiveFile)'], 'text', '', '', [], null)).toBe(false);
	});

	// ── instance ──

	test('instance: matches host substring', () => {
		expect(svc.isKeyWordIncluded(['(instance misskey)'], '', '', '', [], 'misskey.io')).toBe(true);
	});

	test('instance: does not match unrelated host', () => {
		expect(svc.isKeyWordIncluded(['(instance misskey)'], '', '', '', [], 'example.com')).toBe(false);
	});

	test('instance: null host (local user) → false', () => {
		expect(svc.isKeyWordIncluded(['(instance misskey)'], '', '', '', [], null)).toBe(false);
	});

	test('instance: multiple args AND semantics', () => {
		expect(svc.isKeyWordIncluded(['(instance misskey io)'], '', '', '', [], 'misskey.io')).toBe(true);
	});

	test('instance: multiple args, only one matches → false', () => {
		expect(svc.isKeyWordIncluded(['(instance misskey example)'], '', '', '', [], 'misskey.io')).toBe(false);
	});

	// ── cw scoping ──

	test('cw scoping: match in cw', () => {
		expect(svc.isKeyWordIncluded(['(cw secret)'], 'text', 'this is secret content', '', [], null)).toBe(true);
	});

	test('cw scoping: no match in cw (only in text)', () => {
		expect(svc.isKeyWordIncluded(['(cw secret)'], 'this is secret content', 'clean', '', [], null)).toBe(false);
	});

	// ── text scoping ──

	test('text scoping: match in text', () => {
		expect(svc.isKeyWordIncluded(['(text body)'], 'body text', 'header text', '', [], null)).toBe(true);
	});

	test('text scoping: no match in text', () => {
		expect(svc.isKeyWordIncluded(['(text body)'], 'clean', 'body text', '', [], null)).toBe(false);
	});

	// ── pollChoices scoping ──

	test('pollChoices scoping: match in choices', () => {
		expect(svc.isKeyWordIncluded(['(pollChoices vote)'], 'x', '', 'vote\nyes\nno', [], null)).toBe(true);
	});

	test('pollChoices scoping: no match in choices', () => {
		expect(svc.isKeyWordIncluded(['(pollChoices nope)'], 'x', '', 'vote\nyes\nno', [], null)).toBe(false);
	});

	// ── textAndChoices scoping ──

	test('textAndChoices scoping: match in text', () => {
		expect(svc.isKeyWordIncluded(['(textAndChoices body)'], 'body text', '', 'choice1\nchoice2', [], null)).toBe(true);
	});

	test('textAndChoices scoping: match in choices', () => {
		expect(svc.isKeyWordIncluded(['(textAndChoices choice1)'], 'x', '', 'choice1\nchoice2', [], null)).toBe(true);
	});

	test('textAndChoices scoping: no match', () => {
		expect(svc.isKeyWordIncluded(['(textAndChoices nope)'], 'body text', '', 'choice1\nchoice2', [], null)).toBe(false);
	});

	// ── cw precedence ──

	test('cw non-empty: delegates testText to cw', () => {
		expect(svc.isKeyWordIncluded(['alert'], 'alert text', 'clean CW', '', [], null)).toBe(false);
	});

	test('cw non-empty: matches in cw', () => {
		expect(svc.isKeyWordIncluded(['alert'], 'clean text', 'alert CW', '', [], null)).toBe(true);
	});

	// ── invalid filter fallback ──

	test('invalid filter string → ["or"] fallback → never matches', () => {
		expect(svc.isKeyWordIncluded([')'], 'any text', '', '', [], null)).toBe(false);
	});

	// ── space-separated AND keyword behavior ──

	test('space-separated barewords: AND semantics', () => {
		expect(svc.isKeyWordIncluded(['hello world'], 'hello beautiful world', '', '', [], null)).toBe(true);
	});

	test('space-separated barewords: AND fail when one missing', () => {
		expect(svc.isKeyWordIncluded(['hello xyz'], 'hello world', '', '', [], null)).toBe(false);
	});

	// ── quoted multi-word: literal substring (not space-separated AND) ──

	test('quoted multi-word: literal substring match', () => {
		expect(svc.isKeyWordIncluded(['"hello world"'], 'this is hello world today', '', '', [], null)).toBe(true);
	});

	test('quoted multi-word: no match as separate words', () => {
		expect(svc.isKeyWordIncluded(['"hello world"'], 'hello beautiful world', '', '', [], null)).toBe(false);
	});

	// ── -prefixed bareword behavior ──

	test('-prefixed bareword matches as keyword', () => {
		expect(svc.isKeyWordIncluded(['-foo'], 'this contains -foo yes', '', '', [], null)).toBe(true);
	});

	// ── not + cw ──

	test('not with cw', () => {
		expect(svc.isKeyWordIncluded(['(not (cw bad))'], 'text', 'good', '', [], null)).toBe(true);
		expect(svc.isKeyWordIncluded(['(not (cw bad))'], 'text', 'bad', '', [], null)).toBe(false);
	});
});

// ── poll operator ──

describe('poll operator', () => {
	const svc = makeService();

	test('poll: 2+ matches with threshold 2 → true', () => {
		const result = svc.isKeyWordIncluded(
			['(poll 2 alpha beta gamma)'],
			'alpha beta test',
			'', '', [], null,
		);
		expect(result).toBe(true);
	});

	test('poll: 1 match with threshold 2 → should be false', () => {
		const result = svc.isKeyWordIncluded(
			['(poll 2 alpha beta gamma)'],
			'alpha test',
			'', '', [], null,
		);
		expect(result).toBe(false);
	});

	test('poll: 1 match with threshold 1 → should be true', () => {
		const result = svc.isKeyWordIncluded(
			['(poll 1 alpha beta)'],
			'alpha test',
			'', '', [], null,
		);
		expect(result).toBe(true);
	});
});

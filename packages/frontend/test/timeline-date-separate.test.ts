/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect } from 'vitest';
import {
	getDateText,
	isSeparatorNeeded,
	getSeparatorInfo,
} from '@/utility/timeline-date-separate.js';

describe('getDateText', () => {
	test('returns M/D format', () => {
		const d = new Date('2024-01-15T12:00:00Z');
		expect(getDateText(d)).toBe('1/15');
	});

	test('pad zero not used for month and date', () => {
		const d = new Date('2024-12-05T12:00:00Z');
		expect(getDateText(d)).toBe('12/5');
	});

	test('returns date text for first day of year', () => {
		const d = new Date('2024-01-01T00:00:00Z');
		expect(getDateText(d)).toBe('1/1');
	});
});

describe('isSeparatorNeeded', () => {
	test('same day returns false', () => {
		expect(isSeparatorNeeded(
			'2024-01-15T10:00:00Z',
			'2024-01-15T12:00:00Z',
		)).toBe(false);
	});

	test('different day returns true', () => {
		expect(isSeparatorNeeded(
			'2024-01-15T10:00:00Z',
			'2024-01-16T10:00:00Z',
		)).toBe(true);
	});

	test('different month returns true', () => {
		expect(isSeparatorNeeded(
			'2024-01-31T10:00:00Z',
			'2024-02-01T10:00:00Z',
		)).toBe(true);
	});

	test('different year returns true', () => {
		expect(isSeparatorNeeded(
			'2024-12-31T10:00:00Z',
			'2025-01-01T10:00:00Z',
		)).toBe(true);
	});

	test('null prev returns false', () => {
		expect(isSeparatorNeeded(null, '2024-01-15T12:00:00Z')).toBe(false);
	});

	test('null next returns false', () => {
		expect(isSeparatorNeeded('2024-01-15T10:00:00Z', null)).toBe(false);
	});

	test('both null returns false', () => {
		expect(isSeparatorNeeded(null, null)).toBe(false);
	});
});

describe('getSeparatorInfo', () => {
	test('returns date info for two non-null dates', () => {
		const info = getSeparatorInfo(
			'2024-01-15T10:00:00Z',
			'2024-01-15T12:00:00Z',
		);
		expect(info).not.toBeNull();
		expect(info!.prevText).toBe('1/15');
		expect(info!.nextText).toBe('1/15');
	});

	test('different day returns different date texts', () => {
		const info = getSeparatorInfo(
			'2024-01-15T10:00:00Z',
			'2024-01-16T10:00:00Z',
		);
		expect(info).not.toBeNull();
		expect(info!.prevText).toBe('1/15');
		expect(info!.nextText).toBe('1/16');
	});

	test('null inputs return null', () => {
		expect(getSeparatorInfo(null, '2024-01-15T12:00:00Z')).toBeNull();
		expect(getSeparatorInfo('2024-01-15T12:00:00Z', null)).toBeNull();
		expect(getSeparatorInfo(null, null)).toBeNull();
	});
});

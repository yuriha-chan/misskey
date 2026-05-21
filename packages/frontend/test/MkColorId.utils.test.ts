/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect } from 'vitest';
import { calcHue } from '@/components/MkColorId.utils.js';

describe('calcHue', () => {
	test('returns a number between 0 and 350', () => {
		const result = calcHue('abcde', 13);
		expect(result).toBeGreaterThanOrEqual(0);
		expect(result).toBeLessThanOrEqual(350);
		expect(result % 10).toBe(0);
	});

	test('same input produces same output', () => {
		expect(calcHue('hello', 13)).toBe(calcHue('hello', 13));
		expect(calcHue('hello', 7)).toBe(calcHue('hello', 7));
	});

	test('different segments produce different hues (typically)', () => {
		const h1 = calcHue('abcde', 13);
		const h2 = calcHue('fghij', 13);
		expect(h1).not.toBe(h2);
	});

	test('different multipliers produce different hues', () => {
		expect(calcHue('abcde', 13)).not.toBe(calcHue('abcde', 7));
	});

	test('empty string', () => {
		const result = calcHue('', 13);
		expect(result).toBeGreaterThanOrEqual(0);
		expect(result).toBeLessThanOrEqual(350);
	});

	test('single character', () => {
		expect(calcHue('a', 13)).toBeGreaterThanOrEqual(0);
	});

	test('long string', () => {
		const result = calcHue('abcdefghijklmnopqrstuvwxyz0123456789', 13);
		expect(Math.abs(result % 10)).toBe(0);
	});
});

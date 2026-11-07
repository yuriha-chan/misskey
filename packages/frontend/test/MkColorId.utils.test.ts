/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect } from 'vitest';
import { calcHue } from '@/components/MkColorId.utils.js';

describe('calcHue', () => {
	test('returns a number between 0 and 360', () => {
		const result = calcHue('abcde', 13);
		expect(result).toBeGreaterThanOrEqual(0);
		expect(result).toBeLessThan(360);
		expect(result % 10).toBe(0);
	});

	test('same input produces same output', () => {
		expect(calcHue('hello', 13)).toBe(calcHue('hello', 13));
		expect(calcHue('hello', 7)).toBe(calcHue('hello', 7));
	});

	test('different input typically yields different hue', () => {
		const h1 = calcHue('abcde', 13);
		const h2 = calcHue('abode', 13);
		const h3 = calcHue('abade', 13);
		expect(h1 !== h2 || h1 !== h3).toBe(true);

		const h4 = calcHue('abcd0', 13);
		const h5 = calcHue('abcd1', 13);
		const h6 = calcHue('abcd2', 13);
		expect(h4 !== h5 || h4 !== h6).toBe(true);
	});

	test('different multipliers produce different hues', () => {
		expect(calcHue('abcde', 13)).not.toBe(calcHue('abcde', 7));
	});

	test('empty string', () => {
		const result = calcHue('', 13);
		expect(result).toBeGreaterThanOrEqual(0);
		expect(result).toBeLessThan(360);
	});

	test('single character', () => {
		const result = calcHue('a', 13);
		expect(result).toBeGreaterThanOrEqual(0);
		expect(result).toBeLessThan(360);
		expect(result % 10).toBe(0);
	});

	test('long string', () => {
		const result = calcHue('abcdefghijklmnopqrstuvwxyz0123456789', 13);
		expect(Math.abs(result % 10)).toBe(0);
	});
});

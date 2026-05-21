/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function calcHue(segment: string, p: number): number {
	const hash = p * Array.from(segment).reduce((s: number, char: string) => (s * p) ^ char.charCodeAt(0), 0);
	const value = hash % 36;
	const hue = value * 10;
	return hue;
}

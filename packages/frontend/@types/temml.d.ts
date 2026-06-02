/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

declare module 'temml/dist/temml.mjs' {
	interface TemmlOptions {
		displayMode?: boolean;
	}
	declare const temml: {
		render(latex: string, node: HTMLElement, options?: TemmlOptions): HTMLElement;
	};
	export default temml;
}

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { render, fireEvent } from '@testing-library/vue';
import { describe, expect, test, vi } from 'vitest';
import MkPageHeader from '@/components/global/MkPageHeader.vue';

vi.mock('@/accounts.js', () => ({ getAccountMenu: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/os.js', () => ({ popupMenu: vi.fn() }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));

describe('page header actions', () => {
	test('keeps unmarked actions icon-only and shows the explicitly requested Leave label', () => {
		const wrapper = render(MkPageHeader, {
			props: {
				actions: [
					{ text: 'Invite', icon: 'ti ti-plus', handler: vi.fn() },
					{ text: 'Leave', icon: 'ti ti-check', showText: true, handler: vi.fn() },
					{ text: 'Tooltip only', icon: 'ti ti-x', showText: false, handler: vi.fn() },
					{ icon: 'ti ti-menu', handler: vi.fn() },
				],
			},
			global: { directives: { tooltip: {} } },
		});
		try {
			const buttons = wrapper.getAllByRole('button');
			expect(buttons).toHaveLength(4);
			expect(buttons.map(button => button.textContent)).toEqual(['', 'Leave', '', '']);
			expect(buttons[3].querySelector('i')?.classList.contains('ti-menu')).toBe(true);
		} finally {
			wrapper.unmount();
		}
	});

	test('retains the action handler on labeled buttons', async () => {
		const handler = vi.fn();
		const wrapper = render(MkPageHeader, {
			props: { actions: [{ text: 'Leave', icon: 'ti ti-plus', showText: true, handler }] },
			global: { directives: { tooltip: {} } },
		});
		try {
			await fireEvent.click(wrapper.getByRole('button'));
			expect(handler).toHaveBeenCalledOnce();
		} finally {
			wrapper.unmount();
		}
	});
});

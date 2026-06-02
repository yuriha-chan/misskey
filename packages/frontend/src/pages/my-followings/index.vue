<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="recent" :actions="headerActions" :tabs="headerTabs" :swipable="true">
	<div>
	<MkSpacer :contentMax="1000">
		<Transition name="fade" mode="out-in">
			<XFollowingsUpdatesList :anchorDate="anchorDate"/>
		</Transition>
	</MkSpacer>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import XFollowingsUpdatesList from './followings-updates-list.vue';
import MkRadios from '@/components/MkRadios.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';

const ONE_HOUR = 3.6e+6;
const ONE_DAY = 8.64e+7;
const tabOptions = [
  { key: '1h', ms: ONE_HOUR, title: i18n.tsx.recentNHours({n: 1}) },
  { key: '1d', ms: ONE_DAY, title: i18n.tsx.recentNDays({n: 1}) },
  { key: '3d', ms: 3 * ONE_DAY, title: i18n.tsx.recentNDays({n: 3}) },
  { key: '7d', ms: 7 * ONE_DAY, title: i18n.tsx.recentNDays({n: 7}) },
  { key: '30d', ms: 30 * ONE_DAY, title: i18n.tsx.recentNDays({n: 30}) },
] as const;

const recent = ref(tabOptions[1].key);
const headerActions = computed(() => []);

const headerTabs = computed(() => tabOptions.map(t => ({ key: t.key, title: t.title })));

const anchorDate = computed(() => {
  const opt = tabOptions.find(t => t.key === recent.value);
  const ms = opt?.ms ?? ONE_DAY;
  return Date.now() - ms;
});

definePage(() => ({
	title: i18n.ts.followingsUpdates,
	path: `/my/followings-updates`,
}));
</script>

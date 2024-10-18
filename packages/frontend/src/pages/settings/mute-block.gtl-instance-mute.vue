<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<MkInfo>{{ i18n.ts._instanceGtlMute.title }}</MkInfo>
	<MkTextarea v-model="instanceGtlMutes">
		<template #label>{{ i18n.ts._instanceGtlMute.heading }}</template>
		<template #caption>{{ i18n.ts._instanceGtlMute.instanceMuteDescription }}<br>{{ i18n.ts._instanceGtlMute.instanceMuteDescription2 }}</template>
	</MkTextarea>
	<MkButton primary :disabled="!changed" @click="save()"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
</div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkButton from '@/components/MkButton.vue';
import { signinRequired } from '@/account.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { i18n } from '@/i18n.js';

const $i = signinRequired();

const instanceGtlMutes = ref($i!.gtlMutedInstances.join('\n'));
const changed = ref(false);

async function save() {
	const gtlMutes = instanceGtlMutes.value
		.trim().split('\n')
		.map(el => el.trim())
		.filter(el => el);

	await misskeyApi('i/update', {
		gtlMutedInstances: gtlMutes,
	});

	changed.value = false;

	// Refresh filtered list to signal to the user how they've been saved
	instanceGtlMutes.value = mutes.join('\n');
}

watch(instanceGtlMutes, () => {
	changed.value = true;
});
</script>

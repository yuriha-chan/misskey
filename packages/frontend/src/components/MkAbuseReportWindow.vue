<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkWindow ref="uiWindow" :initialWidth="400" :initialHeight="500" :canResize="true" @closed="emit('closed')">
	<template #header>
		<i class="ti ti-exclamation-circle" style="margin-right: 0.5em;"></i>
		<span>{{ i18n.ts.contactAdmin }}</span>
	</template>
	<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
		<div class="_gaps_m" :class="$style.root">
		<MkSelect v-model="reason" :items="reasonItems" large>
			<template #label>{{ i18n.ts.contactAdminReason }}</template>
		</MkSelect>
			<div class="">
				<MkTextarea v-model="comment">
					<template #label>{{ i18n.ts.details }}</template>
					<template #caption>{{ i18n.ts.fillReportDescription }}</template>
				</MkTextarea>
			</div>
			<div v-if="guideReportNote">{{ i18n.ts.guideReportNote }}</div>
			<div class="">
				<MkButton primary full :disabled="comment.length === 0" @click="send">{{ i18n.ts.send }}</MkButton>
			</div>
		</div>
	</div>
</MkWindow>
</template>

<script setup lang="ts">
import { ref, useTemplateRef, computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkSelect, { type MkSelectItem } from '@/components/MkSelect.vue';
import MkWindow from '@/components/MkWindow.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	user: Misskey.entities.UserLite;
	initialComment?: string;
	guideReportNote?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const uiWindow = useTemplateRef('uiWindow');
const comment = ref(props.initialComment ?? '');
const reason = ref();

const reasonItems = computed<MkSelectItem<string>[]>(() => [
	{ type: 'group', label: i18n.ts._contactAdminReason.abuse, items: [
		{ value: 'spam', label: i18n.ts._contactAdminReason.spam },
		{ value: 'privacy', label: i18n.ts._contactAdminReason.privacy },
		{ value: 'attack', label: i18n.ts._contactAdminReason.attack },
		{ value: 'obscene', label: i18n.ts._contactAdminReason.obscene },
		{ value: 'abuseOther', label: i18n.ts._contactAdminReason.abuseOther },
	]},
	{ type: 'group', label: i18n.ts._contactAdminReason.help, items: [
		{ value: 'technical', label: i18n.ts._contactAdminReason.technical },
		{ value: 'mental', label: i18n.ts._contactAdminReason.mental },
		{ value: 'falsePositive', label: i18n.ts._contactAdminReason.falsePositive },
		{ value: 'helpOther', label: i18n.ts._contactAdminReason.helpOther },
	]},
	{ type: 'group', label: i18n.ts._contactAdminReason.good, items: [
		{ value: 'ethical', label: i18n.ts._contactAdminReason.ethical },
	]},
]);

function send() {
	os.apiWithDialog('users/report-abuse', {
		userId: props.user.id,
		comment: comment.value,
		reason: reason.value,
	}, undefined).then(res => {
		os.alert({
			type: 'success',
			text: i18n.ts.reportCompleted,
		});
		uiWindow.value?.close();
		emit('closed');
	});
}
</script>

<style lang="scss" module>
.root {
	--root-margin: 16px;
}
</style>

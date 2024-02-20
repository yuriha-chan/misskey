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
	<MkSpacer :marginMin="20" :marginMax="28">
		<div class="_gaps_m" :class="$style.root">
	                <MkSelect v-model="reason" large>
				<template #label>{{ i18n.ts.contactAdminReason }}</template>
				<optgroup :label="i18n.ts._contactAdminReason.abuse">
					<option key="abuse:spam" value="spam">{{ i18n.ts._contactAdminReason.spam }}</option>
					<option key="abuse:privacy" value="privacy">{{ i18n.ts._contactAdminReason.privacy }}</option>
					<option key="abuse:attack" value="attack">{{ i18n.ts._contactAdminReason.attack }}</option>
					<option key="abuse:obscene" value="obscene">{{ i18n.ts._contactAdminReason.obscene }}</option>
					<option key="abuse:abuseOther" value="abuseOther">{{ i18n.ts._contactAdminReason.abuseOther }}</option>
				</optgroup>
				<optgroup :label="i18n.ts._contactAdminReason.help">
					<option key="help:technical" value="technical">{{ i18n.ts._contactAdminReason.technical }}</option>
					<option key="help:mental" value="mental">{{ i18n.ts._contactAdminReason.mental }}</option>
					<option key="help:falsePositive" value="falsePositive">{{ i18n.ts._contactAdminReason.falsePositive }}</option>
					<option key="help:helpOther" value="helpOther">{{ i18n.ts._contactAdminReason.helpOther }}</option>
				</optgroup>
				<optgroup :label="i18n.ts._contactAdminReason.good">
					<option key="good:ethical" value="ethical">{{ i18n.ts._contactAdminReason.ethical }}</option>
				</optgroup>
			</MkSelect>
			<div class="">
				<MkTextarea v-model="comment">
					<template #label>{{ i18n.ts.details }}</template>
					<template #caption>{{ i18n.ts.fillReportDescription }}</template>
				</MkTextarea>
			</div>
			<div class="">
				<MkButton primary full :disabled="comment.length === 0" @click="send">{{ i18n.ts.send }}</MkButton>
			</div>
		</div>
	</MkSpacer>
</MkWindow>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkSelect from '@/components/MkSelect.vue';
import MkWindow from '@/components/MkWindow.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	user: Misskey.entities.UserDetailed;
	initialComment?: string;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const uiWindow = shallowRef<InstanceType<typeof MkWindow>>();
const comment = ref(props.initialComment ?? '');
const reason = ref();

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

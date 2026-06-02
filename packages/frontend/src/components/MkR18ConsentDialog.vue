<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="400"
	:height="450"
	:withOkButton="true"
	:okButtonDisabled="iAmAdult === null"
	@close="dialog?.close()"
	@closed="emit('closed')"
	@ok="ok()"
>
	<template #header>{{ i18n.ts.r18ConsentTitle }}</template>

	<div :class="$style.root">
		<div :class="$style.question">{{ i18n.ts.r18ConsentAreYouOver18 }}</div>
		<MkR18Toggle v-model="iAmAdult"/>
		<template v-if="iAmAdult === true">
			<div :class="$style.divider"/>
			<MkSwitch v-model="hideR18Value">
				{{ i18n.ts.hideR18Content }}
			</MkSwitch>
			<div>{{ i18n.ts.hideR18ContentDescription1 }}</div>
			<MkInfo>{{ i18n.ts.hideR18ContentDescription2 }}</MkInfo>
			<MkInfo>{{ i18n.ts.hideR18ContentDescription3 }}</MkInfo>
		</template>
		<template v-else>
			<MkInfo>{{ i18n.ts.r18ConsentUnder17Description }}</MkInfo>
		</template>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkR18Toggle from '@/components/MkR18Toggle.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');
const iAmAdult = ref<boolean | null>(null);
const hideR18Value = ref(prefer.s.hideR18Content as boolean);

function ok() {
	if (iAmAdult.value === false) {
		prefer.commit('hideR18Content', true);
	} else if (iAmAdult.value === true) {
		prefer.commit('hideR18Content', hideR18Value.value);
	}
	dialog.value?.close();
}
</script>

<style lang="scss" module>
.root {
	padding: 32px 32px 0;
}

.question {
	font-weight: bold;
	text-align: center;
	margin-bottom: 20px;
}

.divider {
	margin-top: 16px;
}
</style>

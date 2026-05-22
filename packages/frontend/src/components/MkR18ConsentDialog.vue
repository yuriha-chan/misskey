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
		<MkRadios v-model="iAmAdult" :options="ageOptions"/>

		<template v-if="iAmAdult === true">
			<div :class="$style.divider"/>
			<MkSwitch v-model="hideR18Value">
				{{ i18n.ts.hideR18Content }}
			</MkSwitch>
		</template>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { ref, computed, useTemplateRef } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');
const iAmAdult = ref<boolean | null>(null);
const hideR18Value = ref(prefer.s.hideR18Content as boolean);

const ageOptions = computed(() => [
	{ value: false, label: i18n.ts.r18ConsentUnder17 },
	{ value: true, label: i18n.ts.r18ConsentOver18 },
]);

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
	padding: 0 32px;
}

.question {
	font-weight: bold;
	margin-bottom: 16px;
}

.divider {
	margin-top: 16px;
}
</style>

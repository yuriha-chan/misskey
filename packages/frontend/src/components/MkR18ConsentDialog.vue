<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="modal" @close="emit('close')" @closed="emit('closed')">
	<template #header>{{ i18n.ts.r18ConsentTitle }}</template>
	<div class="_gaps_s">
		<div class="_panel" :class="$style.content">
			<div :class="$style.question">{{ i18n.ts.r18ConsentAreYouOver18 }}</div>
			<MkRadios v-model="iAmAdult" :options="ageOptions"/>
		</div>
		<div v-if="iAmAdult == null" class="_buttons">
			<MkButton primary disabled>{{ i18n.ts.save }}</MkButton>
		</div>
		<template v-if="iAmAdult === false">
			<div class="_buttons">
				<MkButton primary @click="save">{{ i18n.ts.save }}</MkButton>
			</div>
		</template>
		<template v-if="iAmAdult === true">
			<div class="_panel" :class="$style.content">
				<MkSwitch v-model="hideR18Value">
					{{ i18n.ts.hideR18Content }}
				</MkSwitch>
			</div>
			<div class="_buttons">
				<MkButton primary @click="save">{{ i18n.ts.save }}</MkButton>
			</div>
		</template>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const emit = defineEmits<{
	(ev: 'close'): void;
	(ev: 'closed'): void;
}>();

const iAmAdult = ref<boolean | null>(null);
const hideR18Value = ref(prefer.s.hideR18Content as boolean);

const ageOptions = computed(() => [
	{ value: false, label: i18n.ts.r18ConsentUnder17 },
	{ value: true, label: i18n.ts.r18ConsentOver18 },
]);

function save() {
	if (iAmAdult.value === false) {
		prefer.commit('hideR18Content', true);
	} else if (iAmAdult.value === true) {
		prefer.commit('hideR18Content', hideR18Value.value);
	}
	emit('close');
}
</script>

<style lang="scss" module>
.content {
	padding: 20px;
}

.question {
	font-weight: bold;
	margin-bottom: 12px;
}
</style>

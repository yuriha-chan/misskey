<template>
<MkWindow ref="uiWindow" :initialWidth="400" :initialHeight="450" @closed="emit('closed')">
	<template #header>{{ i18n.ts._chat.editSecret }}</template>
	<div style="display: flex; flex-direction: column; min-height: 100%;">
		<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px; flex-grow: 1;">
			<div class="_gaps_m">
				<MkInput v-model="title">
					<template #label>{{ i18n.ts._chat.secretTitle }}</template>
				</MkInput>
				<MkInput v-model="secret" required>
					<template #label>{{ i18n.ts._chat.secretContent }}</template>
				</MkInput>
				<MkSwitch v-model="autoReveal">
					<template #label>{{ i18n.ts._chat.autoReveal }}</template>
				</MkSwitch>
				<MkInput v-if="autoReveal" v-model.number="revealsAfter" type="number" min="10" max="3600" placeholder="10-3600 (in seconds)">
					<template #label>{{ i18n.ts._chat.revealsAfter }}</template>
					<template #suffix>{{ i18n.ts._time.second }}</template>
				</MkInput>
				<div>
					<MkButton primary full :disabled="secret.length === 0" @click="done">{{ i18n.ts.create }}</MkButton>
				</div>
			</div>
		</div>
	</div>
</MkWindow>
</template>
<script lang="ts" setup>
import { ref, useTemplateRef } from 'vue';
import { i18n } from '@/i18n.js';
import MkWindow from '@/components/MkWindow.vue';
import MkInput from '@/components/MkInput.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
const title = ref('');
const secret = ref('');
const autoReveal = ref(false);
const revealsAfter = ref(60);
const emit = defineEmits<{
	(ev: 'done', v: { updated?: any; created?: any }): void;
	(ev: 'closed'): void;
}>();
const uiWindow = useTemplateRef('uiWindow');

async function done() {
	emit('done', { created: { plaintext: secret, revealsAfter: autoReveal.value ? revealsAfter : null, title } });
	uiWindow.value?.close();
}
</script>

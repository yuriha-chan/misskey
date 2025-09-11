<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkWindow ref="uiWindow" :initialWidth="400" :initialHeight="400" @closed="emit('closed')">
	<template #header>Change Personal Chat Setting</template>
	<div style="display: flex; flex-direction: column; min-height: 100%;">
		<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px; flex-grow: 1;">
			<div class="_gaps_m">
				<MkSelect v-model="bubbleColor">
					<option :style="{ backgroundColor: color.lightColor }" v-for="color in bubbleColors" :value="JSON.stringify(color)">{{ color.lightColor }}</option>
				</MkSelect>
				<MkSelect v-model="bubbleStyle">
					<option value="00000000">fukidashi rounded</option>
					<option value="00000001">fukidashi rectangle</option>
					<option value="00000002">rounded</option>
					<option value="00000004">rectangle</option>
				</MkSelect>
				<div>
					<MkButton primary full @click="done">{{ i18n.ts.update }}</MkButton>
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
import MkSelect from '@/components/MkSelect.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
const props = defineProps<{
	room?: any,
}>();
const bubbleColor = ref('');
const bubbleStyle = ref('');

const emit = defineEmits<{
	(ev: 'done', v: { updated?: any; created?: any }): void;
	(ev: 'closed'): void;
}>();
const uiWindow = useTemplateRef('uiWindow');

const bubbleColors = [
	{ lightColor: "#f4fec1" },
	{ lightColor: "#e0ccde" },
	{ lightColor: "#d9f9a5" },
	{ lightColor: "#bdcedb" },
	{ lightColor: "#FFB2E6" }
]
 
async function done() {
	const created = await os.apiWithDialog('chat/rooms/edit-participation', {
		roomId: props.room.value.id,
		bubbleColor: bubbleColor.value,
		bubbleStyle: bubbleStyle.value
	});
	emit('done', { created });
	uiWindow.value?.close();
}
</script>

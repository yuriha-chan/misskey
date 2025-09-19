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
				<label class="label">{{ i18n.ts._chat.selectBubbleColor }}</label>
				<div :class="$style.itemSelect" role="list">
					<div v-for="(item, idx) in bubbleColors" :key="idx" :class="$style.itemOuter" role="listitem">
						<input
							:id="`option_${idx}`"
							class="sr-only"
							:class="$style.itemRadio"
							v-model="selectedId"
							type="radio"
							name="customItem"
							:value="idx"
							aria-labelledby="`label_${idx}`"
						/>
						<label :for="`option_${idx}`" :class="$style.itemRoot">
							<div class="$style.sampleItem" :style="{ 'MK_USER-fukidashi': item }" :id="`label_${idx}`">
								<MkFukidashi>Sample Text</MkFukidashi>
							</div>
						</label>
					</div>
				</div>
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
	"#ff6f61",
	"#6b5b95",
	"#88b04b",
	"#4caf50",
	"#8bc340",
	"#ffeb3b",
	"#92a8d1",
	"#ff69b4",
	"#ff6347",
]
 
async function done() {
	const created = await os.apiWithDialog('chat/rooms/update-membership', {
		roomId: props.room.value.id,
		bubbleColor: bubbleColor.value,
	});
	emit('done', { created });
	uiWindow.value?.close();
}
</script>

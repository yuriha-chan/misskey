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
							v-model="selectedColor"
							type="radio"
							name="customItem"
							:value="item"
							aria-labelledby="`label_${idx}`"
						/>
						<label :for="`option_${idx}`" :class="$style.itemRoot">
							<div class="$style.sampleItem" :style="{ '--MI_USER-fukidashi': item }" :id="`label_${idx}`">
								<MkFukidashi>{{ i18n.ts.sample }}</MkFukidashi>
							</div>
						</label>
					</div>
				</div>
				<div>
					<MkButton primary full :disabled="selectedColor === null" @click="done">{{ i18n.ts.update }}</MkButton>
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
import MkFukidashi from '@/components/MkFukidashi.vue';
import * as os from '@/os.js';
const props = defineProps<{
	roomId: string,
}>();
const bubbleColor = ref('');
const bubbleStyle = ref('');

const emit = defineEmits<{
	(ev: 'done', v: { updated?: any; created?: any }): void;
	(ev: 'closed'): void;
}>();
const uiWindow = useTemplateRef('uiWindow');
const selectedColor = ref(null);

const bubbleColors = [
	"#de3e93",
	"#ff6f61",
	"#ff7700",
	"#ffeb3b",
	"#81e014",
	"#19bd55",
	"#15ad96",
	"#1b86bf",
	"#1925d1",
	"#7519d1",
	"#4d5b80",
	"#5b8a6f",
	"#856b41",
	"#575759",
	"#cfcfd1",
]
 
async function done() {
	const created = await os.apiWithDialog('chat/rooms/update-membership', {
		roomId: props.roomId,
		bubbleColor: selectedColor.value,
	});
	emit('done', { created });
	uiWindow.value?.close();
}
</script>
<style module>
.itemSelect {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
	gap: 12px;
	align-items: start;
	padding: 4px 0;
}

.itemOuter {
	position: relative;
}

.itemRadio {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: -1px;
	padding: 0;
	border: 0;
	clip: rect(0 0 0 0);
	clip-path: inset(50%);
	overflow: hidden;
	white-space: nowrap;
	display: flex;
	align-items: center;
}

.itemRoot {
	display: flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	border: 2px solid var(--MI_THEME-divider);
	border-radius: 10px;
	overflow: hidden;
	background: var(--MI_THEME-bg);
	cursor: pointer;
	transition: border-color .13s ease, box-shadow .13s ease, transform .08s ease;
	position: relative;
	min-height: 70px;
	user-select: none;
}

/* checked state: radio + label */
.itemRadio:checked + .itemRoot {
	border-color: var(--MI_THEME-accent);
	box-shadow: 0 6px 18px rgba(59,130,246,0.12);
}

.itemRadio:focus-visible + .itemRoot {
	outline: 3px solid var(--MI_THEME-focus);
	outline-offset: 2px;
}

.itemRadio:checked + .itemRoot::after {
	content: "";
	position: absolute;
	top: 8px;
	right: 8px;
	width: 18px;
	height: 18px;
	border-radius: 50%;
	background: var(--MI_THEME-accent);
	box-shadow: 0 2px 6px rgba(0,0,0,0.12);
	display: block;
}

.itemPreview {
	display: block;
	width: 100%;
	height: 80px;
	border-bottom: 1px solid var(--MI_THEME-divider);
	box-sizing: border-box;
}

.itemCaption {
	padding: 8px 10px;
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-height: 36px;
	justify-content: center;
	text-overflow: ellipsis;
	overflow: hidden;
}

/* name and id styling */
.itemName {
	font-weight: 600;
	font-size: 120%;
	overflow: hidden;
	text-overflow: ellipsis;
	text-align: center;
}
.sr-only {
	position: absolute !important;
	width: 1px !important;
	height: 1px !important;
	padding: 0 !important;
	margin: -1px !important;
	overflow: hidden !important;
	clip: rect(0,0,0,0) !important;
	clip-path: inset(50%) !important;
	border: 0 !important;
}
</style>


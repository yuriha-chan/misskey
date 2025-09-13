<template>
	<MkWindow ref="uiWindow" :initialWidth="440" :initialHeight="560" @closed="emit('closed')">
		<template #header>{{ title }}</template>

		<div style="display:flex; flex-direction:column; min-height:100%;">
			<div class="_spacer" style="--MI_SPACER-min:16px; --MI_SPACER-max:24px; flex-grow:1;">
				<div class="_gaps_m">
					<label class="label">{{ i18n.ts._chat.selectVote }}</label>

					<div :class="$style.itemSelect" role="list">
						<div v-for="(item, idx) in items" :key="idx" :class="$style.itemOuter" role="listitem">
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
								<MkUserCardMini v-if="props.voteForUsers" :user="item" :withChart="false"/>
								<div v-else :class="$style.itemCaption" :id="`label_${idx}`">
									<div :class="$style.itemName">{{ item }}</div>
								</div>
							</label>
						</div>
					</div>

					<div style="margin-top:12px;">
						<MkButton primary full :disabled="selectedId === null" @click="done">{{ i18n.ts._chat.vote }}</MkButton>
					</div>
				</div>
			</div>
		</div>
	</MkWindow>
</template>

<script lang="ts" setup>
import { ref, computed, useTemplateRef } from 'vue';
import { i18n } from '@/i18n.js';
import MkWindow from '@/components/MkWindow.vue';
import MkButton from '@/components/MkButton.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';

const props = defineProps<{
	title?: string;
	options: (string | Misskey.entities.UserLite) [];
	voteForUsers: boolean;
	initialSelected?: string | null;
}>();

const emit = defineEmits<{
	(ev: 'done', v: { choice: integer; } | null): void;
	(ev: 'closed'): void;
}>();

const uiWindow = useTemplateRef('uiWindow');
const items = ref(props.options ?? []);
const selectedId = ref(null);

function done() {
	if (!selectedId.value === null) return;
	emit('done', { choice: selectedId.value });
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
	display: block;
	box-sizing: border-box;
	border: 2px solid var(--MI_THEME-divider);
	border-radius: 10px;
	overflow: hidden;
	background: var(--MI_THEME-bg);
	cursor: pointer;
	transition: border-color .13s ease, box-shadow .13s ease, transform .08s ease;
	position: relative;
	min-height: 112px;
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


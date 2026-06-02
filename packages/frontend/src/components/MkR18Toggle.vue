<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.toggle">
	<input id="r18-under17" data-testid="radio-under17" v-model="model" type="radio" :value="false" :class="$style.radio"/>
	<input id="r18-over18" data-testid="radio-over18" v-model="model" type="radio" :value="true" :class="$style.radio"/>
	<label for="r18-under17" :class="$style.labelUnder">{{ i18n.ts.r18ConsentUnder17OrNotToSay }}</label>
	<div ref="sliderEl" :class="$style.slider">
		<label for="r18-under17" :class="$style.hit"/>
		<span :class="$style.hit"/>
		<label for="r18-over18" :class="$style.hit"/>
		<div
			:class="[$style.knob, { [$style.dragging]: dragging }]"
			:style="knobDragStyle"
			@pointerdown.prevent="onKnobDown"
			@pointermove="onKnobMove"
			@pointerup="onKnobUp"
			@pointercancel="onKnobUp"
		></div>
	</div>
	<label for="r18-over18" :class="$style.labelOver">{{ i18n.ts.r18ConsentOver18 }}</label>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef } from 'vue';
import { i18n } from '@/i18n.js';

const model = defineModel<boolean | null>({ required: true });

const sliderEl = useTemplateRef('sliderEl');

const dragging = ref(false);
const knobLeftPx = ref(0);

const knobDragStyle = computed(() => {
	if (!dragging.value) return undefined;
	return { left: `${knobLeftPx.value}px`, transition: 'none' };
});

function onKnobDown(e: PointerEvent) {
	dragging.value = true;
	(e.target as HTMLElement).setPointerCapture(e.pointerId);
}

function onKnobMove(e: PointerEvent) {
	if (!dragging.value) return;
	const slider = sliderEl.value;
	if (!slider) return;
	const rect = slider.getBoundingClientRect();
	const x = e.clientX - rect.left;
	knobLeftPx.value = Math.max(0, Math.min(rect.width - 30, x));
}

function onKnobUp() {
	if (!dragging.value) return;
	dragging.value = false;
	const slider = sliderEl.value;
	if (!slider) return;
	const pct = knobLeftPx.value / slider.getBoundingClientRect().width;
	model.value = pct > 0.5 ? true : false;
}
</script>

<style lang="scss" module>
.toggle {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 12px;
	padding: 8px 0;
}

.radio {
	position: absolute;
	left: -99em;
}

.slider {
	position: relative;
	width: 130px;
	height: 40px;
	background: rgba(127, 127, 127, 0.12);
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 999px;
	overflow: hidden;
	transition: background-color 0.3s;
	box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.toggle:has(.radio[value="true"]:checked) .slider {
	background: #ffd0dc;
}

.toggle:has(.radio[value="false"]:checked) .slider {
	background: #d6ffe0;
}

.knob {
	position: absolute;
	z-index: 5;
	top: 3px;
	width: 30px;
	height: 30px;
	background: #fff;
	border-radius: 50%;
	box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
	transition: left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	cursor: grab;
	touch-action: none;
	left: calc(50% - 15px);
}

.knob.dragging {
	transition: none;
	cursor: grabbing;
}

.toggle:has(.radio[value="false"]:checked) .knob {
	left: 3px;
}

.toggle:has(.radio[value="true"]:checked) .knob {
	left: calc(100% - 33px);
}

.hit {
	position: absolute;
	top: 0;
	width: calc(100% / 3);
	height: 100%;
	cursor: pointer;
	z-index: 4;

	&:nth-child(1) { left: 0; }
	&:nth-child(2) { left: calc(100% / 3); }
	&:nth-child(3) { left: calc(200% / 3); }
}

.labelUnder,
.labelOver {
	font-size: 1.3em;
	font-weight: bold;
	opacity: 0.5;
	cursor: pointer;
	transition: opacity 0.2s, color 0.2s;
	flex: 1;
}

.toggle:has(.radio[value="false"]:checked) .labelUnder {
	opacity: 1;
	color: var(--MI_THEME-accent);
}

.toggle:has(.radio[value="true"]:checked) .labelOver {
	opacity: 1;
	color: var(--MI_THEME-accent);
}
</style>

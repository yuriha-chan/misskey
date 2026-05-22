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
		<div :class="$style.toggle">
			<input id="r18-under17" data-testid="radio-under17" v-model="iAmAdult" type="radio" :value="false" :class="$style.radio"/>
			<input id="r18-over18" data-testid="radio-over18" v-model="iAmAdult" type="radio" :value="true" :class="$style.radio"/>
			<label for="r18-under17" :class="$style.labelUnder">{{ i18n.ts.r18ConsentUnder17 }}</label>
			<div :class="$style.slider">
				<label for="r18-under17" :class="$style.hit"/>
				<span :class="$style.hit"/>
				<label for="r18-over18" :class="$style.hit"/>
				<div :class="$style.knob"></div>
			</div>
			<label for="r18-over18" :class="$style.labelOver">{{ i18n.ts.r18ConsentOver18 }}</label>
		</div>

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
import { ref, useTemplateRef } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkSwitch from '@/components/MkSwitch.vue';
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
	z-index: 3;
	top: 3px;
	width: 30px;
	height: 30px;
	background: #fff;
	border-radius: 50%;
	box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
	transition: left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	left: calc(50% - 15px);
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
}

.toggle:has(.radio[value="false"]:checked) .labelUnder {
	opacity: 1;
	color: var(--MI_THEME-accent);
}

.toggle:has(.radio[value="true"]:checked) .labelOver {
	opacity: 1;
	color: var(--MI_THEME-accent);
}

.divider {
	margin-top: 16px;
}
</style>

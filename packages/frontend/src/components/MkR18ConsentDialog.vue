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
			<div :class="$style.slider">
				<input id="r18-under17" data-testid="radio-under17" v-model="iAmAdult" type="radio" :value="false" :class="$style.radio"/>
				<input id="r18-over18" data-testid="radio-over18" v-model="iAmAdult" type="radio" :value="true" :class="$style.radio"/>
				<label for="r18-under17" :class="[$style.hit, iAmAdult === false ? $style.hitActive : null]"/>
				<label for="r18-over18" :class="[$style.hit, iAmAdult === true ? $style.hitActive : null]"/>
			</div>
			<label for="r18-under17" :class="$style.labelUnder">{{ i18n.ts.r18ConsentUnder17 }}</label>
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
	padding: 0 32px;
}

.question {
	font-weight: bold;
	margin-bottom: 16px;
}

.toggle {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	position: relative;
	padding: 8px 0;
}

.radio {
	position: absolute;
	left: -99em;
}

.slider {
	position: relative;
	width: 180px;
	height: 36px;
	background: var(--MI_THEME-buttonBg);
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 999px;
	overflow: hidden;
	transition: background-color 0.3s;
}

.toggle:has(.radio[value="true"]:checked) .slider {
	background: #ffd0dc;
}

.toggle:has(.radio[value="false"]:checked) .slider {
	background: #d6ffe0;
}

.hit {
	position: absolute;
	top: 0;
	width: 50%;
	height: 100%;
	cursor: pointer;

	&:nth-child(1) { left: 0; }
	&:nth-child(2) { left: 50%; }
}

.labelUnder,
.labelOver {
	font-size: 0.9em;
	font-weight: bold;
	opacity: 0.5;
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

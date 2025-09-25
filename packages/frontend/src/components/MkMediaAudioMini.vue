<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	ref="playerEl"
	v-hotkey="keymap"
	tabindex="0"
	:class="[
		$style.audioContainer,
		(audio.isSensitive && prefer.s.highlightSensitiveMedia) && $style.sensitive,
	]"
	@contextmenu.stop
	@keydown.stop
>
	<div v-if="prefer.s.useNativeUiForVideoAudioPlayer" :class="$style.nativeAudioContainer">
		<audio
			ref="audioEl"
			preload="metadata"
			controls
			:class="$style.nativeAudio"
			@keydown.prevent
		>
			<source :src="audio.url">
		</audio>
	</div>

	<div v-else :class="$style.audioControls">
		<audio
			ref="audioEl"
			preload="metadata"
			@keydown.prevent="() => {}"
		>
			<source :src="audio.url">
		</audio>
		<div :class="[$style.controlsChild, $style.controlsLeft]">
			<button @click.stop="togglePlayPause"
				:class="['_button', $style.controlButton]"
				tabindex="-1"
			>
				<i v-if="isPlaying" class="ti ti-player-pause-filled"></i>
				<i v-else class="ti ti-player-play-filled"></i>
			</button>
		</div>
		<div :class="[$style.controlsChild, $style.controlsTime]">{{ durationMs ? hms(durationMs) : i18n.ts.unknown }}</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { useTemplateRef, watch, computed, ref, onDeactivated, onActivated, onMounted } from 'vue';
import * as Misskey from 'misskey-js';
import type { MenuItem } from '@/types/menu.js';
import type { Keymap } from '@/utility/hotkey.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import bytes from '@/filters/bytes.js';
import { hms } from '@/filters/hms.js';
import MkMediaRange from '@/components/MkMediaRange.vue';
import { $i, iAmModerator } from '@/i.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	audio: Misskey.entities.DriveFile;
}>();

const keymap = {
	'left': {
		allowRepeat: true,
		callback: () => {
			if (hasFocus() && audioEl.value) {
				audioEl.value.currentTime = Math.max(audioEl.value.currentTime - 5, 0);
			}
		},
	},
	'right': {
		allowRepeat: true,
		callback: () => {
			if (hasFocus() && audioEl.value) {
				audioEl.value.currentTime = Math.min(audioEl.value.currentTime + 5, audioEl.value.duration);
			}
		},
	},
	'space': () => {
		if (hasFocus()) {
			togglePlayPause();
		}
	},
} as const satisfies Keymap;

// PlayerElもしくはその子要素にフォーカスがあるかどうか
function hasFocus() {
	if (!playerEl.value) return false;
	return playerEl.value === window.document.activeElement || playerEl.value.contains(window.document.activeElement);
}

const playerEl = useTemplateRef('playerEl');
const audioEl = useTemplateRef('audioEl');

// MediaControl: Common State
const oncePlayed = ref(false);
const isReady = ref(false);
const isPlaying = ref(false);
const isActuallyPlaying = ref(false);
const durationMs = ref(0);
const volume = ref(.5);

// MediaControl Events
function togglePlayPause() {
	if (!isReady.value || !audioEl.value) return;

	if (isPlaying.value) {
		audioEl.value.pause();
		isPlaying.value = false;
	} else {
		audioEl.value.play();
		isPlaying.value = true;
		oncePlayed.value = true;
	}
}

let onceInit = false;
let mediaTickFrameId: number | null = null;
let stopAudioElWatch: () => void;

function init() {
	if (onceInit) return;
	onceInit = true;

	stopAudioElWatch = watch(audioEl, () => {
		if (audioEl.value) {
			isReady.value = true;

			audioEl.value.addEventListener('play', () => {
				isActuallyPlaying.value = true;
			});

			audioEl.value.addEventListener('pause', () => {
				isActuallyPlaying.value = false;
				isPlaying.value = false;
			});

			audioEl.value.addEventListener('ended', () => {
				oncePlayed.value = false;
				isActuallyPlaying.value = false;
				isPlaying.value = false;
			});

			durationMs.value = audioEl.value.duration * 1000;
			audioEl.value.addEventListener('durationchange', () => {
				if (audioEl.value) {
					durationMs.value = audioEl.value.duration * 1000;
				}
			});

			audioEl.value.volume = volume.value;
		}
	}, {
		immediate: true,
	});
}

watch(volume, (to) => {
	if (audioEl.value) audioEl.value.volume = to;
});


onMounted(() => {
	init();
});

onActivated(() => {
	init();
});

onDeactivated(() => {
	isReady.value = false;
	isPlaying.value = false;
	isActuallyPlaying.value = false;
	stopAudioElWatch();
	onceInit = false;
});
</script>

<style lang="scss" module>
.audioContainer {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	width: 100%;
}

.audioControls {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
}

.controlsChild {
	display: flex;
	align-items: center;

	.controlButton {
		padding: 6px;
		border-radius: calc(var(--MI-radius) / 2);
		font-size: 1.05rem;

		&:hover {
			color: var(--MI_THEME-accent);
			background-color: var(--MI_THEME-accentedBg);
		}

		&:focus-visible {
			outline: none;
		}
	}
}

.controlsTime {
	font-size: .9rem;
}

.nativeAudioContainer {
	display: flex;
	align-items: center;
	padding: 6px;
}

.nativeAudio {
	display: block;
	width: 100%;
}
</style>

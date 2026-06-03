<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkInfo>{{ i18n.ts._initialAccountSetting.emojiPaletteSettingDescription }}</MkInfo>

	<template v-if="recommendedPalettes.length > 0">
		<div v-for="(palette, i) in recommendedPalettes" :key="i" :class="$style.paletteCard">
			<div :class="$style.paletteHeader">
				<MkSwitch :modelValue="isSelected(Number(i))" @update:modelValue="v => togglePalette(Number(i), v)">
					{{ palette.name || `(${i18n.ts.noName})` }}
				</MkSwitch>
			</div>
			<div :class="$style.emojisList">
				<span v-for="(emoji, j) in palette.emojis" :key="j" :class="$style.emojiItem">{{ emoji }}</span>
			</div>
		</div>
	</template>
	<template v-else>
		<MkInfo>{{ i18n.ts._initialAccountSetting.noRecommendedPalettes }}</MkInfo>
	</template>

	<MkInfo>{{ i18n.ts._initialAccountSetting.theseSettingsCanEditLater }}</MkInfo>
</div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { i18n } from '@/i18n.js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInfo from '@/components/MkInfo.vue';
import { instance } from '@/instance.js';
import { prefer } from '@/preferences.js';
import { genId } from '@/utility/id.js';

type RecommendedPalette = {
	name: string;
	emojis: string[];
};

const recommendedPalettes = computed<RecommendedPalette[]>(() => {
	return (instance as any).recommendedEmojiPalettes ?? [];
});

const selectedIndices = ref<Set<number>>(new Set());

function isSelected(index: number): boolean {
	return selectedIndices.value.has(index);
}

function findExistingPalette(name: string, emojis: string[]): string | undefined {
	return prefer.s.emojiPalettes.find(p =>
		p.name === name &&
		p.emojis.length === emojis.length &&
		p.emojis.every((e, i) => e === emojis[i])
	)?.id;
}

function togglePalette(index: number, selected: boolean) {
	const palette = recommendedPalettes.value[index];
	if (!palette) return;

	if (selected) {
		const existingId = findExistingPalette(palette.name, palette.emojis);
		if (existingId) {
			selectedIndices.value = new Set(selectedIndices.value).add(index);
			return;
		}
		prefer.commit('emojiPalettes', [
			...prefer.s.emojiPalettes,
			{
				id: genId(),
				name: palette.name,
				emojis: [...palette.emojis],
			},
		]);
		selectedIndices.value = new Set(selectedIndices.value).add(index);
	} else {
		const existingId = findExistingPalette(palette.name, palette.emojis);
		if (existingId) {
			prefer.commit('emojiPalettes', prefer.s.emojiPalettes.filter(p => p.id !== existingId));
			if (prefer.s.emojiPaletteForMain === existingId) {
				prefer.commit('emojiPaletteForMain', null);
			}
			if (prefer.s.emojiPaletteForReaction === existingId) {
				prefer.commit('emojiPaletteForReaction', null);
			}
		}
		const next = new Set(selectedIndices.value);
		next.delete(index);
		selectedIndices.value = next;
	}
}

function syncSelectionState() {
	const next = new Set<number>();
	recommendedPalettes.value.forEach((palette, i) => {
		if (findExistingPalette(palette.name, palette.emojis)) {
			next.add(i);
		}
	});
	selectedIndices.value = next;
}

syncSelectionState();
</script>

<style lang="scss" module>
.paletteCard {
	padding: 16px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 8px;
}

.paletteHeader {
	margin-bottom: 8px;
}

.emojisList {
	font-size: 1.2em;
	line-height: 1.8;
}

.emojiItem {
	margin-right: 4px;
}
</style>

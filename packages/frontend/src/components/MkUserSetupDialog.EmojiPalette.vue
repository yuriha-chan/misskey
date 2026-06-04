<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkInfo>{{ i18n.ts._initialAccountSetting.emojiPaletteSettingDescription }}</MkInfo>

	<template v-if="recommendedPalettes.length > 0">
		<div class="_gaps_s">
			<button
				v-for="(palette, i) in recommendedPalettes"
				:key="i"
				class="_button"
				:class="[$style.paletteCard, { [$style.selected]: selectedIndex === i }]"
				@click="selectPalette(i)"
			>
				<div :class="$style.paletteName">{{ palette.name || `(${i18n.ts.noName})` }}</div>
				<div :class="$style.emojisGrid">
					<span v-for="emoji in palette.emojis" :key="emoji" :class="$style.emojiItem">
						<MkCustomEmoji v-if="emoji[0] === ':'" style="pointer-events: none;" :name="emoji" :normal="true" :fallbackToImage="true"/>
						<MkEmoji v-else style="pointer-events: none;" :emoji="emoji" :normal="true"/>
					</span>
				</div>
			</button>
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
import MkInfo from '@/components/MkInfo.vue';
import MkCustomEmoji from '@/components/global/MkCustomEmoji.vue';
import MkEmoji from '@/components/global/MkEmoji.vue';
import { instance } from '@/instance.js';
import { prefer } from '@/preferences.js';

type RecommendedPalette = {
	name: string;
	emojis: string[];
};

const recommendedPalettes = computed<RecommendedPalette[]>(() => {
	return (instance as any).recommendedEmojiPalettes ?? [];
});

const selectedIndex = ref<number | null>(null);

function selectPalette(index: number) {
	if (selectedIndex.value === index) return;
	selectedIndex.value = index;
	const palette = recommendedPalettes.value[index];
	if (!palette) return;
	const defaultPalette = prefer.s.emojiPalettes[0];
	if (!defaultPalette) return;
	prefer.commit('emojiPalettes', [
		{
			...defaultPalette,
			emojis: [...palette.emojis],
		},
		...prefer.s.emojiPalettes.slice(1),
	]);
}
</script>

<style lang="scss" module>
.paletteCard {
	display: block;
	width: 100%;
	padding: 12px;
	border: solid 2px var(--MI_THEME-divider);
	border-radius: 8px;
	text-align: left;

	&:hover {
		border-color: var(--MI_THEME-accent);
	}

	&.selected {
		border-color: var(--MI_THEME-accent);
		background: var(--MI_THEME-accentedBg);
	}
}

.paletteName {
	font-size: 0.9em;
	margin-bottom: 8px;
	font-weight: bold;
}

.emojisGrid {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.emojiItem {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	font-size: 20px;
	border-radius: 4px;
	background: var(--MI_THEME-buttonBg);
}
</style>

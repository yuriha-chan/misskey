<template>
	<div :class="$style.container">
		<div
			v-for="(segment, index) in colorSegments"
			:key="index"
			:class="store.s.darkMode ? $style.colorBlockDark : $style.colorBlock"
			:style="{ '--segment-fg-hue': segment.fgHue, '--segment-bg-hue': segment.bgHue }"
		>{{segment.text}}</div>
	</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { store } from '@/store.ts';

const props = withDefaults(defineProps<{
	id: string;
	segmentLength?: number;
}>(), {
	segmentLength: 5,
	minLuma: 30,
	maxLuma: 85,
	chroma: 100,
});

function calcHue(segment, p) {
	const hash = p * Array.from(segment).reduce((s, char) => (s * p) ^ char.charCodeAt(0), 0);
	const value = hash % 36;
	const hue = value * 10;
	return hue;
}

const colorSegments = computed(() => {
	if (!props.id) return [];

	const segments = [];
	for (let i = 0; i < props.id.length; i += props.segmentLength) {
		segments.push(props.id.substring(i, i + props.segmentLength));
	}
	return segments.map(segment => {
		return { fgHue: calcHue(segment, 13), bgHue: calcHue(segment, 7), text: segment };
	});
});

</script>

<style lang="scss" module>
.container {
	display: inline-flex;
	gap: 0;
	width: fit-content;
}


.colorBlock {
	width: fit-content;
	white-space: nowrap;
	color: lch(30% 60% var(--segment-fg-hue, 0));
	background-color: lch(100% 10% var(--segment-bg-hue, 0));
}

.colorBlockDark {
	width: fit-content;
	white-space: nowrap;
	color: lch(100% 60% var(--segment-fg-hue, 0));
	background-color: lch(10% 20% var(--segment-bg-hue, 0));
}
</style>

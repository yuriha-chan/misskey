<template>
	<div :class="$style.label"><slot name="label"></slot></div>
	<div :class="$style.container">
		<MkButton :class="$style.button" @click="decrement(props.largeStep)"><i class="ti ti-chevrons-left" /></MkButton>
		<MkButton :class="$style.button" @click="decrement(props.smallStep)"><i class="ti ti-chevron-left" /></MkButton>

		<MkInput v-if="props.days" :class="$style.input" v-model.number="days" :disabled="props.disabled" type="number" :min="0" @change="onChange">
			<template #suffix>{{ i18n.ts._time.day }}</template>
		</MkInput>
		<MkInput v-if="props.hours" :class="$style.input" v-model.number="hours" :disabled="props.disabled" type="number" :min="0" @change="onChange">
			<template #suffix>{{ i18n.ts._time.hour }}</template>
		</MkInput>
		<MkInput v-if="props.minutes" :class="$style.input" v-model.number="minutes" :disabled="props.disabled" type="number" :min="0" @change="onChange">
			<template #suffix>{{ i18n.ts._time.minute }}</template>
		</MkInput>
		<MkInput v-if="props.seconds" :class="$style.input" v-model.number="seconds" :disabled="props.disabled" type="number" :min="0" @change="onChange">
			<template #suffix>{{ i18n.ts._time.second }}</template>
		</MkInput>

		<MkButton :class="$style.button" @click="increment(props.smallStep)"><i class="ti ti-chevron-right" /></MkButton>
		<MkButton :class="$style.button" @click="increment(props.largeStep)"><i class="ti ti-chevrons-right" /></MkButton>
	</div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	modelValue: number;
	smallStep: number;
	largeStep: number;
	min: number;
	max: number;
	disabled: boolean;
	days?: boolean;
	hours?: boolean;
	minutes?: boolean;
	seconds?: boolean;
}>(), {
	smallStep: 15,
	largeStep: 180,
	min: 0,
	max: +Infinity,
	disabled: false,
	days: false,
	hours: false,
	minutes: true,
	seconds: true,
});

// check continuity of units
const units = [props.days, props.hours, props.minutes, props.seconds];
let starting = false, ending = false;
for (const u of units) {
	if (u) starting = true;
	if (starting && !u) ending = true;
	if (ending && u) throw new Error();
}

const emit = defineEmits<{
	(ev: 'update:modelValue', v: number): void;
}>();

function setValue(v: number) {
	if (props.days) {
		days.value = Math.floor(v / 86400);
		hours.value = Math.floor((v % 86400) / 3600);
		minutes.value = Math.floor((v % 3600) / 60);
		seconds.value = v % 60;
	} else if (props.hours) {
		hours.value = Math.floor(v / 3600);
		minutes.value = Math.floor((v % 3600) / 60);
		seconds.value = v % 60;
	} else if (props.minutes) {
		minutes.value = Math.floor(v / 60);
		seconds.value = v % 60;
	} else if (props.seconds) {
		seconds.value = v;
	}
}

const days = ref(0);
const hours = ref(0);
const minutes = ref(0);
const seconds = ref(0);
let manualInput = false;

setValue(props.modelValue)

watch(() => props.modelValue, v => {
	if (!manualInput) {
		setValue(v);
	}
	manualInput = false;
});

function clamp(value: number): number {
	if (value < props.min) return props.min;
	if (value > props.max) return props.max;
	return value;
}

function parse() {
	const d = isNaN(days.value) ? 0 : days.value;
	const h = isNaN(hours.value) ? 0 : hours.value;
	const m = isNaN(minutes.value) ? 0 : minutes.value;
	const s = isNaN(seconds.value) ? 0 : seconds.value;
	let total = d * 86400 + h * 3600 + m * 60 + s;
	return total;
}

function onChange() {
	manualInput = true;
	emit('update:modelValue', clamp(parse()));
}

function decrement(step: number) {
	let total = parse();
	total = (Math.ceil(total / step) - 1) * step;
	total = clamp(total);
	emit('update:modelValue', total);
}

function increment(step: number) {
	let total = parse();
	total = (Math.floor(total/step) + 1) * step ;
	total = clamp(total);
	emit('update:modelValue', total);
}

</script>

<style lang="scss" module>
.container {
	display: flex;
	align-items: center;
	gap: 4px;
	> .input {
		flex: 2;
		min-width: 80px;
	}
}
.label {
	font-size: 0.85em;
	padding: 0 0 8px 0;
	user-select: none;

	&:empty {
		display: none;
	}
}
.button {
	min-width: 30px;
}
</style>


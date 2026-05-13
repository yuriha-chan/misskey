<template>
	<span>{{ formatted }}</span>
</template>
<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'

const props = defineProps({
	to: {
		type: Number,
		required: true
	}
})

const now = ref(Date.now())
let timer = null

function scheduleTick() {
	now.value = Date.now()
	const remaining = props.to - now.value
	if (remaining <= 0) return;
	let nextTick = remaining % 1000 || 1000
	if (nextTick < 10) { nextTick += 1000 }	
	timer = setTimeout(scheduleTick, nextTick)
}

onMounted(() => {
	scheduleTick()
})

onUnmounted(() => {
	clearTimeout(timer)
})

const formatted = computed(() => {
	const sec = Math.max(0, Math.round((props.to - now.value) / 1000))
	const h = String(Math.floor(sec / 3600)).padStart(2, '0')
	const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
	const s = String(sec % 60).padStart(2, '0')
	return h === "00" ? `${m}:${s}` : `${h}:${m}:${s}`;
})
</script>

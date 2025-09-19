<template>
<MkWindow ref="uiWindow" :initialWidth="400" :initialHeight="600" @closed="emit('closed')">
	<template #header>New Chat Room</template>
	<div style="display: flex; flex-direction: column; min-height: 100%;">
		<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px; flex-grow: 1;">
			<div class="_gaps_m">
				<MkInput v-model="roomName" :label="i18n.ts.name" required>
					<template #label>{{ i18n.ts.title }}</template>
				</MkInput>
				<MkTextarea v-model="roomDescription">
					<template #label>{{ i18n.ts.description }}</template>
				</MkTextarea>
				<MkInput v-model.number="roomCapacity" type="number" min="2" max="30" placeholder="2-30">
					<template #label>{{ i18n.ts._chat.capacity }}</template>
				</MkInput>
				<MkSwitch v-model="roomIsPublic">
					<template #label>{{ i18n.ts._chat.isPublicRoom }}</template>
				</MkSwitch>
				<div v-if="roomIsPublic">{{ i18n.ts._chat.publicRoomMustExpire }}</div>
				<MkSwitch v-model="expires" :disabled="roomIsPublic">
					<template #label>{{ i18n.ts._chat.expires }}</template>
				</MkSwitch>
				<MkInput v-if="expires" v-model.number="expiresIn" type="number" :min="0.1" :max="roomIsPublic ? 6 : 744">
					<template #label>{{ i18n.ts._chat.expiresIn }}</template>
					<template #suffix>{{ i18n.ts._time.hour }}</template>
				</MkInput>
				<div>
					<MkButton primary full :disabled="roomName.length === 0" @click="done">{{ i18n.ts.create }}</MkButton>
				</div>
			</div>
		</div>
	</div>
</MkWindow>
</template>
<script lang="ts" setup>
import { ref, useTemplateRef, watch } from 'vue';
import { i18n } from '@/i18n.js';
import MkWindow from '@/components/MkWindow.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInput from '@/components/MkInput.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
const roomName = ref('');
const roomDescription = ref('');
const roomCapacity = ref(8);
const roomIsPublic = ref(false);
const expires = ref(true);
const expiresIn = ref(1);
const emit = defineEmits<{
	(ev: 'done', v: { updated?: any; created?: any }): void;
	(ev: 'closed'): void;
}>();
const props = defineProps<{
	room?: any,
}>();
const uiWindow = useTemplateRef('uiWindow');
watch(roomIsPublic, () => {
		if (roomIsPublic.value) {
			expires.value = true;
			expiresIn.value = Math.min(6, expiresIn.value);
		}
})

async function done() {
	const created = await os.apiWithDialog('chat/rooms/create', {
		name: roomName.value,
		description: roomDescription.value,
		capacity: roomCapacity.value,
		expiration: expires.value ? Math.floor(expiresIn.value * 3600 * 1000) : null,
		isPublic: roomIsPublic.value,
	});
	emit('done', { created });
	uiWindow.value?.close();
}
</script>

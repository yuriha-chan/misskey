<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkInput v-model="name_" :disabled="!isOwner">
		<template #label>{{ i18n.ts.name }}</template>
	</MkInput>

	<MkTextarea v-model="description_" :disabled="!isOwner">
		<template #label>{{ i18n.ts.description }}</template>
	</MkTextarea>

	<MkInput v-model.number="capacity_" type="number" min="2" max="30" placeholder="2-30" :disabled="!isOwner">
		<template #label>{{ i18n.ts._chat.capacity }}</template>
	</MkInput>

	<MkSwitch v-model="expires_" :disabled="true">
		<template #label>{{ i18n.ts._chat.expires }}</template>
	</MkSwitch>

	<MkSwitch v-model="isPublic_" :disabled="true">
		<template #label>{{ i18n.ts._chat.isPublicRoom }}</template>
	</MkSwitch>


	<MkButton v-if="isOwner" primary @click="save">{{ i18n.ts.save }}</MkButton>

	<hr>

	<MkButton v-if="isOwner || ($i.isAdmin || $i.isModerator)" danger @click="del">{{ i18n.ts._chat.deleteRoom }}</MkButton>
	<MkButton v-if="isOwner || ($i.isAdmin || $i.isModerator)" danger @click="archive">{{ i18n.ts._chat.archiveRoom }}</MkButton>

	<MkSwitch v-if="!isOwner" v-model="isMuted">
		<template #label>{{ i18n.ts._chat.muteThisRoom }}</template>
	</MkSwitch>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { ensureSignin } from '@/i.js';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import { useRouter } from '@/router.js';

const router = useRouter();
const $i = ensureSignin();

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const isOwner = computed(() => {
	return props.room.ownerId === $i.id;
});

const name_ = ref(props.room.name);
const createdOn = ref(props.room.createdOn);
const expireAfter_ = ref(props.room.expireAfter);
const capacity_ = ref(props.room.capacity);
const background_ = ref(props.room.background);
const isPublic_ = ref(props.room.isPublic);
const expires_ = ref(props.room.expiration != null);
const description_ = ref(props.room.description);

function save() {
	os.apiWithDialog('chat/rooms/update', {
		roomId: props.room.id,
		name: name_.value,
		capacity: capacity_.value,
		description: description_.value,
	});
}

async function del() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.deleteAreYouSure({ x: name_.value }),
	});
	if (canceled) return;

	await os.apiWithDialog('chat/rooms/delete', {
		roomId: props.room.id,
	});
	router.push('/chat');
}

async function archive() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: `${i18n.ts.thisOperationCannotBeUndone} ${i18n.tsx.archiveAreYouSure({ x: `${i18n.ts._chat.chatRoom} ${name_.value}` })}`
	});
	if (canceled) return;

	await os.apiWithDialog('chat/rooms/archive', {
		roomId: props.room.id,
	});
}

const isMuted = ref(props.room.isMuted ?? false);

watch(isMuted, async () => {
	await os.apiWithDialog('chat/rooms/mute', {
		roomId: props.room.id,
		mute: isMuted.value,
	});
});
</script>

<style lang="scss" module>
.membership {
	display: flex;
}

.membershipBody {
	flex: 1;
	min-width: 0;
	margin-right: 8px;

	&:hover {
		text-decoration: none;
	}
}
</style>

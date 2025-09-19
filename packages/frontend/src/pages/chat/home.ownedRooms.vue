<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkSwitch v-model="includeArchived">
		<template #label>{{ i18n.ts._chat.includeArchivedRooms }}<template/>
	</MkSwitch>
	<div v-if="rooms.length > 0" class="_gaps_s">
		<XRoom v-for="room in rooms" :key="room.id" :room="room"/>
	</div>
	<MkResult v-if="!fetching && rooms.length == 0" type="empty" :text="i18n.ts._chat.noRooms"/>
	<MkLoading v-if="fetching"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import XRoom from './XRoom.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkSwitch from '@/components/MkSwitch.vue';

const fetching = ref(true);
const rooms = ref<Misskey.entities.ChatRoom[]>([]);
const includeArchived = ref(false);

async function fetchRooms() {
	fetching.value = true;

	const res = await misskeyApi('chat/rooms/owned', {
		includeArchived: includeArchived.value,
	});

	rooms.value = res;

	fetching.value = false;
}

watch(includeArchived, fetchRooms);

onMounted(() => {
	fetchRooms();
});
</script>

<style lang="scss" module>

</style>

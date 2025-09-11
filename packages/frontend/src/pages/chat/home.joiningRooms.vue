<template>
<div class="_gaps">
	<MkSwitch v-model="includeLeft" label="include left rooms"/>
	<div v-if="memberships.length > 0" class="_gaps_s">
		<XRoom v-for="membership in memberships" :key="membership.id" :room="membership.room!"/>
	</div>
	<MkResult v-if="!fetching && memberships.length == 0" type="empty" :text="i18n.ts._chat.noRooms"/>
	<MkLoading v-if="fetching"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkSwitch from '@/components/MkSwitch.vue';

import XRoom from './XRoom.vue';

const fetching = ref(true);
const memberships = ref<Misskey.entities.ChatRoomMembership[]>([]);
const includeLeft = ref(false);

async function fetchRooms() {
	fetching.value = true;

	const res = await os.apiWithDialog('chat/rooms/joining', {
		includeLeft: includeLeft.value,
	});

	memberships.value = res;

	fetching.value = false;
}

watch(includeLeft, fetchRooms);

onMounted(() => {
	fetchRooms();
});
</script>

<style lang="scss" module>

</style>

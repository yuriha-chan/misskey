<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="rooms.length > 0" class="_gaps_s">
	<MkA
		v-for="item in rooms"
		:key="item.id"
		:class="$style.room"
		class="_panel"
		:to="`/chat/room/${item.id}`"
	>
		<MkAvatars :class="$style.avatars" :userIds="(item.memberships ?? []).map(m => m.userId)" indicator :preview="false"/>
		<div :class="$style.body">
			<header :class="$style.header">
				<span :class="$style.name"><i class="ti ti-users"></i> {{ item.name }}</span>
				<span :class="$style.occupation">({{ (item.memberships ?? []).length }} / {{ item.capacity }})</span>
			</header>
			<div :class="$style.description">{{ item.description }}</div>
		</div>
	</MkA>
</div>
<MkResult v-if="!initializing && rooms.length == 0" type="empty" :text="i18n.ts._chat.noPublicRooms"/>
<MkLoading v-if="initializing"/>
</template>

<script lang="ts" setup>
import { onActivated, onDeactivated, onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { useInterval } from '@@/js/use-interval.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import MkAvatars from '@/components/MkAvatars.vue';

const $i = ensureSignin();

const rooms = ref<Misskey.entities.ChatRoom[]>([]);
const includeArchived = ref(false);

const initializing = ref(true);
const fetching = ref(false);

async function fetchRooms() {
	if (fetching.value) return;

	fetching.value = true;

	rooms.value = await misskeyApi('chat/rooms/list-public', { includeArchived: includeArchived.value });

	fetching.value = false;
	initializing.value = false;
}

let isActivated = true;

onActivated(() => {
	isActivated = true;
});

onDeactivated(() => {
	isActivated = false;
});

useInterval(() => {
	if (!window.document.hidden && isActivated) {
		fetchRooms();
	}
}, 1000 * 10, {
	immediate: false,
	afterMounted: true,
});

onActivated(() => {
	fetchRooms();
});

onMounted(() => {
	fetchRooms();
});
</script>

<style lang="scss" module>
.room {
	position: relative;
	display: flex;
	padding: 16px 24px;
}

@container (max-width: 500px) {
	.room {
		font-size: 90%;
		padding: 14px 20px;
	}
}

@container (max-width: 450px) {
	.room {
		font-size: 80%;
		padding: 12px 16px;
	}
}
.avatars {
	flex: 2;
}

.body {
	flex: 3;
	min-width: 0;
}

.header {
	display: flex;
	align-items: center;
	margin-bottom: 2px;
	white-space: nowrap;
	overflow: clip;
}

.name {
	margin: 0;
	padding: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	font-size: 1em;
	font-weight: bold;
	flex: 1;
}

.description {
	overflow: hidden;
	overflow-wrap: break-word;
	font-size: 1.1em;
}
</style>

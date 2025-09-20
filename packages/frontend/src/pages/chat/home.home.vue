<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">

	<MkButton v-if="$i.policies.chatAvailability === 'available'" primary gradate rounded :class="$style.start" @click="start"><i class="ti ti-plus"></i> {{ i18n.ts.startChat }}</MkButton>

	<MkInfo v-else>{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>

	<MkAd :preferForms="['horizontal', 'horizontal-big']"/>

	<MkInput
		v-model="searchQuery"
		:placeholder="i18n.ts._chat.searchMessages"
		type="search"
	>
		<template #prefix><i class="ti ti-search"></i></template>
	</MkInput>

	<MkButton v-if="searchQuery.length > 0" primary rounded @click="search">{{ i18n.ts.search }}</MkButton>

	<MkFoldableSection v-if="searched">
		<template #header>{{ i18n.ts.searchResult }}</template>

		<div class="_gaps_s">
			<div v-for="message in searchResults" :key="message.id" :class="$style.searchResultItem">
				<XMessage :message="{ type: 'message', data: message }" :membership="{ user: message.fromUser }" :isSearchResult="true"/>
			</div>
		</div>
	</MkFoldableSection>

	<MkFoldableSection>
		<template #header>{{ i18n.ts._chat.publicRooms }}</template>
		<XPublicRooms />
	</MkFoldableSection>

	<MkFoldableSection>
		<template #header>{{ i18n.ts._chat.history }}</template>

		<MkChatHistories/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import XMessage from './XMessage.vue';
import XPublicRooms from './home.publicRooms.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { ensureSignin } from '@/i.js';
import { useRouter } from '@/router.js';
import * as os from '@/os.js';
import { updateCurrentAccountPartial } from '@/accounts.js';
import MkInput from '@/components/MkInput.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkChatHistories from '@/components/MkChatHistories.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkDialog from '@/components/MkDialog.vue';

const $i = ensureSignin();
const router = useRouter();

const searchQuery = ref('');
const searched = ref(false);
const searchResults = ref<Misskey.entities.ChatMessage[]>([]);

const creatingRoom = ref(false);
const newRoomName = ref('');
const newRoomDescription = ref('');
const newRoomIsPublic = ref(false);
const newRoomCapacity = ref<number | null>(30);

const isFormValid = computed(() => {
	const nameValid = newRoomName.value.trim() !== '';
	const capacityValid = newRoomCapacity.value == null || (newRoomCapacity.value >= 2 && newRoomCapacity.value <= 30);
	return nameValid && capacityValid;
});

function start(ev: MouseEvent) {
	os.popupMenu([{
			text: i18n.ts._chat.individualChat,
			caption: i18n.ts._chat.individualChat_description,
			icon: 'ti ti-user',
			action: () => {
				 startUser();
			},
		},
		{ type: 'divider' },
		{
			text: i18n.ts._chat.roomChat,
			caption: i18n.ts._chat.roomChat_description,
			icon: 'ti ti-users-group',
			action: () => {
				showCreateRoomDialog();
			},
		}], ev.currentTarget ?? ev.target);
}

async function startUser() {
	// TODO: localOnly は連合に対応したら消す
	os.selectUser({ localOnly: true }).then(user => {
		router.push('/chat/user/:userId', {
			params: {
				userId: user.id,
			}
		});
	});
}

async function showCreateRoomDialog(): Promise {
	const { dispose } = await os.popupAsyncWithDialog(import('./edit-chat-room.vue').then(x => x.default), {
	}, {
		done: result => {
			if (result.created) {
				router.push('/chat/room/:roomId', {
					params: {
						roomId: result.created.id,
					}
				});
			}
		},
		closed: () => dispose,
	});
}

async function search() {
	const res = await misskeyApi('chat/messages/search', {
		query: searchQuery.value,
	});

	searchResults.value = res;
	searched.value = true;
}

onMounted(() => {
	updateCurrentAccountPartial({ hasUnreadChatMessages: false });
});
</script>

<style lang="scss" module>
.start {
	margin: 0 auto;
}

.searchResultItem {
	padding: 12px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 12px;
}
</style>

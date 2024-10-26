<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div class="_gaps">
		<!-- show palette -->
		<MkFoldableSection :expanded="true">
			<template #header>{{ i18n.ts.options }}</template>
			<div class="_gaps_m">
				<MkRadios v-model="hostSelect">
					<template #label>{{ i18n.ts.host }}</template>
					<option value="all" default>{{ i18n.ts.all }}</option>
					<option value="local">{{ i18n.ts.local }}</option>
					<option value="specified">{{ i18n.ts.specifyHost }}</option>
				</MkRadios>
				<MkInput v-model="hostInput" :disabled="hostSelect !== 'specified'" :large="true" type="search">
					<template #prefix><i class="ti ti-server"></i></template>
				</MkInput>
			</div>
			<!-- parameter options -->
		</MkFoldableSection>
	</div>
	<MkFoldableSection v-if="notePagination">
		<template #header>{{ i18n.ts.searchResult }}</template>
		<MkNotes :key="key" :pagination="notePagination"/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { onMounted, computed, ref, toRef, watch } from 'vue';
import type { UserDetailed } from 'misskey-js/entities.js';
import type { Paging } from '@/components/MkPagination.vue';
import MkNotes from '@/components/MkNotes.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkFolder from '@/components/MkFolder.vue';
import { useRouter } from '@/router/supplier.js';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkRadios from '@/components/MkRadios.vue';
import { $i } from '@/account.js';
import { instance } from '@/instance.js';

const props = withDefaults(defineProps<{
	fileId: string | null;
	host: string | null;
}>(), {
	fileId: null,
	host: null,
});


const router = useRouter();
const key = ref(0);
const notePagination = ref<Paging>();
const user = ref<UserDetailed | null>(null);
const hostInput = ref(toRef(props, 'host').value);

const hostSelect = ref<'all' | 'local' | 'specified'>('all');

const updatePagination = () => {
  notePagination.value = {
  	endpoint: 'notes/image-search' as const,
  	limit: 30,
  	params: {
  		fileId: props.fileId,
  		...(searchHost.value ? { host: searchHost.value } : {}),
  	},
  };
};

onMounted(() => { updatePagination(); });

const setHostSelectWithInput = (after:string|undefined|null, before:string|undefined|null) => {
	if (before === after) return;
	if (after === '') {
		hostSelect.value = 'all';
	} else {
		hostSelect.value = 'specified';
	}
	updatePagination();
};

// setHostSelectWithInput(hostInput.value, undefined);

watch(hostInput, setHostSelectWithInput);
watch(hostSelect, updatePagination);

const searchHost = computed(() => {
	if (hostSelect.value === 'local') return '.';
	if (hostSelect.value === 'specified') return hostInput.value;
	return null;
});
</script>
<style lang="scss" module>
.userItem {
	display: flex;
	justify-content: center;
}
.addMeButton {
  border: 2px dashed var(--MI_THEME-fgTransparent);
	padding: 12px;
	margin-right: 16px;
}
.addUserButton {
  border: 2px dashed var(--MI_THEME-fgTransparent);
	padding: 12px;
	flex-grow: 1;
}
.addUserButtonInner {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: space-between;
	min-height: 38px;
}
.userCard {
	flex-grow: 1;
}
.remove {
	width: 32px;
	height: 32px;
	align-self: center;

	& > i:before {
		color: #ff2a2a;
	}

	&:disabled {
		opacity: 0;
	}
}
</style>

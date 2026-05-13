<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/accounts" :label="i18n.ts.accounts" :keywords="['accounts']" icon="ti ti-users">
	<div class="_gaps">
		<div class="_buttons">
			<MkButton primary @click="addAccount"><i class="ti ti-plus"></i> {{ i18n.ts.addAccount }}</MkButton>
			<MkButton primary @click="syncSubAccounts"><i class="ti ti-reload"></i> {{ i18n.ts.syncSubAccounts }}</MkButton>
			<!--<MkButton @click="refreshAllAccounts"><i class="ti ti-refresh"></i></MkButton>-->
		</div>

		<template v-for="x in accounts" :key="x.host + x.id">
			<div :class="[subAccounts.includes(x.id) ? $style.subAccount : null, x.id === $i.id ? $style.currentAccount : null]">
				<div :class="$style.label">{{ x.id === $i.id ? i18n.ts.currentAccount : subAccounts.includes(x.id) ? i18n.ts.subAccountOfCurrentAccount : ""}}</div>
				<MkUserCardMini v-if="x.user" :user="x.user" :class="$style.user" @click.prevent="showMenu(x.host, x.id, x.user.username, $event)"/>
			</div>
		</template>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import * as Misskey from 'misskey-js';
import type { MenuItem } from '@/types/menu.js';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { unisonReload } from '@/utility/unison-reload.js';
import { $i } from '@/i.js';
import { switchAccount, removeAccount, login, getAccountWithSigninDialog, getAccountWithSignupDialog, getSubAccountWithSignupDialog, getAccounts, addSubAccounts } from '@/accounts.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { prefer } from '@/preferences.js';

const accounts = await getAccounts();
const subAccounts = ref([]);

onMounted(() => {
	misskeyApi('i/get-sub-account-tokens', {}).then((res) => {
			subAccounts.value = res.map(r => r.id);
		});
});

function refreshAllAccounts() {
	// TODO
}

async function syncSubAccounts() {
	await addSubAccounts();
	unisonReload();
}

function showMenu(host: string, id: string, username: string, ev: MouseEvent) {
	if (id === $i.id) {
		return;
	}
	let menu: MenuItem[];

	menu = [{
		text: i18n.ts.switch,
		icon: 'ti ti-switch-horizontal',
		action: () => switchAccount(host, id),
	}, {
		text: i18n.ts.remove,
		icon: 'ti ti-trash',
		action: () => removeAccount(host, id),
	}];

	if (subAccounts.value.includes(id)) {
		menu.push({
			text: i18n.ts.closeSubAccount,
			icon: 'ti ti-x',
			danger: true,
			action: () => deleteSubAccount(host, { id, username }),
		});
	}

	os.popupMenu(menu, ev.currentTarget ?? ev.target);
}

function addAccount(ev: MouseEvent) {
	os.popupMenu([{
		text: i18n.ts.existingAccount,
		action: () => { addExistingAccount(); },
	}, {
		text: i18n.ts.createAccount,
		action: () => { createAccount(); },
	}, {
		text: i18n.ts.createSubAccount,
		action: () => { createSubAccount(); },
	}], ev.currentTarget ?? ev.target);
}

function addExistingAccount() {
	getAccountWithSigninDialog().then((res) => {
		if (res != null) {
			os.success();
		}
	});
}

function createAccount() {
	getAccountWithSignupDialog().then((res) => {
		if (res != null) {
			login(res.token);
		}
	});
}

function createSubAccount() {
	getSubAccountWithSignupDialog().then((res) => {
		unisonReload();
	});
}

async function deleteSubAccount(host, user) {
	{
		const { canceled } = await os.confirm({
			type: 'warning',
			text: i18n.tsx.deleteNamedAccountConfirm({ username: user.username }),
		});
		if (canceled) return;
	}

	const auth = await os.authenticateDialog();
	if (auth.canceled) return;

	await os.apiWithDialog('i/delete-sub-account', {
		subAccountId: user.id,
		password: auth.result.password,
		token: auth.result.token,
	});

	await os.alert({
		title: i18n.ts._accountDelete.started,
	});
	
	await removeAccount(host, user.id);
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.accounts,
	icon: 'ti ti-users',
}));
</script>

<style lang="scss" module>
.user {
	cursor: pointer;
}

.unknownUser {
	display: flex;
	align-items: center;
	text-align: start;
	padding: 16px;
	background: var(--MI_THEME-panel);
	border-radius: 8px;
	font-size: 0.9em;
}

.unknownUserAvatarMock {
	display: block;
	width: 34px;
	height: 34px;
	line-height: 34px;
	text-align: center;
	font-size: 16px;
	margin-right: 12px;
	background-color: color-mix(in srgb, var(--MI_THEME-fg), transparent 85%);
	color: color-mix(in srgb, var(--MI_THEME-fg), transparent 25%);
	border-radius: 50%;
}

.unknownUserTitle {
	display: block;
	width: 100%;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	line-height: 18px;
}

.unknownUserSub {
	display: block;
	width: 100%;
	font-size: 95%;
	opacity: 0.7;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	line-height: 16px;
}

.currentAccount {
	> .label {
		color: var(--MI_THEME-fgOnAccent);
	}
	padding: 0;
	background-color: var(--MI_THEME-accent);
	border: 2px solid var(--MI_THEME-accent);
	border-radius: 8px;
}

.subAccount {
	> .label {
		color: var(--MI_THEME-infoFg);
	}
	padding: 0;
	background-color: var(--MI_THEME-infoBg);
	border-radius: 8px;
	border: 2px solid var(--MI_THEME-infoBg);
}
</style>

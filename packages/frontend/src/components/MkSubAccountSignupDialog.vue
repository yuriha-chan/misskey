<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="500"
	:height="600"
	@close="onClose"
	@closed="emit('closed')"
>
	<template #header>{{ i18n.ts.signupSubAccount }}</template>

	<div style="overflow-x: clip;">
		<div :class="$style.banner">
			<i class="ti ti-user-edit"></i>
		</div>
		<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 32px;">
			<form class="_gaps_m" autocomplete="new-password" @submit.prevent="onSubmit">
				<div>
					<div :class="$style.label">{{ i18n.ts.mainAccount }}<div v-tooltip:dialog="i18n.ts.mainAccountInfo" class="_button _help"><i class="ti ti-help-circle"></i></div></div>
					<MkUserCardMini :user="$i" :withChart="false"/>
				</div>
				<MkInput v-model="username" type="text" pattern="^[a-zA-Z0-9_]{1,20}$" :spellcheck="false" autocomplete="username" required data-cy-signup-username @update:modelValue="onChangeUsername">
					<template #label>{{ i18n.ts.username }} <div v-tooltip:dialog="i18n.ts.usernameInfo" class="_button _help"><i class="ti ti-help-circle"></i></div></template>
					<template #prefix>@</template>
					<template #suffix>@{{ host }}</template>
					<template #caption>
						<div><i class="ti ti-alert-triangle ti-fw"></i> {{ i18n.ts.cannotBeChangedLater }}</div>
						<span v-if="usernameState === 'wait'" style="color:#999"><MkLoading :em="true"/> {{ i18n.ts.checking }}</span>
						<span v-else-if="usernameState === 'ok'" style="color: var(--MI_THEME-success)"><i class="ti ti-check ti-fw"></i> {{ i18n.ts.available }}</span>
						<span v-else-if="usernameState === 'unavailable'" style="color: var(--MI_THEME-error)"><i class="ti ti-alert-triangle ti-fw"></i> {{ i18n.ts.unavailable }}</span>
						<span v-else-if="usernameState === 'error'" style="color: var(--MI_THEME-error)"><i class="ti ti-alert-triangle ti-fw"></i> {{ i18n.ts.error }}</span>
						<span v-else-if="usernameState === 'invalid-format'" style="color: var(--MI_THEME-error)"><i class="ti ti-alert-triangle ti-fw"></i> {{ i18n.ts.usernameInvalidFormat }}</span>
						<span v-else-if="usernameState === 'min-range'" style="color: var(--MI_THEME-error)"><i class="ti ti-alert-triangle ti-fw"></i> {{ i18n.ts.tooShort }}</span>
						<span v-else-if="usernameState === 'max-range'" style="color: var(--MI_THEME-error)"><i class="ti ti-alert-triangle ti-fw"></i> {{ i18n.ts.tooLong }}</span>
					</template>
				</MkInput>
				<MkButton type="submit" :disabled="shouldDisableSubmitting" large gradate rounded data-cy-signup-submit style="margin: 0 auto;">
					<template v-if="submitting">
						<MkLoading :em="true" :colored="false"/>
					</template>
					<template v-else>{{ i18n.ts.start }}</template>
				</MkButton>
			</form>
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { useTemplateRef, ref, computed } from 'vue';
import { toUnicode } from 'punycode.js';
import * as Misskey from 'misskey-js';
import * as config from '@@/js/config.js';
import { ensureSignin } from '@/i.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from './MkButton.vue';
import MkInput from './MkInput.vue';
import MkUserCardMini from './MkUserCardMini.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { instance } from '@/instance.js';
import { login } from '@/accounts.js';

import { i18n } from '@/i18n.js';

const $i = ensureSignin();

const emit = defineEmits<{
	(ev: 'done', res: any): void;
	(ev: 'cancelled'): void;
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');

const props = withDefaults(defineProps<{
	autoSet?: boolean;
}>(), {
	autoSet: false,
});

const host = toUnicode(config.host);

const username = ref<string>('');
const email = ref('');
const usernameState = ref<null | 'wait' | 'ok' | 'unavailable' | 'error' | 'invalid-format' | 'min-range' | 'max-range'>(null);
const submitting = ref<boolean>(false);
const usernameAbortController = ref<null | AbortController>(null);

const shouldDisableSubmitting = computed((): boolean => {
	return submitting.value || usernameState.value !== 'ok'
});

function onChangeUsername(): void {
	if (username.value === '') {
		usernameState.value = null;
		return;
	}

	{
		const err =
			!username.value.match(/^[a-zA-Z0-9_]+$/) ? 'invalid-format' :
			username.value.length < 1 ? 'min-range' :
			username.value.length > 20 ? 'max-range' :
			null;

		if (err) {
			usernameState.value = err;
			return;
		}
	}

	if (usernameAbortController.value != null) {
		usernameAbortController.value.abort();
	}
	usernameState.value = 'wait';
	usernameAbortController.value = new AbortController();

	misskeyApi('username/available', {
		username: username.value,
	}, undefined, usernameAbortController.value.signal).then(result => {
		usernameState.value = result.available ? 'ok' : 'unavailable';
	}).catch((err) => {
		if (err.name !== 'AbortError') {
			usernameState.value = 'error';
		}
	});
}

async function onSubmit(): Promise<void> {
	if (submitting.value) return;
	submitting.value = true;
	
	const res = await misskeyApi('i/create-sub-account', {
		username: username.value,
	}).then((res) => {
		emit('done', res);
		dialog.value?.close();
	}).catch(() => {
		os.alert({
			type: 'error',
			text: i18n.ts.somethingHappened,
		});
		submitting.value = false;
	})
}

function onClose() {
	emit('cancelled');
	dialog.value?.close();
}

</script>

<style lang="scss" module>
.banner {
	padding: 16px;
	text-align: center;
	font-size: 26px;
	background-color: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}
.label {
	font-size: 0.85em;
	padding: 0 0 8px 0;
	user-select: none;
}
</style>

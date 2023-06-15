<template>
<MkWindow ref="uiWindow" :initialWidth="400" :initialHeight="500" :canResize="true" @closed="emit('closed')">
	<template #header>
		<i class="ti ti-exclamation-circle" style="margin-right: 0.5em;"></i>
		<span>{{ i18n.ts.contactAdmin }}</span>
	</template>
	<MkSpacer :marginMin="20" :marginMax="28">
		<div class="_gaps_m" :class="$style.root">
			{{ i18n.ts.contactAdminReason }}
	                <MkSelect v-model="reason" large>
			    <optgroup :label="i18n.ts.reportAbuse">
			    	<option key="spam">{{ i18n.ts.reportAbuseSpam }}</option>
			    	<option key="privacy">{{ i18n.ts.reportAbusePrivacy }}</option>
			    	<option key="attack">{{ i18n.ts.reportAbuseAttack }}</option>
			    	<option key="obscene">{{ i18n.ts.reportAbuseUntaggedObscene }}</option>
			    	<option key="otherabuse">{{ i18n.ts.reportAbuseOther }}</option>
			    </optgroup>
			    <optgroup :label="i18n.ts.reportHelp">
			    	<option key="technical">{{ i18n.ts.reportHelpTechnical }}</option>
			    	<option key="otherhelp">{{ i18n.ts.reportHelpOther }}</option>
			    </optgroup>
			    <optgroup :label="i18n.ts.reportGood">
			    	<option key="ethical">{{ i18n.ts.reportGoodEthical }}</option>
			    </optgroup>
			</Mkselect>
			<div class="">
				<MkTextarea v-model="comment">
					<template #label>{{ i18n.ts.details }}</template>
					<template #caption>{{ i18n.ts.fillReportDescription }}</template>
				</MkTextarea>
			</div>
			<div class="">
				<MkButton primary full :disabled="comment.length === 0" @click="send">{{ i18n.ts.send }}</MkButton>
			</div>
		</div>
	</MkSpacer>
</MkWindow>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkSelect from '@/components/MkSelect.vue';
import MkWindow from '@/components/MkWindow.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os';
import { i18n } from '@/i18n';

const props = defineProps<{
	user: Misskey.entities.User;
	initialComment?: string;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const uiWindow = shallowRef<InstanceType<typeof MkWindow>>();
const comment = ref(props.initialComment ?? '');
const reason = ref();

function send() {
	os.apiWithDialog('users/report-abuse', {
		userId: props.user.id,
		comment: comment.value,
	}, undefined).then(res => {
		os.alert({
			type: 'success',
			text: i18n.ts.reportCompleted,
		});
		uiWindow.value?.close();
		emit('closed');
	});
}
</script>

<style lang="scss" module>
.root {
	--root-margin: 16px;
}
</style>

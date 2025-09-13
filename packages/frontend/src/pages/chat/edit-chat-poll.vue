<template>
<MkWindow ref="uiWindow" :initialWidth="400" :initialHeight="560" @closed="emit('closed')">
	<template #header>{{ i18n.ts._chat.editPoll }}</template>
	<div style="display: flex; flex-direction: column; min-height: 100%;">
		<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px; flex-grow: 1;">
			<div class="_gaps_m">
				<MkInput v-model="title">
					<template #label>{{ i18n.ts._chat.pollTitle }}</template>
				</MkInput>
				<MkButton @click="voteForRoomMembers">
					{{ i18n.ts._chat.voteForRoomMembers }}
				</MkButton>
				<MkButton @click="voteForRoomMembersNotMe">
					{{ i18n.ts._chat.voteForRoomMembersNotMe }}
				</MkButton>
				<MkSwitch v-model="voteForUsers">
					<template #label>{{ i18n.ts._chat.voteForUsers }}</template>
				</MkSwitch>
				<div>
					<label>{{ i18n.ts._chat.pollChoices }}</label>
					<div class="_gaps_s">
						<div v-for="(choice, idx) in voteForUsers ? userChoices : textChoices" :key="idx" style="display: flex; gap: 6px; align-items: center;">
							<template v-if="voteForUsers">
								<MkUserCardMini :user="choice" v-if="choice" :withChart="false"/>
								<MkButton @click=selectUser(idx)>{{ i18n.ts.selectUser }}</MkButton>
							</template>
							<template v-else>
								<MkInput v-model="textChoices[idx]" />
							</template>
							<MkButton danger @click="removeChoice(voteForUsers, idx)" icon="ti ti-x" >{{ i18n.ts.remove }}</MkButton>
						</div>
						<MkButton @click="addChoice(voteForUsers)" icon="ti ti-plus">{{ i18n.ts.add }}</MkButton>
					</div>
				</div>
				<MkTimeDurationInput v-model.number="startsIn" type="number" :min="0" :max="86400">
					<template #label>{{ i18n.ts._chat.pollStartsIn }}</template>
				</MkTimeDurationInput>
				<MkTimeDurationInput v-model.number="duration" type="number" :min="10" :max="86400">
					<template #label>{{ i18n.ts._chat.pollDuration }}</template>
				</MkTimeDurationInput>
				<MkSwitch v-model="anonymous">
					<template #label>{{ i18n.ts._chat.anonymousPoll }}</template>
				</MkSwitch>
				<div>
					<MkButton primary full :disabled="!canSend" @click="done">{{ i18n.ts.create }}</MkButton>
				</div>
			</div>
		</div>
	</div>
</MkWindow>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, useTemplateRef } from 'vue';
import { i18n } from '@/i18n.js';
import * as Misskey from 'misskey-js';
import * as os from '@/os.js';
import { ensureSignin } from '@/i.js';
import MkWindow from '@/components/MkWindow.vue';
import MkInput from '@/components/MkInput.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkButton from '@/components/MkButton.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkTimeDurationInput from '@/components/MkTimeDurationInput.vue';

const title = ref('');
const textChoices = ref<(string | null)[]>([null, null]);
const userChoices = ref<(Misskey.entities.UserLite | null)[]>([null, null]);
const duration = ref(30);
const startsIn = ref(0);
const voteForUsers = ref(false);
const anonymous = ref(false);
const $i = ensureSignin();

const emit = defineEmits<{
	(ev: 'done', v: { updated?: any; created?: any }): void;
	(ev: 'closed'): void;
}>();

const props = defineProps<{
	poll?: { title: string; textChoices: string[]; userChoices: string[]; startsIn: number, duration: number, anonymous: boolean } | null;
	members: Record<string, Misskey.entities.ChatRoomMembership>;
}>();

const uiWindow = useTemplateRef('uiWindow');

async function selectUser(idx) {
	let user = await os.selectUser({ includeSelf: true, localOnly: true });
	return userChoices.value[idx] = user;
}

function voteForRoomMembers() {
	voteForUsers.value = true;
	userChoices.value = Object.values(props.members).filter(m => !m.hasLeft).map(m => m.user);
}

function voteForRoomMembersNotMe() {
	voteForUsers.value = true;
	userChoices.value = Object.values(props.members).filter(m => !m.hasLeft).map(m => m.user).filter(u => u.id !== $i.id);
}

function unique(arr, eq) {
  return arr.reduce((acc, x) => {
    if (!acc.some(y => eq(x, y))) acc.push(x);
    return acc;
  }, []);
}

const normalizedChoices = computed(() =>
	voteForUsers.value ? unique(userChoices.value.filter(u => u != null), (u, v) => u.id === v.id) : Array.from(new Set(textChoices.value.map(t => t?.trim()).filter(t => t != null && t.length > 0)))
);	

const canSend = computed(() => 
	normalizedChoices.value.length >= 2
);

onMounted(() => {
	if (props.poll != null) {
		title.value = props.poll.title;
		if (props.voteForUsers) {
			userChoices.value = props.poll.choices;
		} else {
			textChoices.value = props.poll.choices;
		}
		startsIn.value = props.poll.startsIn ?? 0;
		duration.value = props.poll.duration;
		anonymous.value = props.poll.anonymous;
		voteForUsers.value = props.poll.voteForUsers;
	}
});

function addChoice(user: boolean) {
	(user ? userChoices : textChoices).value.push('');
}
function removeChoice(user: boolean, idx: number) {
	(user ? userChoices : textChoices).value.splice(idx, 1);
}
async function done() {
	emit('done', {
		created: {
			title: title.value,
			choices: normalizedChoices.value,
			startsIn: startsIn.value !== 0 ? startsIn.value : null,
			duration: duration.value,
			anonymous: anonymous.value,
			voteForUsers: voteForUsers.value,
		},
	});
	uiWindow.value?.close();
}
</script>

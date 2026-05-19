<template>
<MkWindow ref="uiWindow" :initialWidth="400" :initialHeight="560" @closed="emit('closed')">
	<template #header>{{ i18n.ts._chat.editCards }}</template>
	<div style="display: flex; flex-direction: column; min-height: 100%;">
		<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px; flex-grow: 1;">
			<div class="_gaps_m">
				<!--
				<MkInput v-model="title">
					<template #label>{{ i18n.ts._chat.cardsTitle }}</template>
				</MkInput>
				-->
				<MkFoldableSection>
					<template #header>{{ i18n.ts._chat.cardsList }}</template>
					<div class="_gaps_s">
						<div v-for="(card, idx) in cardsList" :key="idx" :class="$style.cardEntry">
							<MkInput :class="$style.cardName" :placeholder="i18n.ts._chat.cardPlaceHolder" v-model="card.name"/>
							<MkInput :class="$style.cardCount" v-model.number="card.count" type="number" min="1">
								<template #suffix>{{ i18n.ts._chat.cardSuffix }}</template>
							</MkInput>
							<MkButton danger @click="removeCard(idx)"><i class="ti ti-x"/></MkButton>
						</div>
						<MkButton @click="addCard" icon="ti ti-plus">{{ i18n.ts.add }}</MkButton>
					</div>
				</MkFoldableSection>
				<MkFoldableSection>
					<template #header>{{ i18n.ts._chat.deliverCards }}</template>
					<div class="_gaps_s">
						<div :class="$style.applyToAll">
							<MkInput v-model.number="allCount" type="number" min="0">
								<template #label>{{ i18n.ts._chat.setCardCountsAll }}</template>
								<template #suffix>{{ i18n.ts._chat.cardSuffix }}</template>
							</MkInput>
							<MkButton primary @click="applyToAll()">{{ i18n.ts.apply }}</MkButton>
						</div>
						<MkFoldableSection>
							<template #header>{{ i18n.ts._chat.cardCountsByUser }}</template>
							<div :class="$style.deliverEntry" v-for="d in deliver" :key="d.user.id" style="display: flex; gap: 6px; align-items: center;">
								<MkUserCardMini :class="$style.deliverTo" :user="d.user" :withChart="false"/>
								<MkInput :class="$style.deliverCount" v-model.number="d.count" type="number" min="0">
									<template #suffix>{{ i18n.ts._chat.cardSuffix }}</template>
								</MkInput>
							</div>
						</MkFoldableSection>
					</div>
				</MkFoldableSection>
				<div>
					<MkButton primary full :disabled="cardsList.length === 0" @click="done">{{ i18n.ts.create }}</MkButton>
				</div>
			</div>
		</div>
	</div>
</MkWindow>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onMounted, useTemplateRef } from 'vue';
import { i18n } from '@/i18n.js';
import MkWindow from '@/components/MkWindow.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue'

const title = ref('');
const cardsList = ref<{ name: string, count: number }[]>([{ name: '', count: 1}]);
const deliver = ref<{ user: Misskey.entities.UserLite; count: number }[]>([]);
const allCount = ref(1);

const emit = defineEmits<{
	(ev: 'done', v: { updated?: any; created?: any }): void;
	(ev: 'closed'): void;
}>();

const props = defineProps<{
	cards?: { title: string; cards: string[]; deliver: { user: Misskey.entities.UserLite; count: number }[] } | null;
	members: Record<string, Misskey.entities.ChatRoomMembership>;
}>();

const uiWindow = useTemplateRef('uiWindow');

function updateToMembers() {
	const known = new Set(deliver.value.map(d => d.user.id));
	const updated = new Set(Object.keys(props.members).filter(uid => !props.members[uid].hasLeft));
	const left = known.difference(updated);
	const joined = updated.difference(known);
	deliver.value = [...deliver.value.filter(d => !left.has(d.user.id)), ...Array.from(joined).map(uid => ({ user: props.members[uid].user, count: 1}))];
}

onMounted(() => {
	if (props.cards != null) {
		title.value = props.cards.title;
		cardsList.value = [...props.cards.cards];
		deliver.value = props.cards.deliver.map(d => ({ ...d }));
	}
	updateToMembers()
});

watch(() => ({ ...props.members }), updateToMembers);

function addCard() {
	cardsList.value.push({ name: '', count: 1 });
}

function removeCard(idx: number) {
	cardsList.value.splice(idx, 1);
}

function applyToAll() {
	deliver.value = deliver.value.map(d => ({ ...d, count: allCount.value}));
}

async function done() {
	emit('done', {
		created: {
			title: title.value,
			cards: cardsList.value.filter(c => (c.name.trim().length > 0) && (c.count > 0)),
			deliver: deliver.value.map(d => ({ ...d })),
		},
	});
	uiWindow.value?.close();
}
</script>
<style lang="scss" module>
.deliverEntry {
	display: flex;
	align-items: center;
	> .deliverTo {
		width: 50%;
	}
	> .deliverCount {
		width: 120px;
	}
}

.cardEntry {
	display: flex;
	gap: 6px;
	align-items: center;
	> .cardName {
		flex: 2;
	}
	.cardCount {
		flex: 1;
	}
}
.applyToAll {
	display: flex;
	gap: 6px;
	align-items: center;
}
</style>

<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :reversed="tab === 'chat'" :tabs="headerTabs" :actions="headerActions">
	<div v-if="tab === 'chat'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<div class="_gaps">
			<div v-if="initializing">
				<MkLoading/>
			</div>

			<div v-else-if="timelineItems.length === 0">
				<div class="_gaps" style="text-align: center;">
					<div>{{ i18n.ts._chat.noMessagesYet }}</div>
					<template v-if="user">
						<div v-if="user.chatScope === 'followers'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromFollowers }}</div>
						<div v-else-if="user.chatScope === 'following'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromFollowing }}</div>
						<div v-else-if="user.chatScope === 'mutual'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromMutualFollowing }}</div>
						<div v-else-if="user.chatScope === 'none'">{{ i18n.ts._chat.thisUserNotAllowedChatAnyone }}</div>
					</template>
					<template v-else-if="room">
						<div>{{ i18n.ts._chat.inviteUserToChat }}</div>
					</template>
				</div>
			</div>

			<div v-else ref="timelineEl" class="_gaps">
				<div v-if="isArchived" :class="$style.isArchived">{{ i18n.ts._chat.thisRoomIsArchived }}</div>
				<div v-if="canFetchMore">
					<MkButton :class="$style.more" :wait="moreFetching" primary rounded @click="fetchMore">{{ i18n.ts.loadMore }}</MkButton>
				</div>
				<div :class="$style.stickyTop">
					<div v-for="secret in secrets" :key="secret.id" :class="$style.secret">
						<span><MkAvatar :user="membersMap[secret.fromUserId]?.user as Misskey.entities.UserLite" :class="$style.avatar"/> {{ i18n.tsx._chat.hasCommittedSecret({ what: secret.title ?? '' }) }}</span>
						<span v-if="secret.revealsAt !=null" :class="$style.countdownContainer">{{ i18n.ts._chat.revealsIn }} <MkCountdown :to="Date.parse(secret.revealsAt)" :class="$style.countdown"/></span>
						<MkButton v-if="secret.fromUserId === $i.id" primary rounded @click="() => onRevealClick(secret)">{{ i18n.ts._chat.revealSecret }}</MkButton>
					</div>
					<div v-if="cards.length > 0" :class="$style.cards">
						<i class="ti ti-cards"/>
						<div v-for="card in cards" :key="`${card.deliverId}-${card.cardId}`" :class="$style.card">
							<div :class="$style.cardContent">{{ card.cardKind }}</div>
							<MkButton primary @click="() => onCardRevealClick(card)">{{ i18n.ts._chat.revealCard }}</MkButton>
						</div>
					</div>
					<div v-for="poll in polls" :key="poll.id" :class="$style.poll">
						<span>{{ i18n.ts._chat.poll }}: {{ poll.title }}</span>
						<span v-if="!(poll as TrackedPoll).started && (poll as TrackedPoll).startsAt != null" :class="$style.countdownContainer">{{ i18n.ts._chat.startsIn }} <MkCountdown :to="Date.parse((poll as TrackedPoll).startsAt!)" :class="$style.countdown"/></span>
						<MkButton v-if="!(poll as TrackedPoll).started && (poll as TrackedPoll).fromUserId === $i.id" danger rounded @click="() => onPollStartClick(poll)">{{ i18n.ts._chat.startPoll }}</MkButton>
						<span v-if="(poll as TrackedPoll).started && (poll as TrackedPoll).finishesAt !=null" :class="$style.countdownContainer">{{ i18n.ts._chat.finishesIn }} <MkCountdown :to="Date.parse((poll as TrackedPoll).finishesAt!)" :class="$style.countdown"/></span>
						<MkButton v-if="(poll as TrackedPoll).started && (poll as TrackedPoll).fromUserId === $i.id" danger rounded @click="() => onPollFinishClick(poll as Misskey.entities.ChatPollStarted)">{{ i18n.ts._chat.finishPoll }}</MkButton>
						<MkButton v-if="(poll as TrackedPoll).started" primary rounded @click="() => onVoteClick(poll as Misskey.entities.ChatPollStarted)" :disabled="(poll as TrackedPoll).voted">{{ (poll as TrackedPoll).voted ? i18n.ts._chat.voted : i18n.ts._chat.vote }}</MkButton>
					</div>
				</div>

				<TransitionGroup
					:enterActiveClass="prefer.s.animation ? $style.transition_x_enterActive : ''"
					:leaveActiveClass="prefer.s.animation ? $style.transition_x_leaveActive : ''"
					:enterFromClass="prefer.s.animation ? $style.transition_x_enterFrom : ''"
					:leaveToClass="prefer.s.animation ? $style.transition_x_leaveTo : ''"
					:moveClass="prefer.s.animation ? $style.transition_x_move : ''"
					tag="div" class="_gaps"
				>
					<template v-for="item in dateSeparatedTimeline.toReversed()" :key="item.id">
						<XMessage v-if="item.type === 'item'" :item="item.data as TimelineItem" :membership="membersMap[((item.data as TimelineItem).data as { fromUserId: string }).fromUserId]"/>
						<div v-else-if="item.type === 'date'" :class="$style.dateDivider">
							<span><i class="ti ti-chevron-up"></i> {{ item.nextText }}</span>
							<span style="height: 1em; width: 1px; background: var(--MI_THEME-divider);"></span>
							<span>{{ item.prevText }} <i class="ti ti-chevron-down"></i></span>
						</div>
					</template>
				</TransitionGroup>
			</div>

			<div v-if="user && (!user.canChat || user.host !== null)">
				<MkInfo warn>{{ i18n.ts._chat.chatNotAvailableInOtherAccount }}</MkInfo>
			</div>

			<MkInfo v-if="$i.policies.chatAvailability !== 'available'" warn>{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>
		</div>
	</div>

	<div v-else-if="tab === 'search'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XSearch :userId="userId" :roomId="roomId"/>
	</div>

	<div v-else-if="tab === 'members'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XMembers v-if="room != null" :room="room" @inviteUser="inviteUser"/>
	</div>

	<div v-else-if="tab === 'info'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XInfo v-if="room != null" :room="room"/>
	</div>

	<template #footer>
		<div v-if="tab === 'chat'" :class="$style.footer">
			<div class="_gaps">
				<Transition name="fade">
					<div v-show="showIndicator" :class="$style.new">
						<button class="_buttonPrimary" :class="$style.newButton" @click="onIndicatorClick">
							<i class="fas ti-fw fa-arrow-circle-down" :class="$style.newIcon"></i>{{ i18n.ts._chat.newMessage }}
						</button>
					</div>
				</Transition>
				<XForm v-if="initialized" :is-archived="isArchived" :user="user" :room="room" :members="membersMap" :class="$style.form"/>
			</div>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, computed, onMounted, onBeforeUnmount, onDeactivated, onActivated } from 'vue';
import * as Misskey from 'misskey-js';
import { getScrollContainer } from '@@/js/scroll.js';
import XMessage from './XMessage.vue';
import XForm from './room.form.vue';
import XSearch from './room.search.vue';
import XMembers from './room.members.vue';
import XInfo from './room.info.vue';
import XVote from './vote-chat-poll.vue';
import type { MenuItem } from '@/types/menu.js';
import type { PageHeaderItem } from '@/types/page-header.js';
import * as os from '@/os.js';
import { useStream } from '@/stream.js';
import * as sound from '@/utility/sound.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { prefer } from '@/preferences.js';
import MkButton from '@/components/MkButton.vue';
import MkCountdown from '@/components/MkCountdown.vue';
import { useRouter } from '@/router.js';
import { useMutationObserver } from '@/composables/use-mutation-observer.js';
import MkInfo from '@/components/MkInfo.vue';
import { makeDateSeparatedTimelineComputedRef } from '@/utility/timeline-date-separate.js';

const $i = ensureSignin();
const router = useRouter();

const props = defineProps<{
	userId?: string;
	roomId?: string;
}>();

export type NormalizedChatMessage = Omit<Misskey.entities.ChatMessageLite, 'fromUser' | 'reactions'> & {
	fromUser: Misskey.entities.UserLite;
	reactions: (Misskey.entities.ChatMessageLite['reactions'][number] & {
		user: Misskey.entities.UserLite;
	})[];
};

export type TimelineItem = {
	type: 'message';
	data: Misskey.entities.ChatMessageLite;
} | {
	type: 'pollScheduled';
	data: Misskey.entities.ChatPollScheduled;
} | {
	type: 'pollStarted';
	data: Misskey.entities.ChatPollStarted;
} | {
	type: 'pollFinished';
	data: Misskey.entities.ChatPollFinished;
} | {
	type: 'cardDelivered';
	data: Misskey.entities.ChatCard;
} | {
	type: 'cardRevealed';
	data: Misskey.entities.ChatCardRevealed;
} | {
	type: 'secretCommitted';
	data: Misskey.entities.ChatSecret;
} | {
	type: 'secretRevealed';
	data: Misskey.entities.ChatSecretRevealed;
} | {
	type: 'join';
	data: Misskey.entities.ChatRoomMembership;
} | {
	type: 'leave';
	data: {
		userId: string;
		createdAt: string;
		kicked: boolean;
		user: Misskey.entities.UserLite;
	};
} | {
	type: 'roomArchived';
	data: object;
} | {
	type: 'membershipUpdated';
	data: Misskey.entities.ChatRoomMembership;
};

export type TrackedPoll = (Misskey.entities.ChatPollScheduled & { started?: boolean; voted?: boolean; finishesAt?: string | null }) | (Misskey.entities.ChatPollStarted & { started?: boolean; voted?: boolean; startsAt?: string | null });

export type ChatPollDraft = { title: string; choices: string[] | Misskey.entities.UserLite[]; textChoices: string[]; userChoices: string[]; startsIn: number | null; duration: number; anonymous: boolean; voteForUsers: boolean };
export type ChatSecretDraft = { title: string | null; plaintext: string; revealsIn: number | null };
export type ChatCardsDraft = { title: string; cards: string[]; deliver: { user: Misskey.entities.UserLite; count: number }[] };

const initializing = ref(false);
const initialized = ref(false);
const moreFetching = ref(false);
const timelineItems = ref<TimelineItem[]>([]);
const canFetchMore = ref(false);
const user = ref<Misskey.entities.UserDetailed | null>(null);
const room = ref<Misskey.entities.ChatRoom | null>(null);
const connection = ref<Misskey.IChannelConnection<Misskey.Channels['chatUser']> | Misskey.IChannelConnection<Misskey.Channels['chatRoom']> | null>(null);
const showIndicator = ref(false);
const timelineEl = useTemplateRef('timelineEl');

const membersMap = ref<Record<string, Misskey.entities.ChatRoomMembership>>({});
const secrets = ref<Misskey.entities.ChatSecret[]>([]);
const cards = ref<Misskey.entities.ChatCard[]>([]);
const polls = ref<TrackedPoll[]>([]);
const isArchived = ref(false);

const dateSeparatedTimeline = makeDateSeparatedTimelineComputedRef(
	computed(() => timelineItems.value.map(item => ({
		id: (item.data as { id?: string; deliverId?: string }).id ?? (item.data as { deliverId?: string }).deliverId ?? '',
		createdAt: (item.data as { createdAt: string }).createdAt,
		...item,
	}))),
);

const SCROLL_HEAD_THRESHOLD = 200;

// column-reverseなので本来はスクロール位置の最下部への追従は不要なはずだが、おそらくブラウザのバグにより、最下部にスクロールした状態でも追従されない場合がある(スクロール位置が少数になることがあるのが関わっていそう)
// そのため補助としてMutationObserverを使って追従を行う
useMutationObserver(timelineEl, {
	subtree: true,
	childList: true,
	attributes: false,
}, () => {
	const scrollContainer = getScrollContainer(timelineEl.value)!;
	// column-reverseなのでscrollTopは負になる
	if (-scrollContainer.scrollTop < SCROLL_HEAD_THRESHOLD) {
		scrollContainer.scrollTo({
			top: 0,
			behavior: 'instant',
		});
	}
});

function normalizeMessage(message: Misskey.entities.ChatMessageLite | Misskey.entities.ChatMessage): NormalizedChatMessage {
	return {
		...message,
		fromUser: message.fromUser ?? (message.fromUserId === $i.id ? $i : user.value!),
		reactions: message.reactions.map(record => ({
			...record,
			user: record.user ?? (message.fromUserId === $i.id ? user.value! : $i),
		})),
	};
}

async function initialize() {
	const LIMIT = 20;

	if (initializing.value) return;

	initializing.value = true;
	initialized.value = false;

	if (props.userId) {
		const [u, m] = await Promise.all([
			misskeyApi('users/show', { userId: props.userId }),
			misskeyApi('chat/messages/user-timeline', { userId: props.userId, limit: LIMIT }),
		]);

		user.value = u;
		timelineItems.value = m.map(x => ({ type: 'message' as const, data: normalizeMessage(x) }));

		membersMap.value = { [$i.id]: { user: $i, bubbleColor: "", bubbleStyle: "" } as unknown as Misskey.entities.ChatRoomMembership, [u.id]: { user: u, bubbleColor: "", bubbleStyle: "" } as unknown as Misskey.entities.ChatRoomMembership };

		if (timelineItems.value.length === LIMIT) {
			canFetchMore.value = true;
		}

		connection.value = useStream().useChannel('chatUser', {
			otherId: user.value.id,
		});

		connection.value.on('message', onMessage);
		connection.value.on('deleted', onDeleted);
		connection.value.on('react', onReact);
		connection.value.on('unreact', onUnreact);
	} else if (props.roomId) {
		const [rResult, mResult, membersResult, sResult, pResult, cResult] = await Promise.allSettled([
			misskeyApi('chat/rooms/show', { roomId: props.roomId }),
			misskeyApi('chat/messages/room-timeline', { roomId: props.roomId, limit: LIMIT }),
			misskeyApi('chat/rooms/members', { roomId: props.roomId, limit: 100 }),
			misskeyApi('chat/secrets/list', { roomId: props.roomId, limit: 100 }),
			misskeyApi('chat/polls/list', { roomId: props.roomId, limit: 100 }),
			misskeyApi('chat/cards/list', { roomId: props.roomId, limit: 100 }),
		]);

		if (rResult.status === 'rejected') {
			os.alert({
				type: 'error',
				text: i18n.ts.somethingHappened,
			});
			initializing.value = false;
			return;
		}

		const r = rResult.value as Misskey.entities.ChatRoomsShowResponse;

		if (r.invitationExists) {
			const confirm = await os.confirm({
				type: 'question',
				title: r.name,
				text: i18n.ts._chat.youAreNotAMemberOfThisRoomButInvited + '\n' + i18n.ts._chat.doYouAcceptInvitation,
			});
			if (confirm.canceled) {
				initializing.value = false;
				router.push('/chat');
				return;
			} else {
				await os.apiWithDialog('chat/rooms/join', { roomId: r.id });
				initializing.value = false;
				initialize();
				return;
			}
		}

		if (r.isPublic && !r.isJoined && !r.isArchived) {
			await os.apiWithDialog('chat/rooms/join', { roomId: r.id });
			initializing.value = false;
			setTimeout(initialize, 1000);
			return;
		}

		const m = mResult.status === 'fulfilled' ? mResult.value as Misskey.entities.ChatMessagesRoomTimelineResponse : [];
		const members = membersResult.status === 'fulfilled' ? membersResult.value as Misskey.entities.ChatRoomMembership[] : [];
		membersMap.value = Object.fromEntries(members.map(mem => [mem.userId, mem]));

		secrets.value = sResult.status === 'fulfilled' ? sResult.value : [];

		cards.value = cResult.status === 'fulfilled' ? cResult.value : [];

		if (pResult.status === 'fulfilled') {
			const scheduledPolls = pResult.value.scheduledPolls as Misskey.entities.ChatPollScheduled[];
			const startedPolls = pResult.value.startedPolls as Misskey.entities.ChatPollStarted[];
			polls.value = [...scheduledPolls, ...startedPolls.map(p => ({ ...p, started: true }))];
		}

		isArchived.value = r.isArchived ?? false;

		room.value = r;
		timelineItems.value = m;

		if (timelineItems.value.length === LIMIT) {
			canFetchMore.value = true;
		}

		connection.value = useStream().useChannel('chatRoom', {
			roomId: room.value.id,
		});

		connection.value.on('message', onMessage);
		connection.value.on('deleted', onDeleted);
		connection.value.on('react', onReact);
		connection.value.on('unreact', onUnreact);
		connection.value.on('join', onJoin);
		connection.value.on('leave', onLeave);
		connection.value.on('pollScheduled', onPollSchedule);
		connection.value.on('pollStarted', onPollStart);
		connection.value.on('pollFinished', onPollFinish);
		connection.value.on('secretCommitted', onSecretCommit);
		connection.value.on('secretRevealed', onSecretReveal);
		connection.value.on('cardDelivered', onCardDeliver);
		connection.value.on('cardRevealed', onCardReveal);
		connection.value.on('roomArchived', onRoomArchived);
		connection.value.on('membershipUpdated', onMembershipUpdate);
	}

	window.document.addEventListener('visibilitychange', onVisibilitychange);

	initialized.value = true;
	initializing.value = false;
}

let isActivated = true;

onActivated(() => {
	isActivated = true;
});

onDeactivated(() => {
	isActivated = false;
});

async function fetchMore() {
	const LIMIT = 30;

	moreFetching.value = true;

	const lastMessage = timelineItems.value[timelineItems.value.length - 1];
	if (!lastMessage) {
		moreFetching.value = false;
		return;
	}

	const newMessages = props.userId ? await misskeyApi('chat/messages/user-timeline', {
		userId: user.value!.id,
		limit: LIMIT,
		untilId: (lastMessage.data as { id?: string; deliverId?: string }).id ?? (lastMessage.data as { deliverId?: string }).deliverId,
	}) : await misskeyApi('chat/messages/room-timeline', {
		roomId: room.value!.id,
		limit: LIMIT,
		untilId: (lastMessage.data as { id?: string; deliverId?: string }).id ?? (lastMessage.data as { deliverId?: string }).deliverId,
	});

	// TODO: normalize
	timelineItems.value.push(...(newMessages.map((m: any) => ({ type: 'message' as const, data: normalizeMessage(m) }))));

	canFetchMore.value = newMessages.length === LIMIT;
	moreFetching.value = false;
}

function onMessage(message: Misskey.entities.ChatMessageLite) {
	sound.playMisskeySfx('chatMessage');

	timelineItems.value.unshift({ type: 'message' as const, data: normalizeMessage(message) });

	// TODO: DOM的にバックグラウンドになっていないかどうかも考慮する
	if (message.fromUserId !== $i.id && !window.document.hidden && isActivated) {
		connection.value?.send('read', {
			id: message.id,
		});
	}

	if (message.fromUserId !== $i.id) {
		//notifyNewMessage();
	}
}

function onJoin(membership: Misskey.entities.ChatRoomMembership) {
	sound.playMisskeySfx('chatMessage');
	timelineItems.value.unshift({ type: 'join', data: membership });
	membersMap.value[membership.userId] = membership;
}
function onLeave(data: { userId: string; createdAt: string; kicked: boolean }) {
	sound.playMisskeySfx('chatMessage');
	timelineItems.value.unshift({ type: 'leave', data: { ...data, user: membersMap.value[data.userId].user as Misskey.entities.UserLite } });
	membersMap.value[data.userId] = { ...membersMap.value[data.userId], hasLeft: true };
}
function onPollSchedule(poll: Misskey.entities.ChatPollScheduled) {
	sound.playMisskeySfx('chatMessage');
	timelineItems.value.unshift({ type: 'pollScheduled', data: poll });
	polls.value.push(poll);
}
function onPollStart(poll: Misskey.entities.ChatPollStarted) {
	sound.playMisskeySfx('chatMessage');
	timelineItems.value.unshift({ type: 'pollStarted', data: poll });
	polls.value = polls.value.filter(p => p.id !== poll.id);
	polls.value.push({...poll, started: true} as TrackedPoll);
}
function onPollFinish(poll: Misskey.entities.ChatPollFinished) {
	sound.playMisskeySfx('chatMessage');
	timelineItems.value.unshift({ type: 'pollFinished', data: poll });
	polls.value = polls.value.filter(p => p.id !== poll.id);
}
function onSecretCommit(secret: Misskey.entities.ChatSecret) {
	sound.playMisskeySfx('chatMessage');
	timelineItems.value.unshift({ type: 'secretCommitted', data: secret });
	secrets.value.push(secret);
}
function onSecretReveal(secret: Misskey.entities.ChatSecretRevealed) {
	sound.playMisskeySfx('chatMessage');
	timelineItems.value.unshift({ type: 'secretRevealed', data: secret });
	secrets.value = secrets.value.filter(s => s.id !== secret.id);
}
function onCardDeliver(card: Misskey.entities.ChatCard) {
	sound.playMisskeySfx('chatMessage');
	timelineItems.value.unshift({ type: 'cardDelivered', data: card });
	cards.value.push(card);
}
function onCardReveal(card: Misskey.entities.ChatCardRevealed) {
	sound.playMisskeySfx('chatMessage');
	timelineItems.value.unshift({ type: 'cardRevealed', data: card });
	cards.value = cards.value.filter((c) => c.deliverId != card.deliverId || c.cardId != card.cardId); 
}
function onRoomArchived() {
	isArchived.value = true;
}
function onMembershipUpdate(membership: Misskey.entities.ChatRoomMembership) {
	console.log(membersMap.value[membership.userId]);
	membersMap.value[membership.userId].bubbleColor = membership.bubbleColor;
}

function onDeleted(id: string) {
	const index = timelineItems.value.findIndex(item => ((item.data as { id?: string; deliverId?: string }).id ?? (item.data as { deliverId?: string }).deliverId) === id);
	if (index !== -1) {
		timelineItems.value.splice(index, 1);
	}
}

function onReact(ctx: Parameters<Misskey.Channels['chatUser']['events']['react']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['react']>[0]) {
	const item = timelineItems.value.find(item => item.type === 'message' && item.data.id === ctx.messageId);
	if (item?.type === 'message') {
		if (room.value == null) { // 1on1の時はuserは省略される
			item.data.reactions.push({
				reaction: ctx.reaction,
				user: item.data.fromUserId === $i.id ? user.value! : $i,
			});
		} else {
			item.data.reactions.push({
				reaction: ctx.reaction,
				user: ctx.user!,
			});
		}
	}
}

function onUnreact(ctx: Parameters<Misskey.Channels['chatUser']['events']['unreact']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['unreact']>[0]) {
	const item = timelineItems.value.find(item => item.type === 'message' && item.data.id === ctx.messageId);
	if (item?.type === 'message') {
		const index = item.data.reactions.findIndex(r => r.reaction === ctx.reaction && r.user?.id === ctx.user!.id);
		if (index !== -1) {
			item.data.reactions.splice(index, 1);
		}
	}
}

function onIndicatorClick() {
	showIndicator.value = false;
}

function onRevealClick(secret: Misskey.entities.ChatSecret) {
		os.confirm({
			type: 'warning',
			text: i18n.tsx._chat.secretRevealConfirm({ what: secret.title ?? '' }),
		}).then(({ canceled }) => {
			if (canceled) return;
			misskeyApi('chat/secrets/reveal', {
				id: secret.id,
			})
		});
}

function onCardRevealClick(card: Misskey.entities.ChatCard) {
		os.confirm({
			type: 'warning',
			text: i18n.tsx._chat.cardRevealConfirm({ what: card.cardKind }),
		}).then(({ canceled }) => {
			if (canceled) return;
			misskeyApi('chat/cards/reveal', {
				deliverId: card.deliverId,
				cardId: card.cardId,
			})
		});
}

async function onVoteClick(poll: Misskey.entities.ChatPollStarted) {
	const { dispose } = await os.popupAsyncWithDialog(import('./vote-chat-poll.vue').then(x => x.default), {
		options: (poll.voteForUsers ? poll.userChoices : poll.textChoices) ?? [],
		voteForUsers: poll.voteForUsers,
	}, {
		done: (result: { choice: number } | null) => {
			if (result == null) return;
			misskeyApi('chat/polls/vote', {
				pollId: poll.id,
				choice: result.choice,
			}).then(() => {
				(poll as TrackedPoll).voted = true;
				sound.playMisskeySfx('chatMessage');
			});
		},
		closed: () => dispose(),
	});
}

function onPollStartClick(poll: Misskey.entities.ChatPollScheduled) {
		os.confirm({
			type: 'warning',
			text: i18n.tsx._chat.pollStartConfirm({ what: poll.title ?? '' }),
		}).then(({ canceled }) => {
			if (canceled) return;
			misskeyApi('chat/polls/start', {
				pollId: poll.id,
			})
		});
}

function onPollFinishClick(poll: Misskey.entities.ChatPollStarted) {
		os.confirm({
			type: 'warning',
			text: i18n.tsx._chat.pollFinishConfirm({ what: poll.title ?? '' }),
		}).then(({ canceled }) => {
			if (canceled) return;
			misskeyApi('chat/polls/finish', {
				pollId: poll.id,
			})
		});
}

function notifyNewMessage() {
	showIndicator.value = true;
}

function onVisibilitychange() {
	if (window.document.hidden) return;
	// TODO
}

onMounted(() => {
	initialize();
});

onActivated(() => {
	if (!initialized.value) {
		initialize();
	}
});

onBeforeUnmount(() => {
	connection.value?.dispose();
	window.document.removeEventListener('visibilitychange', onVisibilitychange);
});

async function inviteUser() {
	if (room.value == null) return;

	const invitee = await os.selectUser({ includeSelf: false, localOnly: true });
	os.apiWithDialog('chat/rooms/invitations/create', {
		roomId: room.value.id,
		userId: invitee.id,
	});
}

async function editParticipation(): Promise<void> {
	if (room.value == null) return;
	const { dispose } = await os.popupAsyncWithDialog(import('./edit-chat-participation.vue').then(x => x.default), {
		roomId: room.value.id
	}, {
		done: result => dispose(),
		closed: () => dispose(),
	});
}

async function leaveRoom() {
	if (room.value == null) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.areYouSure,
	});
	if (canceled) return;

	misskeyApi('chat/rooms/leave', {
		roomId: room.value.id,
	});
	connection.value?.dispose();
	initialized.value = false;
	router.push('/chat');
}

const tab = ref('chat');

const headerTabs = computed(() => room.value ? [{
	key: 'chat',
	title: i18n.ts._chat.messages,
	icon: 'ti ti-messages',
}, {
	key: 'members',
	title: i18n.ts._chat.members,
	icon: 'ti ti-users',
}, {
	key: 'search',
	title: i18n.ts.search,
	icon: 'ti ti-search',
}, {
	key: 'info',
	title: i18n.ts.info,
	icon: 'ti ti-info-circle',
}] : [{
	key: 'chat',
	title: i18n.ts._chat.messages,
	icon: 'ti ti-messages',
}, {
	key: 'search',
	title: i18n.ts.search,
	icon: 'ti ti-search',
}]);

const headerActions = computed<PageHeaderItem[]>(() => {
	const actions: PageHeaderItem[] = [];

	if (room.value) {
		if (room.value.ownerId === $i.id) {
			actions.push({
				text: i18n.ts._chat.inviteUser,
				icon: 'ti ti-user-plus',
				handler: () => {
					inviteUser();
				},
			});
		}
		actions.push({
			text: '',
			icon: 'ti ti-settings',
			handler: () => {
				editParticipation();
			},
		});
		if (room.value.ownerId !== $i.id) {
			actions.push({
				text: i18n.ts._chat.leave,
				icon: 'ti ti-x',
				showText: true,
				handler: () => {
					leaveRoom();
				},
			});
		}
	}

	return actions;
});

definePage(computed(() => {
	if (initialized.value) {
		if (user.value) {
			return {
				userName: user.value,
				title: user.value.name ?? user.value.username,
				avatar: user.value,
			};
		} else if (room.value) {
			return {
				title: room.value.name,
				icon: 'ti ti-users',
			};
		} else {
			return {
				title: i18n.ts.directMessage,
			};
		}
	} else {
		return {
			title: i18n.ts.directMessage,
		};
	}
}));
</script>

<style lang="scss" module>
.transition_x_move,
.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
}
.transition_x_enterFrom,
.transition_x_leaveTo {
	opacity: 0;
	transform: translateY(80px);
}
.transition_x_leaveActive {
	position: absolute;
}

.root {
}

.more {
	margin: 0 auto;
}

.isArchived {
	position: sticky;
	top: calc(10px + var(--MI-stickyTop, 0px));
	z-index: 100;
	background: var(--MI_THEME-bg);
}

.stickyTop {
	position: sticky;
	top: calc(10px + var(--MI-stickyTop, 0px));
	z-index: 10;
	> div {
		display: flex;
		align-items: center;
		border-radius: 12px;
		padding: 6px 10px;
		gap: 10px;
		border: solid 1px var(--MI_THEME-divider);
		background: var(--MI_THEME-bg);
		> span {
			flex: 1;
			> .avatar {
				height: 30px;
				width: 30px;
			}
		}
	}
}

.cards {
	max-width: 95%;
	overflow-x: scroll;
}

.cardContent {
	text-align: center;
	font-weight: bold;
	font-size: 110%;
}

.countdownContainer {
	font-weight: bold;
}

.countdown {
	font-size: 135%;
	letter-spacing: 0.1rem;
}

.footer {
	width: 100%;
	padding-top: 8px;
}

.new {
	width: 100%;
	padding-bottom: 8px;
	text-align: center;
}

.newButton {
	display: inline-block;
	margin: 0;
	padding: 0 12px;
	line-height: 32px;
	font-size: 12px;
	border-radius: 16px;
}

.newIcon {
	display: inline-block;
	margin-right: 8px;
}

.footer {

}

.form {
	margin: 0 auto;
	width: 100%;
	max-width: 700px;
}

.fade-enter-active, .fade-leave-active {
	transition: opacity 0.1s;
}

.fade-enter-from, .fade-leave-to {
	transition: opacity 0.5s;
	opacity: 0;
}

.dateDivider {
	display: flex;
	font-size: 85%;
	align-items: center;
	justify-content: center;
	gap: 0.5em;
	opacity: 0.75;
	border: solid 0.5px var(--MI_THEME-divider);
	border-radius: 999px;
	width: fit-content;
	padding: 0.5em 1em;
	margin: 0 auto;
}
</style>

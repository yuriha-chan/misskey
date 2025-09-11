<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="item" :class="[$style.root, { [$style.isMe]: isMe }]">
	<MkAvatar v-if="item.type === 'message' && props.membership?.user"  :class="[$style.avatar, prefer.s.useStickyIcons ? $style.useSticky : null]" :user="props.membership?.user" :link="!isMe" :preview="false"/>
	<div :class="[$style.body, item.type === 'message' && item.data.file != null ? $style.fullWidth : null]" @contextmenu.stop="onContextmenu">
		<div :class="$style.header"><MkUserName v-if="!isMe && prefer.s['chat.showSenderName'] && fromUser != null" :user="fromUser"/></div>
		<MkFukidashi v-if="item.type === 'message'" :class="$style.fukidashi" :tail="isMe ? 'right' : 'left'" :fullWidth="item.type === 'message' && item.data.file != null" :accented="isMe" :style="bubbleStyle">
			<Mfm
				v-if="item.data.text"
				ref="text"
				class="_selectable"
				:text="item.data.text"
				:i="$i"
				:nyaize="'respect'"
				:enableEmojiMenu="true"
				:enableEmojiMenuReaction="true"
			/>
			<MkMediaList v-if="item.data.file" :mediaList="[item.data.file]" :class="$style.file"/>
			<MkUrlPreview v-for="url in urls" :key="url" :url="url" style="margin: 8px 0;"/>
		</MkFukidashi>
		<div v-else-if="item.type === 'pollStarted'">
			<div :class="$style.poll">
				<div> {{ item.data.userId }} has started a new poll:</div>
				<div><b>{{ item.data.question }}</b></div>
				<div v-for="(choice, i) in item.data.choices" :key="i" :class="$style.pollChoice" @click="vote(i)">
					<span>{{ choice.text }}</span>
				</div>
			</div>
		</div>
		<div v-else-if="item.type === 'pollFinished'">
			<div :class="$style.poll">
				<div><b>{{ item.data.question }}</b></div>
				<div v-for="(choice, i) in item.data.choices" :key="i" :class="$style.pollChoice">
					<span>{{ choice.text }}</span> ⇒ <span>{{ choice.votes }}</span> votes
				</div>
			</div>
		</div>
		<div v-else-if="item.type === 'secretCommitted'">
			<div :class="$style.secret">
				<span class="$style.message"><MkMention v-if="props.membership?.user" :username="props.membership.user.username" :host="props.membership.user.host ?? localhost"/>{{ i18n.tsx._chat.secretCommited({title: item.data.title}) }}</span>
			</div>
		</div>
		<div v-else-if="item.type === 'secretRevealed'" :class="$style.secret">
			<div class="$style.message"><MkMention v-if="props.membership?.user" :username="props.membership.user.username" :host="props.membership.user.host ?? localhost"/>{{ i18n.ts._chat.secretRevealed }}</div>
			<div>{{ item.data.title }} ⇒ <span :class="$style.plainText">{{ item.data.plaintext }}</span></div>
		</div>
		<div v-else-if="item.type === 'cardsDelivered'">
			<div :class="$style.card" v-for="card in item.data.cards">
				<div :class="$style.cardHeader">
					<i class="ti ti-cards"></i>
					Your card(s) deliverd: <b>{{ card.title }}</b>
				</div>
			</div>
		</div>
		<div v-else-if="item.type === 'join'">
			{{ i18n.tsx._chat.userHasJoined({ who: `${item.data.user.name ?? ''} (@${item.data.user.username})` }) }}
		</div>
		<div v-else-if="item.type === 'leave'">
			{{ item.data.kicked ?
				i18n.tsx._chat.userHasKicked({ who: `${item.data.user.name ?? ''} (@${item.data.user.username})` }) :
				i18n.tsx._chat.userHasLeft({ who: `${item.data.user.name ?? ''} (@${item.data.user.username})` }) }}
		</div>

		<div :class="$style.footer">
			<button v-if="item.type === 'message'" class="_textButton" style="color: currentColor;" @click="showMenu"><i class="ti ti-dots-circle-horizontal"></i></button>
			<MkTime :class="$style.time" :time="item.data.createdAt"/>
			<MkA v-if="isSearchResult && 'toRoom' in item.data && item.data.toRoom != null" :to="`/chat/room/${item.data.toRoomId}`">{{ item.data.toRoom.name }}</MkA>
			<MkA v-if="isSearchResult && 'toUser' in item.data && item.data.toUser != null && isMe" :to="`/chat/user/${item.data.toUserId}`">@{{ item.data.toUser.username }}</MkA>
		</div>
		<TransitionGroup
			v-if="item.type === 'message'"
			:enterActiveClass="prefer.s.animation ? $style.transition_reaction_enterActive : ''"
			:leaveActiveClass="prefer.s.animation ? $style.transition_reaction_leaveActive : ''"
			:enterFromClass="prefer.s.animation ? $style.transition_reaction_enterFrom : ''"
			:leaveToClass="prefer.s.animation ? $style.transition_reaction_leaveTo : ''"
			:moveClass="prefer.s.animation ? $style.transition_reaction_move : ''"
			tag="div" :class="$style.reactions"
		>
			<div v-for="record in (item.data as NormalizedChatMessage).reactions" :key="record.reaction + record.user.id" :class="[$style.reaction, record.user.id === $i.id ? $style.reactionMy : null]" @click="onReactionClick(record)">
				<MkAvatar :user="record.user" :link="false" :class="$style.reactionAvatar"/>
				<MkReactionIcon
					:withTooltip="true"
					:reaction="record.reaction.replace(/^:(\w+):$/, ':$1@.:')"
					:noStyle="true"
					:class="$style.reactionIcon"
				/>
			</div>
		</TransitionGroup>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, provide, ref } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import { url, host as localhost } from '@@/js/config.js';
import { isLink } from '@@/js/is-link.js';
import type { MenuItem } from '@/types/menu.js';
import type { TimelineItem, NormalizedChatMessage } from './room.vue';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm.js';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import MkFukidashi from '@/components/MkFukidashi.vue';
import * as os from '@/os.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import MkMediaList from '@/components/MkMediaList.vue';
import { reactionPicker } from '@/utility/reaction-picker.js';
import * as sound from '@/utility/sound.js';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { getHTMLElementOrNull } from '@/utility/get-dom-node-or-null.js';
import MkMention from '@/components/MkMention.vue';

const $i = ensureSignin();

const props = defineProps<{
	item: TimelineItem;
	membership?: Misskey.entities.ChatRoomMembership;
	isSearchResult?: boolean;
}>();

const fromUser = computed(() => props.item.data.fromUser ?? props.item.data.user);
const isMe = computed(() => fromUser.value?.id === $i.id);
const urls = computed(() => (props.item.type === 'message' && props.item.data.text) ? extractUrlFromMfm(mfm.parse(props.item.data.text)) : []);

const bubbleStyle = computed(() => {
	if (props.membership?.bubbleColor) {
		return {
			'--mk-fukidashi-bg': props.membership.bubbleColor,
		};
	}
	return {};
});

const revealedSecrets = ref<Record<string, string>>({});

provide(DI.mfmEmojiReactCallback, (reaction: string) => {
	if ($i.policies.chatAvailability !== 'available' || props.item.type !== 'message') return;

	sound.playMisskeySfx('reaction');
	misskeyApi('chat/messages/react', {
		messageId: props.item.data.id,
		reaction: reaction,
	});
});

async function vote(choiceIndex: number) {
	if (props.item.type !== 'poll') return;
	await misskeyApi('chat/polls/vote', {
		pollId: props.item.data.id,
		choice: choiceIndex,
	});
}

async function revealSecret(secretId: string) {
	try {
		const revealed = await misskeyApi('chat/secrets/reveal', { secretId });
		revealedSecrets.value[secretId] = revealed.text;
	} catch (err) {
		console.error(err);
		os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

function react(ev: MouseEvent) {
	if ($i.policies.chatAvailability !== 'available' || props.item.type !== 'message') return;

	const targetEl = getHTMLElementOrNull(ev.currentTarget ?? ev.target);
	if (!targetEl) return;

	reactionPicker.show(targetEl, null, async (reaction) => {
		sound.playMisskeySfx('reaction');
		misskeyApi('chat/messages/react', {
			messageId: props.item.data.id,
			reaction: reaction,
		});
	});
}

function onReactionClick(record: Misskey.entities.ChatMessage['reactions'][0]) {
	if ($i.policies.chatAvailability !== 'available' || props.item.type !== 'message') return;

	if (record.user.id === $i.id) {
		misskeyApi('chat/messages/unreact', {
			messageId: props.item.data.id,
			reaction: record.reaction,
		});
	} else {
		if (!(props.item.data as NormalizedChatMessage).reactions.some(r => r.user.id === $i.id && r.reaction === record.reaction)) {
			sound.playMisskeySfx('reaction');
			misskeyApi('chat/messages/react', {
				messageId: props.item.data.id,
				reaction: record.reaction,
			});
		}
	}
}

function onContextmenu(ev: MouseEvent) {
	if (ev.target && isLink(ev.target as HTMLElement)) return;
	if (window.getSelection()?.toString() !== '') return;
	if (props.item.type !== 'message') return;

	showMenu(ev, true);
}

function showMenu(ev: MouseEvent, contextmenu = false) {
	if (props.item.type !== 'message') return;

	const menu: MenuItem[] = [];

	if (!isMe.value && $i.policies.chatAvailability === 'available') {
		menu.push({
			text: i18n.ts.reaction,
			icon: 'ti ti-mood-plus',
			action: (ev) => {
				react(ev);
			},
		});

		menu.push({
			type: 'divider',
		});
	}

	menu.push({
		text: i18n.ts.copyContent,
		icon: 'ti ti-copy',
		action: () => {
			copyToClipboard(props.item.data.text ?? '');
		},
	});

	menu.push({
		type: 'divider',
	});

	if (isMe.value && $i.policies.chatAvailability === 'available') {
		menu.push({
			text: i18n.ts.delete,
			icon: 'ti ti-trash',
			danger: true,
			action: () => {
				misskeyApi('chat/messages/delete', {
					messageId: props.item.data.id,
				});
			},
		});
	}

	if (!isMe.value && fromUser.value != null) {
		menu.push({
			text: i18n.ts.reportAbuse,
			icon: 'ti ti-exclamation-circle',
			action: async () => {
				const localUrl = `${url}/chat/messages/${props.item.data.id}`;
				const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkAbuseReportWindow.vue').then(x => x.default), {
					user: fromUser.value!,
					initialComment: `${localUrl}\n-----\n`,
				}, {
					closed: () => dispose(),
				});
			},
		});
	}

	if (contextmenu) {
		os.contextMenu(menu, ev);
	} else {
		os.popupMenu(menu, ev.currentTarget ?? ev.target);
	}
}
</script>

<style lang="scss" module>
.transition_reaction_move,
.transition_reaction_enterActive,
.transition_reaction_leaveActive {
	transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
}
.transition_reaction_enterFrom,
.transition_reaction_leaveTo {
	opacity: 0;
	transform: scale(0.7);
}
.transition_reaction_leaveActive {
	position: absolute;
}

.root {
	position: relative;
	display: flex;

	&.isMe {
		flex-direction: row-reverse;
		text-align: right;

		.footer {
			flex-direction: row-reverse;
		}
	}
}

.avatar {
	display: block;
	width: 50px;
	height: 50px;

	&.useSticky {
		position: sticky;
		top: calc(16px + var(--MI-stickyTop, 0px));
	}
}

@container (max-width: 450px) {
	.root {
		&.isMe {
			.avatar {
				display: none;
			}
		}
	}

	.avatar {
		width: 42px;
		height: 42px;
	}

	.fukidashi {
		font-size: 90%;
	}
}

.body {
	margin: 0 12px;

	&.fullWidth {
		width: 100%;
	}
}

.header {
	min-height: 4px; // fukidashiの位置調整も兼ねるため
	font-size: 80%;
}

.fukidashi {
	text-align: left;
}

.content {
	overflow: clip;
	overflow-wrap: break-word;
	word-break: break-word;
}

.footer {
	display: flex;
	flex-direction: row;
	gap: 0.5em;
	margin-top: 4px;
	font-size: 75%;
}

.time {
	opacity: 0.5;
}

.reactions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin-top: 8px;

	&:empty {
		display: none;
	}
}

.reaction {
	display: flex;
	align-items: center;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 999px;
	padding: 8px;

	&.reactionMy {
		border-color: var(--MI_THEME-accent);
	}
}

.reactionAvatar {
	width: 24px;
	height: 24px;
	margin-right: 8px;
}

.reactionIcon {
	width: 24px;
	height: 24px;
}

.poll {
	margin-top: 8px;
	b {
		display: block;
		margin-bottom: 8px;
	}
}

.pollChoice {
	display: flex;
	justify-content: space-between;
	padding: 8px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 8px;
	margin-top: 4px;
	cursor: pointer;

	&:hover {
		background: var(--MI_THEME-panel-hover);
	}
}

.secret {
	> .message {
		font-style: italic;
		opacity: 0.8;
	}
	> .plainText {
		font-weight: bold;
		font-size: 110%;
		padding: 0.2em 0.5em;
		letter-spacing: 0.1em;
	}
}

.card {
	padding: 8px;
	.cardHeader {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.1em;
	}
	hr {
		margin: 8px 0;
		border-color: var(--MI_THEME-divider);
	}
	.cardContent {
		white-space: pre-wrap;
		word-break: break-word;
	}
}
</style>

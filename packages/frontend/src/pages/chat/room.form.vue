<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="$style.root"
	@dragover.stop="onDragover"
	@drop.stop="onDrop"
>
	<footer :class="$style.footer">
		<div v-if="file" :class="$style.previewItem" @click="file = null">
			<i class="ti ti-paperclip"></i>
			<span>{{ file.name }}</span>
			<button class="_button"><i class="ti ti-x"></i></button>
		</div>
		<div v-if="poll" :class="$style.previewItem">
			<i class="ti ti-chart-bar"></i>
			<span>{{ poll.title }}</span>
			<button class="_button" @click="poll = null"><i class="ti ti-x"></i></button>
		</div>
		<div v-if="secret" :class="$style.previewItem">
			<i class="ti ti-spy"></i>
			<span>{{ i18n.ts._chat.secretAttached }}</span> - {{ secret.title }} ⇒ {{ secret.plaintext }}
			<button class="_button" @click="secret = null"><i class="ti ti-x"></i></button>
		</div>
		<div v-if="cards" :class="$style.previewItem">
			<i class="ti ti-cards"></i>
			<span>{{ cards.title }}</span>
			<button class="_button" @click="cards = null"><i class="ti ti-x"></i></button>
		</div>

		<div :class="$style.input">
			<button class="_button" :class="$style.button" :title="i18n.ts.attach" @click="openAttachmentMenu"><i class="ti ti-plus"></i></button>
			<button class="_button" :class="$style.button" @click="insertEmoji"><i class="ti ti-mood-happy"></i></button>
			<textarea
				ref="textareaEl"
				v-model="text"
				:class="$style.textarea"
				class="_acrylic"
				:placeholder="props.isArchived ? i18n.ts._chat.thisRoomIsArchived : i18n.ts.inputMessageHere"
				:readonly="textareaReadOnly"
				@keydown="onKeydown"
				@paste="onPaste"
			></textarea>
			<button class="_button" :class="[$style.button, $style.send]" :disabled="props.isArchived || !canSend || sending" :title="i18n.ts.send" @click="send">
				<template v-if="!sending"><i class="ti ti-send"></i></template><template v-if="sending"><MkLoading :em="true"/></template>
			</button>
		</div>
	</footer>
	<input ref="fileEl" style="display: none;" type="file" @change="onChangeFile"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, watch, ref, shallowRef, computed, nextTick, onBeforeUnmount, reactive } from 'vue';
import * as Misskey from 'misskey-js';
import type { ChatPollDraft, ChatSecretDraft, ChatCardsDraft } from './room.vue';
//import insertTextAtCursor from 'insert-text-at-cursor';
import { formatTimeString } from '@/utility/format-time-string.js';
import { selectFile } from '@/utility/drive.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { prefer } from '@/preferences.js';
import { Autocomplete } from '@/utility/autocomplete.js';
import { emojiPicker } from '@/utility/emoji-picker.js';
import { checkDragDataType, getDragData } from '@/drag-and-drop.js';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkButton from '@/components/MkButton.vue';

const props = defineProps<{
	user?: Misskey.entities.UserDetailed | null;
	room?: Misskey.entities.ChatRoom | null;
	members: Record<string, Misskey.entities.ChatRoomMembership>;
	isArchived: boolean;
}>();

const textareaEl = shallowRef<HTMLTextAreaElement>();
const fileEl = shallowRef<HTMLInputElement>();

const text = ref<string>('');
const file = ref<Misskey.entities.DriveFile | null>(null);
const poll = ref<ChatPollDraft | null>(null);
const secret = ref<ChatSecretDraft | null>(null);
const cards = ref<ChatCardsDraft | null>(null);
const sending = ref(false);
const textareaReadOnly = ref(false);
let autocompleteInstance: Autocomplete | null = null;

const canSend = computed(() => (text.value.trim() !== '') || file.value != null || poll.value != null || secret.value != null || cards.value != null);

function openAttachmentMenu(ev: MouseEvent) {
	os.popupMenu([
		{ text: i18n.ts.attachFile, icon: 'ti ti-photo-plus', action: () => chooseFile(ev) },
		{ type: 'divider' },
		{ text: i18n.ts._chat.startPoll, icon: 'ti ti-chart-bar', action: openPollDialog },
		{ text: i18n.ts._chat.attachSecret, icon: 'ti ti-spy', action: openSecretDialog },
		{ text: i18n.ts._chat.deliverCards, icon: 'ti ti-cards', action: openCardsDialog },
	], ev.currentTarget ?? ev.target);
}

async function openPollDialog() {
	const { dispose } = await os.popupAsyncWithDialog(import('./edit-chat-poll.vue').then(x => x.default), {
		poll: poll.value,
		members: props.members,
	}, {
		done: result => {
			if (result.created) {
				poll.value = result.created;
			}
		},
		closed: () => dispose(),
	});
}
async function openSecretDialog(): Promise<void> {
	const { dispose } = await os.popupAsyncWithDialog(import('./edit-chat-secret.vue').then(x => x.default), {
		secret: secret.value,
	}, {
		done: result => {
			if (result.created) {
				secret.value = result.created;
			}
		},
		closed: () => dispose(),
	});
}
async function openCardsDialog() {
	const { dispose } = await os.popupAsyncWithDialog(import('./edit-chat-cards.vue').then(x => x.default), {
		cards: cards.value,
		members: props.members,
	}, {
		done: result => {
			if (result.created) {
				cards.value = result.created;
			}
		},
		closed: () => dispose(),
	});
}

function getDraftKey() {
	return props.user ? 'user:' + props.user.id : 'room:' + props.room?.id;
}

watch([text, file], saveDraft);

async function onPaste(ev: ClipboardEvent) {
	if (!ev.clipboardData) return;

	const pastedFileName = 'yyyy-MM-dd HH-mm-ss [{{number}}]';

	const clipboardData = ev.clipboardData;
	const items = clipboardData.items;

	if (items.length === 1) {
		if (items[0].kind === 'file') {
			const pastedFile = items[0].getAsFile();
			if (!pastedFile) return;
			const lio = pastedFile.name.lastIndexOf('.');
			const ext = lio >= 0 ? pastedFile.name.slice(lio) : '';
			const formattedName = formatTimeString(new Date(pastedFile.lastModified), pastedFileName).replace(/{{number}}/g, '1') + ext;
			const renamedFile = new File([pastedFile], formattedName, { type: pastedFile.type });
			os.launchUploader([renamedFile], { multiple: false }).then(driveFiles => {
				file.value = driveFiles[0];
			});
		}
	} else {
		if (items[0].kind === 'file') {
			os.alert({
				type: 'error',
				text: i18n.ts.onlyOneFileCanBeAttached,
			});
		}
	}
}

function onDragover(ev: DragEvent) {
	if (!ev.dataTransfer) return;

	const isFile = ev.dataTransfer.items[0].kind === 'file';
	if (isFile || checkDragDataType(ev, ['driveFiles'])) {
		ev.preventDefault();
		switch (ev.dataTransfer.effectAllowed) {
			case 'all':
			case 'uninitialized':
			case 'copy':
			case 'copyLink':
			case 'copyMove':
				ev.dataTransfer.dropEffect = 'copy';
				break;
			case 'linkMove':
			case 'move':
				ev.dataTransfer.dropEffect = 'move';
				break;
			default:
				ev.dataTransfer.dropEffect = 'none';
				break;
		}
	}
}

function onDrop(ev: DragEvent): void {
	if (!ev.dataTransfer) return;

	// ファイルだったら
	if (ev.dataTransfer.files.length === 1) {
		ev.preventDefault();
		os.launchUploader([Array.from(ev.dataTransfer.files)[0]], { multiple: false });
		return;
	} else if (ev.dataTransfer.files.length > 1) {
		ev.preventDefault();
		os.alert({
			type: 'error',
			text: i18n.ts.onlyOneFileCanBeAttached,
		});
		return;
	}

	//#region ドライブのファイル
	{
		const droppedData = getDragData(ev, 'driveFiles');
		if (droppedData != null) {
			file.value = droppedData[0];
			ev.preventDefault();
		}
	}
	//#endregion
}

function onKeydown(ev: KeyboardEvent) {
	if (ev.key === 'Enter') {
		if (prefer.s['chat.sendOnEnter']) {
			if (!(ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
				send();
			}
		} else {
			if ((ev.ctrlKey || ev.metaKey)) {
				send();
			}
		}
	}
}

function chooseFile(ev: MouseEvent) {
	selectFile({
		anchorElement: ev.currentTarget ?? ev.target,
		multiple: false,
		label: i18n.ts.selectFile,
	}).then(selectedFile => {
		file.value = selectedFile;
	});
}

function onChangeFile() {
	if (fileEl.value == null || fileEl.value.files == null) return;

	if (fileEl.value.files[0]) {
		os.launchUploader(Array.from(fileEl.value.files), { multiple: false }).then(driveFiles => {
			file.value = driveFiles[0];
		});
	}
}

function packDeliverCards(cards: ChatCardsDraft) {
	return {...cards, deliver: cards.deliver.map(d => ({ count: d.count, userId: d.user.id }))};
}
function packPoll(poll: ChatPollDraft) {
	return {...poll, choices: poll.voteForUsers ? (poll.choices as Misskey.entities.UserLite[]).map(u => u.id) : poll.choices };
}

function send() {
	if (!canSend.value) return;
	sending.value = true;

	const createMessage = (params: any) => props.user
		? misskeyApi('chat/messages/create-to-user', { toUserId: props.user.id, ...params })
		: misskeyApi('chat/messages/create-to-room', { toRoomId: props.room!.id, ...params });

	const createEvent = (endpoint: string, params: any) => props.user
		? misskeyApi(endpoint as any, { toUserId: props.user.id, ...params })
		: misskeyApi(endpoint as any, { toRoomId: props.room!.id, ...params });

	const params: any = {};
	if (text.value.trim()) params.text = text.value;
	if (file.value) params.fileId = file.value.id;
	if (poll.value) params.poll = packPoll(poll.value);
	if (secret.value) params.commitSecret = secret.value;
	if (cards.value) params.deliverCards = packDeliverCards(cards.value);

	createMessage(params).then(() => {
		clear();
	}).catch(err => {
		console.error(err);
		os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}).finally(() => {
		sending.value = false;
	});
}

function clear() {
	text.value = '';
	file.value = null;
	poll.value = null;
	secret.value = null;
	cards.value = null;
	deleteDraft();
}

function saveDraft() {
	const drafts = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}');

	drafts[getDraftKey()] = {
		updatedAt: new Date(),
		data: {
			text: text.value,
			file: file.value,
		},
	};

	miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts));
}

function deleteDraft() {
	const drafts = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}');

	delete drafts[getDraftKey()];

	miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts));
}

async function insertEmoji(ev: MouseEvent) {
	textareaReadOnly.value = true;
	const target = ev.currentTarget ?? ev.target;
	if (target == null) return;

	// emojiPickerはダイアログが閉じずにtextareaとやりとりするので、
	// focustrapをかけているとinsertTextAtCursorが効かない
	// そのため、投稿フォームのテキストに直接注入する
	// See: https://github.com/misskey-dev/misskey/pull/14282
	//      https://github.com/misskey-dev/misskey/issues/14274

	let pos = textareaEl.value?.selectionStart ?? 0;
	let posEnd = textareaEl.value?.selectionEnd ?? text.value.length;
	emojiPicker.show(
		target as HTMLElement,
		emoji => {
			const textBefore = text.value.substring(0, pos);
			const textAfter = text.value.substring(posEnd);
			text.value = textBefore + emoji + textAfter;
			pos += emoji.length;
			posEnd += emoji.length;
		},
		() => {
			textareaReadOnly.value = false;
			nextTick(() => textareaEl.value?.focus());
		},
	);
}

onMounted(() => {
	if (textareaEl.value != null) {
		autocompleteInstance = new Autocomplete(textareaEl.value, text);
	}

	// 書きかけの投稿を復元
	const draft = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}')[getDraftKey()];
	if (draft) {
		text.value = draft.data.text;
		file.value = draft.data.file;
	}
});

onBeforeUnmount(() => {
	if (autocompleteInstance) {
		autocompleteInstance.detach();
		autocompleteInstance = null;
	}
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	border-bottom: none;
	border-radius: 14px 14px 0 0;
	overflow: clip;
}

.textarea {
	cursor: auto;
	display: block;
	width: 100%;
	margin: 0;
	padding: 4px 8px 0;
	resize: none;
	font-size: 1em;
	font-family: inherit;
	outline: none;
	border: none;
	border-radius: 0;
	box-shadow: none;
	box-sizing: border-box;
	color: var(--MI_THEME-fg);
	background: transparent;
	flex-grow: 3;
	field-sizing: content;
}

.footer {
	position: sticky;
	bottom: 0;
	background: var(--MI_THEME-panel);
}

.previewItem {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px;
	font-size: 0.9em;
	border-bottom: solid 1px var(--MI_THEME-divider);

	> i {
		font-size: 1.2em;
	}

	> span {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	> button {
		margin-left: auto;
	}
}

.input {
	display: flex;
	align-items: center;
	padding: 8px;
}

.button {
	height: 40px;
	aspect-ratio: 1;

	&:hover {
		color: var(--MI_THEME-accent);
	}
}
.send {
	margin-left: auto;
	color: var(--MI_THEME-accent);
}
</style>

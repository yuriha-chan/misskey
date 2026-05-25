<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="500"
	:height="550"
	data-cy-user-setup
	@close="close(true)"
	@closed="emit('closed')"
>
	<template v-if="page === 1" #header><i class="ti ti-user-edit"></i> {{ i18n.ts._initialAccountSetting.profileSetting }}</template>
	<template v-else-if="page === 2" #header><i class="ti ti-lock"></i> {{ i18n.ts._initialAccountSetting.privacySetting }}</template>
	<template v-else-if="page === 3" #header><i class="ti ti-rating-18-plus"></i> {{ i18n.ts._initialAccountSetting.r18ContentSetting }}</template>
	<template v-else-if="page === 4" #header><i class="ti ti-user-plus"></i> {{ i18n.ts.follow }}</template>
	<template v-else-if="page === 5" #header><i class="ti ti-bell-plus"></i> {{ i18n.ts.pushNotification }}</template>
	<template v-else-if="page === 6" #header>{{ i18n.ts.done }}</template>
	<template v-else #header>{{ i18n.ts.initialAccountSetting }}</template>

	<div style="overflow-x: clip;">
		<div :class="$style.progressBar">
			<div :class="$style.progressBarValue" :style="{ width: `${(page / 6) * 100}%` }"></div>
		</div>
		<Transition
			mode="out-in"
			:enterActiveClass="$style.transition_x_enterActive"
			:leaveActiveClass="$style.transition_x_leaveActive"
			:enterFromClass="$style.transition_x_enterFrom"
			:leaveToClass="$style.transition_x_leaveTo"
		>
			<template v-if="page === 0">
				<div :class="$style.centerPage">
					<MkAnimBg style="position: absolute; top: 0;" :scale="1.5"/>
					<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
						<div class="_gaps" style="text-align: center;">
							<i class="ti ti-confetti" style="display: block; margin: auto; font-size: 3em; color: var(--MI_THEME-accent);"></i>
							<div style="font-size: 120%;">{{ i18n.ts._initialAccountSetting.accountCreated }}</div>
							<div>{{ i18n.ts._initialAccountSetting.letsStartAccountSetup }}</div>
							<MkButton primary rounded gradate style="margin: 16px auto 0 auto;" data-cy-user-setup-continue @click="page++">{{ i18n.ts._initialAccountSetting.profileSetting }} <i class="ti ti-arrow-right"></i></MkButton>
							<MkButton style="margin: 0 auto;" transparent rounded @click="later(true)">{{ i18n.ts.later }}</MkButton>
						</div>
					</div>
				</div>
			</template>
			<template v-else-if="page === 1">
				<div style="height: 100cqh; overflow: auto;">
					<div :class="$style.pageRoot">
						<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;" :class="$style.pageMain">
							<XProfile/>
						</div>
						<div :class="$style.pageFooter">
							<div class="_buttonsCenter">
								<MkButton rounded data-cy-user-setup-back @click="page--"><i class="ti ti-arrow-left"></i> {{ i18n.ts.goBack }}</MkButton>
								<MkButton primary rounded gradate data-cy-user-setup-continue @click="page++">{{ i18n.ts.continue }} <i class="ti ti-arrow-right"></i></MkButton>
							</div>
						</div>
					</div>
				</div>
			</template>
			<template v-else-if="page === 2">
				<div style="height: 100cqh; overflow: auto;">
					<div :class="$style.pageRoot">
						<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;" :class="$style.pageMain">
							<XPrivacy/>
						</div>
						<div :class="$style.pageFooter">
							<div class="_buttonsCenter">
								<MkButton rounded data-cy-user-setup-back @click="page--"><i class="ti ti-arrow-left"></i> {{ i18n.ts.goBack }}</MkButton>
								<MkButton primary rounded gradate data-cy-user-setup-continue @click="page++">{{ i18n.ts.continue }} <i class="ti ti-arrow-right"></i></MkButton>
							</div>
						</div>
					</div>
				</div>
			</template>
			<template v-else-if="page === 3">
				<div style="height: 100cqh; overflow: auto;">
					<div :class="$style.pageRoot">
						<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;" :class="$style.pageMain">
							<div class="_gaps_s">
								<div :class="$style.r18Description">{{ i18n.ts.r18ConsentDescription1 }}</div>
								<MkInfo>{{ i18n.ts.r18ConsentDescription2 }}</MkInfo>
								<div :class="$style.r18Question">{{ i18n.ts.r18ConsentAreYouOver18 }}</div>
								<div :class="$style.r18Toggle">
									<input v-model="r18Age" type="radio" :value="false" :class="$style.r18Radio"/>
									<input v-model="r18Age" type="radio" :value="true" :class="$style.r18Radio"/>
									<label :class="$style.r18LabelUnder" @click="r18Age = false">{{ i18n.ts.r18ConsentUnder17OrNotToSay }}</label>
									<div :class="$style.r18Slider">
										<label :class="$style.r18Hit" @click="r18Age = false"/>
										<span :class="$style.r18Hit"/>
										<label :class="$style.r18Hit" @click="r18Age = true"/>
										<div :class="$style.r18Knob"></div>
									</div>
									<label :class="$style.r18LabelOver" @click="r18Age = true">{{ i18n.ts.r18ConsentOver18 }}</label>
								</div>
								<template v-if="r18Age === true">
									<MkSwitch v-model="r18HideValue">
										{{ i18n.ts.hideR18Content }}
									</MkSwitch>
									<div>{{ i18n.ts.hideR18ContentDescription1 }}</div>
									<MkInfo>{{ i18n.ts.hideR18ContentDescription2 }}</MkInfo>
									<MkInfo>{{ i18n.ts.hideR18ContentDescription3 }}</MkInfo>
								</template>
								<template v-else>
									<MkInfo>{{ i18n.ts.r18ConsentUnder17Description }}</MkInfo>
								</template>
							</div>
						</div>
						<div :class="$style.pageFooter">
							<div class="_buttonsCenter">
								<MkButton rounded data-cy-user-setup-back @click="page--"><i class="ti ti-arrow-left"></i> {{ i18n.ts.goBack }}</MkButton>
								<MkButton primary rounded gradate :disabled="r18Age == null" data-cy-user-setup-continue @click="saveR18AndContinue()">{{ i18n.ts.continue }} <i class="ti ti-arrow-right"></i></MkButton>
							</div>
						</div>
					</div>
				</div>
			</template>
			<template v-else-if="page === 4">
				<div style="height: 100cqh; overflow: auto;">
					<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
						<XFollow/>
					</div>
					<div :class="$style.pageFooter">
						<div class="_buttonsCenter">
							<MkButton rounded data-cy-user-setup-back @click="page--"><i class="ti ti-arrow-left"></i> {{ i18n.ts.goBack }}</MkButton>
							<MkButton primary rounded gradate style="" data-cy-user-setup-continue @click="page++">{{ i18n.ts.continue }} <i class="ti ti-arrow-right"></i></MkButton>
						</div>
					</div>
				</div>
			</template>
			<template v-else-if="page === 5">
				<div :class="$style.centerPage">
					<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
						<div class="_gaps" style="text-align: center;">
							<i class="ti ti-bell-ringing-2" style="display: block; margin: auto; font-size: 3em; color: var(--MI_THEME-accent);"></i>
							<div style="font-size: 120%;">{{ i18n.ts.pushNotification }}</div>
							<div style="padding: 0 16px;">{{ i18n.tsx._initialAccountSetting.pushNotificationDescription({ name: instance.name ?? host }) }}</div>
							<MkPushNotificationAllowButton primary showOnlyToRegister style="margin: 0 auto;"/>
							<div class="_buttonsCenter" style="margin-top: 16px;">
								<MkButton rounded data-cy-user-setup-back @click="page--"><i class="ti ti-arrow-left"></i> {{ i18n.ts.goBack }}</MkButton>
								<MkButton primary rounded gradate data-cy-user-setup-continue @click="page++">{{ i18n.ts.continue }} <i class="ti ti-arrow-right"></i></MkButton>
							</div>
						</div>
					</div>
				</div>
			</template>
			<template v-else-if="page === 6">
				<div :class="$style.centerPage">
					<MkAnimBg style="position: absolute; top: 0;" :scale="1.5"/>
					<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
						<div class="_gaps" style="text-align: center;">
							<i class="ti ti-check" style="display: block; margin: auto; font-size: 3em; color: var(--MI_THEME-accent);"></i>
							<div style="font-size: 120%;">{{ i18n.ts._initialAccountSetting.initialAccountSettingCompleted }}</div>
							<div>{{ i18n.tsx._initialAccountSetting.youCanContinueTutorial({ name: instance.name ?? host }) }}</div>
							<div class="_buttonsCenter" style="margin-top: 16px;">
								<MkButton rounded primary gradate data-cy-user-setup-continue @click="launchTutorial()">{{ i18n.ts._initialAccountSetting.startTutorial }} <i class="ti ti-arrow-right"></i></MkButton>
							</div>
							<div class="_buttonsCenter">
								<MkButton rounded data-cy-user-setup-back @click="page--"><i class="ti ti-arrow-left"></i> {{ i18n.ts.goBack }}</MkButton>
								<MkButton rounded primary data-cy-user-setup-continue @click="setupComplete()">{{ i18n.ts.close }}</MkButton>
							</div>
						</div>
					</div>
				</div>
			</template>
		</Transition>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, watch, nextTick, defineAsyncComponent, computed } from 'vue';
import { host } from '@@/js/config.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkAnimBg from '@/components/MkAnimBg.vue';
import MkPushNotificationAllowButton from '@/components/MkPushNotificationAllowButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import XProfile from '@/components/MkUserSetupDialog.Profile.vue';
import XFollow from '@/components/MkUserSetupDialog.Follow.vue';
import XPrivacy from '@/components/MkUserSetupDialog.Privacy.vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { prefer } from '@/preferences.js';
import { store } from '@/store.js';
import * as os from '@/os.js';

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');

const page = ref(store.s.accountSetupWizard);

const r18Age = ref<boolean | null>(null);
const r18HideValue = ref(false);

function saveR18AndContinue() {
	if (r18Age.value === false) {
		prefer.commit('hideR18Content', true);
	} else if (r18Age.value === true) {
		prefer.commit('hideR18Content', r18HideValue.value);
	}
	page.value++;
}

watch(page, () => {
	store.set('accountSetupWizard', page.value);
});

async function close(skip: boolean) {
	if (skip) {
		const { canceled } = await os.confirm({
			type: 'warning',
			text: i18n.ts._initialAccountSetting.skipAreYouSure,
		});
		if (canceled) return;
	}

	dialog.value?.close();
	store.set('accountSetupWizard', -1);
}

function setupComplete() {
	store.set('accountSetupWizard', -1);
	dialog.value?.close();
}

function launchTutorial() {
	setupComplete();
	nextTick(async () => {
		const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkTutorialDialog.vue').then(x => x.default), {
			initialPage: 1,
		}, {
			closed: () => dispose(),
		});
	});
}

async function later(later: boolean) {
	if (later) {
		const { canceled } = await os.confirm({
			type: 'warning',
			text: i18n.ts._initialAccountSetting.laterAreYouSure,
		});
		if (canceled) return;
	}

	dialog.value?.close();
	store.set('accountSetupWizard', 0);
}
</script>

<style lang="scss" module>
.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity 0.3s cubic-bezier(0,0,.35,1), transform 0.3s cubic-bezier(0,0,.35,1);
}
.transition_x_enterFrom {
	opacity: 0;
	transform: translateX(50px);
}
.transition_x_leaveTo {
	opacity: 0;
	transform: translateX(-50px);
}

.progressBar {
	position: absolute;
	top: 0;
	left: 0;
	z-index: 10;
	width: 100%;
	height: 4px;
}

.progressBarValue {
	height: 100%;
	background: linear-gradient(90deg, var(--MI_THEME-buttonGradateA), var(--MI_THEME-buttonGradateB));
	transition: all 0.5s cubic-bezier(0,.5,.5,1);
}

.centerPage {
	display: flex;
	justify-content: center;
	align-items: center;
	height: 100cqh;
	padding-bottom: 30px;
	box-sizing: border-box;
}

.pageRoot {
	display: flex;
	flex-direction: column;
	min-height: 100%;
}

.pageMain {
	flex-grow: 1;
}

.pageFooter {
	position: sticky;
	bottom: 0;
	left: 0;
	flex-shrink: 0;
	padding: 12px;
	border-top: solid 0.5px var(--MI_THEME-divider);
	-webkit-backdrop-filter: blur(15px);
	backdrop-filter: blur(15px);
}

.r18Question {
	font-weight: bold;
	text-align: center;
	padding: 12px 0;
}

.r18Toggle {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 12px;
	position: relative;
	padding: 12px 0;
}

.r18Radio {
	position: absolute;
	left: -99em;
}

.r18Slider {
	position: relative;
	width: 200px;
	height: 40px;
	background: rgba(127, 127, 127, 0.12);
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 999px;
	overflow: hidden;
	transition: background-color 0.3s;
	box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.r18Toggle:has(.r18Radio[value="true"]:checked) .r18Slider {
	background: #ffd0dc;
}

.r18Toggle:has(.r18Radio[value="false"]:checked) .r18Slider {
	background: #d6ffe0;
}

.r18Knob {
	position: absolute;
	z-index: 3;
	top: 3px;
	width: 34px;
	height: 34px;
	background: #fff;
	border-radius: 50%;
	box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
	transition: left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	left: calc(50% - 17px);
}

.r18Toggle:has(.r18Radio[value="false"]:checked) .r18Knob {
	left: 3px;
}

.r18Toggle:has(.r18Radio[value="true"]:checked) .r18Knob {
	left: calc(100% - 37px);
}

.r18Hit {
	position: absolute;
	top: 0;
	width: calc(100% / 3);
	height: 100%;
	cursor: pointer;
	z-index: 4;

	&:nth-child(1) { left: 0; }
	&:nth-child(2) { left: calc(100% / 3); }
	&:nth-child(3) { left: calc(200% / 3); }
}

.r18LabelUnder,
.r18LabelOver {
	font-size: 0.9em;
	font-weight: bold;
	opacity: 0.5;
	cursor: pointer;
	transition: opacity 0.2s, color 0.2s;
}

.r18Toggle:has(.r18Radio[value="false"]:checked) .r18LabelUnder {
	opacity: 1;
	color: var(--MI_THEME-accent);
}

.r18Toggle:has(.r18Radio[value="true"]:checked) .r18LabelOver {
	opacity: 1;
	color: var(--MI_THEME-accent);
}
</style>

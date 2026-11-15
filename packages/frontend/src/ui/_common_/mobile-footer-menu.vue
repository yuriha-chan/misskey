<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.root">
	<button :class="$style.item" class="_button" @click="drawerMenuShowing = true">
		<div :class="$style.itemInner">
			<i :class="$style.itemIcon" class="ti ti-menu-2"></i><span v-if="menuIndicated" :class="$style.itemIndicator" class="_blink"><i class="_indicatorCircle"></i></span>
		</div>
	</button>

	<button :class="$style.item" class="_button" @click="mainRouter.push('/')">
		<div :class="$style.itemInner">
			<i :class="$style.itemIcon" class="ti ti-home"></i>
		</div>
	</button>

	<button :class="$style.item" class="_button" @click="mainRouter.push('/my/notifications')">
		<div :class="[$style.itemInner, $i?.hasUnreadNotification ? $style.hasNotification : null]">
			<i :class="$style.itemIcon" class="ti ti-bell"></i>
		</div>
		<span v-if="$i?.hasUnreadNotification" :class="$style.itemIndicator" class="_blink">
			<span class="_indicateCounter" :class="$style.itemIndicateValueIcon">{{ $i.unreadNotificationsCount > 99 ? '99+' : $i.unreadNotificationsCount }}</span>
		</span>
	</button>

	<button :class="$style.item" class="_button" @click="widgetsShowing = true">
		<div :class="$style.itemInner">
			<i :class="$style.itemIcon" class="ti ti-apps"></i>
		</div>
	</button>

	<button :class="[$style.item, $style.post]" class="_button" @click="os.post()">
		<div :class="$style.itemInner">
			<i :class="$style.itemIcon" class="ti ti-pencil"></i>
		</div>
	</button>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef, watch } from 'vue';
import { $i } from '@/i.js';
import * as os from '@/os.js';
import { mainRouter } from '@/router.js';
import { navbarItemDef } from '@/navbar.js';

const drawerMenuShowing = defineModel<boolean>('drawerMenuShowing');
const widgetsShowing = defineModel<boolean>('widgetsShowing');

const rootEl = useTemplateRef('rootEl');

const menuIndicated = computed(() => {
	for (const def in navbarItemDef) {
		if (def === 'notifications') continue; // 通知は下にボタンとして表示されてるから
		if (navbarItemDef[def].indicated) return true;
	}
	return false;
});

const rootElHeight = ref(0);

watch(rootEl, () => {
	if (rootEl.value) {
		rootElHeight.value = rootEl.value.offsetHeight;
		window.document.body.style.setProperty('--MI-minBottomSpacing', 'var(--MI-minBottomSpacingMobile)');
	} else {
		rootElHeight.value = 0;
		window.document.body.style.setProperty('--MI-minBottomSpacing', '0px');
	}
}, {
	immediate: true,
});
</script>

<style lang="scss" module>
.root {
	position: fixed;
	z-index: 1000;
	bottom: 0;
	left: 0;
	padding: 4px 4px max(4px, env(safe-area-inset-bottom, 0px)) 4px;
	display: grid;
	grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
	grid-gap: 8px;
	width: 100%;
	box-sizing: border-box;
	background-color: var(--MI_THEME-header);
	mask-image: linear-gradient(to top, rgba(0,0,0,1) 90%, rgba(0,0,0,0) 100%);
}

.item {
	position: relative;
	padding: 4px 0;

	&:first-child {
		padding-left: 12px;
	}

	&:last-child {
		padding-right: 12px;
	}

	&.post {
		.itemInner {
			background: linear-gradient(90deg, var(--MI_THEME-buttonGradateA), var(--MI_THEME-buttonGradateB));
			color: var(--MI_THEME-fgOnAccent);
			mask-image: none;
			backdrop-filter: none;

			&:hover {
				background: linear-gradient(90deg, hsl(from var(--MI_THEME-accent) h s calc(l + 5)), hsl(from var(--MI_THEME-accent) h s calc(l + 5)));
			}

			&:active {
				background: linear-gradient(90deg, hsl(from var(--MI_THEME-accent) h s calc(l + 5)), hsl(from var(--MI_THEME-accent) h s calc(l + 5)));
			}
		}
	}
}

.itemInner {
	padding: 0;
	aspect-ratio: 1;
	width: 100%;
	max-width: 60px;
	margin: auto;
	align-content: center;
	border-radius: 100%;
	mask-image: radial-gradient(circle at center, rgba(0,0,0,1) 0%, rgba(0, 0, 0, 1) 33%, rgba(0,0,0,0.2) 66%, rgba(0,0,0,0) 100%);
	background: radial-gradient(
		circle at center,
		rgba(from var(--MI-THEME-bg) r g b / 0.4) 0%, rgba(from var(--MI-THEME-bg) r g b / 0.3) 33%, rgba(from var(--MI-THEME-bg) r g b / 0.05) 66%,  rgba(from var(--MI-THEME-bg) r g b / 0) 100%);
	backdrop-filter: blur(8px);

	&:hover {
		background: var(--MI_THEME-panelHighlight);
	}

	&:active {
		background: var(--MI_THEME-panelHighlight);
	}

}

.itemInner.hasNotification {
	background: radial-gradient(
		circle at center,
		rgba(from var(--MI-THEME-indicator) r g b / 0.4) 0%, rgba(from var(--MI-THEME-indicator) r g b / 0.3) 33%, rgba(from var(--MI-THEME-indicator) r g b / 0.02) 66%,  rgba(from var(--MI-THEME-indicator) r g b / 0) 100%);
}

.itemIcon {
	font-size: 20px;
}

.itemIndicator {
	position: absolute;
	top: 5px;
	right: 6px;
	z-index: 2;
	color: var(--MI_THEME-indicator);
	font-size: 10px;
	pointer-events: none;

	&:has(.itemIndicateValueIcon) {
		animation: none;
		font-size: 10px;
	}
}
</style>

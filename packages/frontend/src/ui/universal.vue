<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { '_forceShrinkSpacer': deviceKind === 'smartphone' }]">
	<XTitlebar v-if="prefer.r.showTitlebar.value" style="flex-shrink: 0;"/>

	<div :class="$style.nonTitlebarArea">
		<XSidebar v-if="!isMobile" :showContent="routerViewLoaded" :class="$style.sidebar" :showWidgetButton="!isDesktop" @widgetButtonClick="widgetsShowing = true"/>

		<div :class="[$style.contents, !isMobile && prefer.r.showTitlebar.value ? $style.withSidebarAndTitlebar : null]" @contextmenu.stop="onContextmenu">
			<div>
				<XReloadSuggestion v-if="shouldSuggestReload"/>
				<XPreferenceRestore v-if="shouldSuggestRestoreBackup"/>
				<XAnnouncements v-if="$i"/>
				<XStatusBars :class="$style.statusbars"/>
			</div>
			<StackingRouterView v-if="prefer.s['experimental.stackingRouterView']" :class="$style.content"/>
			<RouterView v-else :class="$style.content" @mainContentLoaded="onRouterViewLoaded"/>
			<Transition
				:enterActiveClass="$style.transition_navFooter_enterActive"
				:leaveActiveClass="$style.transition_navFooter_leaveActive"
				:enterFromClass="$style.transition_navFooter_enterFrom"
				:leaveToClass="$style.transition_navFooter_leaveTo"
			>
				<XMobileFooterMenu v-if="isMobile && navFooterShowing && navFooterShowingByPage " v-model:drawerMenuShowing="drawerMenuShowing" v-model:widgetsShowing="widgetsShowing" ref="navFooter"/>
			</Transition>
		</div>

		<div v-if="isDesktop && !pageMetadata?.needWideArea" :class="$style.widgets">
			<XWidgets v-if="routerViewLoaded"/>
		</div>
	</div>

	<XCommon v-model:drawerMenuShowing="drawerMenuShowing" v-model:widgetsShowing="widgetsShowing"/>
</div>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, provide, onMounted, computed, ref, shallowRef, watch } from 'vue';
import { instanceName } from '@@/js/config.js';
import { isLink } from '@@/js/is-link.js';
import XCommon from './_common_/common.vue';
import type { PageMetadata } from '@/page.js';
import XMobileFooterMenu from '@/ui/_common_/mobile-footer-menu.vue';
import XPreferenceRestore from '@/ui/_common_/PreferenceRestore.vue';
import XReloadSuggestion from '@/ui/_common_/ReloadSuggestion.vue';
import XTitlebar from '@/ui/_common_/titlebar.vue';
import XSidebar from '@/ui/_common_/navbar.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { provideMetadataReceiver, provideReactiveMetadata } from '@/page.js';
import { deviceKind } from '@/utility/device-kind.js';
import { miLocalStorage } from '@/local-storage.js';
import { mainRouter } from '@/router.js';
import { prefer } from '@/preferences.js';
import { shouldSuggestRestoreBackup } from '@/preferences/utility.js';
import { DI } from '@/di.js';
import { shouldSuggestReload } from '@/utility/reload-suggest.js';

const XWidgets = defineAsyncComponent(() => import('./_common_/widgets.vue'));
const XStatusBars = defineAsyncComponent(() => import('@/ui/_common_/statusbars.vue'));
const XAnnouncements = defineAsyncComponent(() => import('@/ui/_common_/announcements.vue'));

const isRoot = computed(() => mainRouter.currentRoute.value.name === 'index');

const DESKTOP_THRESHOLD = 1100;
const MOBILE_THRESHOLD = 500;

// デスクトップでウィンドウを狭くしたときモバイルUIが表示されて欲しいことはあるので deviceKind === 'desktop' の判定は行わない
const isDesktop = ref(window.innerWidth >= DESKTOP_THRESHOLD);
const isMobile = ref(deviceKind === 'smartphone' || window.innerWidth <= MOBILE_THRESHOLD);
window.addEventListener('resize', () => {
	isMobile.value = deviceKind === 'smartphone' || window.innerWidth <= MOBILE_THRESHOLD;
});

const pageMetadata = ref<null | PageMetadata>(null);
const widgetsShowing = ref(false);
const navFooterShowing = ref(true);
const navFooterShowingByPage = ref(true);

provide(DI.router, mainRouter);
provideMetadataReceiver((metadataGetter) => {
	const info = metadataGetter();
	pageMetadata.value = info;
	if (pageMetadata.value) {
		if (isRoot.value && pageMetadata.value.title === instanceName) {
			window.document.title = pageMetadata.value.title;
		} else {
			window.document.title = `${pageMetadata.value.title} | ${instanceName}`;
		}
	}
});
provideReactiveMetadata(pageMetadata);

const drawerMenuShowing = ref(false);
const routerViewLoaded = ref(false);

mainRouter.on('change', () => {
	drawerMenuShowing.value = false;
});

const onRouterViewLoaded = () => {
	routerViewLoaded.value = true;
};

if (window.innerWidth > 1024) {
	const tempUI = miLocalStorage.getItem('ui_temp');
	if (tempUI) {
		miLocalStorage.setItem('ui', tempUI);
		miLocalStorage.removeItem('ui_temp');
		window.location.reload();
	}
}

let scrollHistory: {time: Date, position: number} [] = [];

if (prefer.s.hideNavFooter) {
	provide('onContentScroll', (e) => {
    const elem = e.target;
		const now = new Date();
		scrollHistory = scrollHistory.filter(x => (now - x.time < 2000) && (now > x.time));
		let scrollPosition = elem.scrollTop;
		scrollHistory.push({ time: now, position: scrollPosition });
		if (scrollHistory.length === 1) {
			return;
		}
		let diffPosition = scrollPosition - scrollHistory[0].position;
		let diffTime = now - scrollHistory[0].time;
		let scrollSpeed = diffPosition / diffTime;
		if (scrollPosition === 0) {
			navFooterShowing.value = true;
			scrollHistory = [];
		} else if (scrollSpeed > 0.2 && diffPosition > 300 || scrollSpeed < -0.5 && diffPosition < -600) {
			navFooterShowing.value = false;
		} else if (-0.2 < scrollSpeed && scrollSpeed < 0.02) {
			navFooterShowing.value = true;
		}
	}, { passive: true });
}

onMounted(() => {
	if (!isDesktop.value) {
		window.addEventListener('resize', () => {
			if (window.innerWidth >= DESKTOP_THRESHOLD) isDesktop.value = true;
		}, { passive: true });
	}
	mainRouter.addListener('change', ctx => {
		console.log(ctx.fullPath);
		if (ctx.fullPath.startsWith("/chat/room/") || ctx.fullPath.startsWith("/chat/user/")) {
			navFooterShowingByPage.value = false;
		} else {
			navFooterShowingByPage.value = true;
		}
	});
});


const navFooterHeight = ref(0);
const navFooter = shallowRef<HTMLElement>();

watch(navFooter, () => {
	if (navFooter.value) {
		navFooterHeight.value = navFooter.value?.offsetHeight ?? 0;
		document.body.style.setProperty('--MI-stickyBottom', `${navFooterHeight.value}px`);
		document.body.style.setProperty('--MI-minBottomSpacing', 'var(--MI-minBottomSpacingMobile)');
	} else {
		navFooterHeight.value = 0;
		document.body.style.setProperty('--MI-stickyBottom', '0px');
		document.body.style.setProperty('--MI-minBottomSpacing', '0px');
	}
}, {
	immediate: true,
});

const onContextmenu = (ev) => {
	if (isLink(ev.target)) return;
	if (['INPUT', 'TEXTAREA', 'IMG', 'VIDEO', 'CANVAS'].includes(ev.target.tagName) || ev.target.attributes['contenteditable']) return;
	if (window.getSelection()?.toString() !== '') return;
	const path = mainRouter.getCurrentFullPath();
	os.contextMenu([{
		type: 'label',
		text: path,
	}, {
		icon: 'ti ti-window-maximize',
		text: i18n.ts.openInWindow,
		action: () => {
			os.pageWindow(path);
		},
	}], ev);
};
</script>

<style lang="scss" module>
$widgets-hide-threshold: 1090px;

.transition_navFooter_enterActive {
	opacity: 1;
	transition: opacity 300ms cubic-bezier(0.23, 1, 0.32, 1);
}
.transition_navFooter_leaveActive {
	opacity: 1;
	transition: opacity 800ms cubic-bezier(0.23, 1, 0.32, 1);
}

.transition_navFooter_enterFrom,
.transition_navFooter_leaveTo {
	opacity: 0;
}

.transition_menuDrawerBg_enterActive,
.transition_menuDrawerBg_leaveActive {
	opacity: 1;
	transition: opacity 300ms cubic-bezier(0.23, 1, 0.32, 1);
}
.transition_menuDrawerBg_enterFrom,
.transition_menuDrawerBg_leaveTo {
	opacity: 0;
}

.transition_menuDrawer_enterActive,
.transition_menuDrawer_leaveActive {
	opacity: 1;
	transform: translateX(0);
	transition: transform 300ms cubic-bezier(0.23, 1, 0.32, 1), opacity 300ms cubic-bezier(0.23, 1, 0.32, 1);
}
.transition_menuDrawer_enterFrom,
.transition_menuDrawer_leaveTo {
	opacity: 0;
	transform: translateX(-240px);
}

.transition_widgetsDrawerBg_enterActive,
.transition_widgetsDrawerBg_leaveActive {
	opacity: 1;
	transition: opacity 300ms cubic-bezier(0.23, 1, 0.32, 1);
}
.transition_widgetsDrawerBg_enterFrom,
.transition_widgetsDrawerBg_leaveTo {
	opacity: 0;
}

.transition_widgetsDrawer_enterActive,
.transition_widgetsDrawer_leaveActive {
	opacity: 1;
	transform: translateX(0);
	transition: transform 300ms cubic-bezier(0.23, 1, 0.32, 1), opacity 300ms cubic-bezier(0.23, 1, 0.32, 1);
}
.transition_widgetsDrawer_enterFrom,
.transition_widgetsDrawer_leaveTo {
	opacity: 0;
	transform: translateX(240px);
}

.root {
	height: 100dvh;
	overflow: clip;
	contain: strict;
	display: flex;
	flex-direction: column;
	background: var(--MI_THEME-navBg);
}

.nonTitlebarArea {
	display: flex;
	flex: 1;
	min-height: 0;
}

.sidebar {
	border-right: solid 0.5px var(--MI_THEME-divider);
}

.sidebarPlaceholder {
	width: 250px;
}

.sidebarPlaceholder.iconOnly {
	width: 80px;
}

.contents {
	display: flex;
	flex-direction: column;
	flex: 1;
	height: 100%;
	min-width: 0;

	&.withSidebarAndTitlebar {
		background: var(--MI_THEME-navBg);
		border-radius: 12px 0 0 0;
		overflow: clip;
	}
}

.content {
	flex: 1;
	min-height: 0;
}

.statusbars {
	position: sticky;
	top: 0;
	left: 0;
}

.widgets {
	width: 350px;
	height: 100%;
	box-sizing: border-box;
	overflow: auto;
	padding: var(--MI-margin) var(--MI-margin) calc(var(--MI-margin) + env(safe-area-inset-bottom, 0px));
	border-left: solid 0.5px var(--MI_THEME-divider);
	background: var(--MI_THEME-bg);

	@media (max-width: $widgets-hide-threshold) {
		display: none;
	}
}

</style>

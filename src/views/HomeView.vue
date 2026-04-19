<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Clock3,
  Heart,
  Headphones,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  RefreshCcw,
  Repeat2,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
} from '@lucide/vue'

import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

import { archivePlaylistConfig } from '@/services/audioApi'
import { readHomeViewState, writeHomeViewState } from '@/lib/playerSnapshot'
import { usePlayerStore } from '@/stores/player'
import {
  createDeadlineFromTime,
  formatCountdown,
  formatLocalClock,
  formatSelectedTime,
} from '@/lib/time'
import { useSeekSlider } from '@/lib/slider'
import { filterTracksByQuery, sortTracks, type TrackSortOption } from '@/lib/trackList'
import { formatDuration } from '@/utils/format'

const PLAYLIST_SOURCE_URL = archivePlaylistConfig.sourceUrl
const DOWNLOAD_BASE_URL = archivePlaylistConfig.downloadBaseUrl
const homeViewState = readHomeViewState()

const player = usePlayerStore()

const query = ref(homeViewState?.query || '')
const currentClock = ref('')
const scroller = ref<any>(null)
const sortMenuRef = ref<HTMLElement | null>(null)
const timerInput = ref<HTMLInputElement | null>(null)
const timerValue = ref(homeViewState?.timerValue || '06:00')
const timerDeadline = ref<number | null>(homeViewState?.timerDeadline ?? null)
const timerCountdown = ref('')
const sortMenuOpen = ref(homeViewState?.sortMenuOpen || false)
const selectedSort = ref<TrackSortOption>(
  (homeViewState?.selectedSort as TrackSortOption | undefined) || 'newest',
)
const isTogglingPlayback = ref(false)
let clockInterval: number | null = null
let timerInterval: number | null = null
let timerTimeout: number | null = null

const sortGroups: Array<{
  key: string
  label: string
  shortLabel: string
  icon: any
  desc: TrackSortOption
  asc: TrackSortOption
}> = [
  { key: 'date',    label: 'Ngày đăng', shortLabel: 'Ngày đăng', icon: Clock3,         desc: 'newest',      asc: 'oldest'     },
  { key: 'play',    label: 'Lượt phát', shortLabel: 'Phát',      icon: Play,           desc: 'play_desc',   asc: 'play_asc'   },
  { key: 'view',    label: 'Lượt nghe', shortLabel: 'Nghe',      icon: Headphones,     desc: 'view_desc',   asc: 'view_asc'   },
  { key: 'like',    label: 'Lượt thích',shortLabel: 'Thích',     icon: Heart,          desc: 'like_desc',   asc: 'like_asc'   },
  { key: 'repost',  label: 'Đăng lại',  shortLabel: 'Đăng lại',  icon: Repeat2,        desc: 'repost_desc', asc: 'repost_asc' },
  { key: 'comment', label: 'Bình luận', shortLabel: 'Bình luận', icon: MessageCircle,  desc: 'comment_desc',asc: 'comment_asc'},
  { key: 'save',    label: 'Lưu',       shortLabel: 'Lưu',       icon: Bookmark,       desc: 'save_desc',   asc: 'save_asc'   },
]

const filteredAudios = computed(() => {
  const tracks = filterTracksByQuery(player.audios, query.value)
  return sortTracks(tracks, player.playCounts, selectedSort.value)
})

const currentTrack = computed(() => player.currentAudio)
const trackPositionLabel = computed(() => {
  if (!currentTrack.value) return `0/${filteredAudios.value.length || player.audios.length}`
  const i = filteredAudios.value.findIndex((t) => t.id === currentTrack.value?.id)
  if (i < 0) return `0/${filteredAudios.value.length || player.audios.length}`
  return `${i + 1}/${filteredAudios.value.length}`
})

const displayDuration = computed(() => player.duration || currentTrack.value?.durationHint || 0)
const buffering = computed(() => player.playerState === 'buffering')
const selectedSortGroup = computed(() =>
  sortGroups.find((g) => g.desc === selectedSort.value || g.asc === selectedSort.value),
)
const selectedSortLabel      = computed(() => selectedSortGroup.value?.label     || 'Sắp xếp')
const selectedSortShortLabel = computed(() => selectedSortGroup.value?.shortLabel || 'Sắp xếp')
const selectedSortIsAscending = computed(() => {
  const g = selectedSortGroup.value
  return g ? selectedSort.value === g.asc : false
})

const {
  trackRef: seekSliderTrackRef,
  isDragging: isSeekDragging,
  previewValue: seekSliderPreviewValue,
  progress: seekSliderProgress,
  onPointerDown: onSeekSliderPointerDown,
} = useSeekSlider({
  max: () => displayDuration.value || 0,
  value: () => player.currentTime,
  onSeek: (value) => player.seekTo(value),
})

const displayedCurrentTime = computed(() =>
  isSeekDragging.value ? seekSliderPreviewValue.value : player.currentTime,
)

function getPlaybackList() { return filteredAudios.value }
function syncPlaybackQueue() { player.setPlaybackQueue(filteredAudios.value.map((t) => t.id)) }
function updateClock() { currentClock.value = formatLocalClock() }
function updateTimerCountdown() {
  if (!timerDeadline.value) { timerCountdown.value = ''; return }
  timerCountdown.value = formatCountdown(Math.max(0, timerDeadline.value - Date.now()))
}
function writeViewState() {
  writeHomeViewState({
    query: query.value, selectedSort: selectedSort.value, sortMenuOpen: sortMenuOpen.value,
    timerValue: timerValue.value, timerDeadline: timerDeadline.value,
  })
}
function clearSleepTimer() {
  if (timerInterval !== null) { window.clearInterval(timerInterval); timerInterval = null }
  if (timerTimeout  !== null) { window.clearTimeout(timerTimeout);   timerTimeout  = null }
  timerDeadline.value = null
  timerCountdown.value = ''
  writeViewState()
}
function openTimerPicker() {
  if (!timerInput.value) return
  if ('showPicker' in HTMLInputElement.prototype) { timerInput.value.showPicker(); return }
  timerInput.value.focus(); timerInput.value.click()
}
function closeSortMenu()  { sortMenuOpen.value = false; writeViewState() }
function toggleSortMenu() { sortMenuOpen.value = !sortMenuOpen.value; writeViewState() }

function playFirstFromCurrentList() {
  syncPlaybackQueue()
  const first = getPlaybackList()[0]
  if (!first) return
  const idx = player.audios.findIndex((t) => t.id === first.id)
  if (idx >= 0) void player.playAt(idx)
}
function handlePrimaryAction() {
  if (!timerValue.value) return
  clearSleepTimer()
  const now = new Date()
  const target = createDeadlineFromTime(timerValue.value, now)
  if (!target) return
  timerDeadline.value = target.getTime()
  updateTimerCountdown()
  timerInterval = window.setInterval(updateTimerCountdown, 1000)
  timerTimeout  = window.setTimeout(() => { player.pausePlayback(); clearSleepTimer() }, timerDeadline.value - now.getTime())
  writeViewState()
}
function selectTrack(trackId: string) {
  const idx = player.audios.findIndex((t) => t.id === trackId)
  if (idx < 0) return
  if (idx === player.currentIndex) { player.togglePlayback(); return }
  void player.playAt(idx)
}
function handleReload() {
  void player.loadAudios(PLAYLIST_SOURCE_URL, { force: true, downloadBaseUrl: DOWNLOAD_BASE_URL }).then(() => {
    nextTick().then(() => playFirstFromCurrentList())
  })
}
function handlePrev() {
  if (!filteredAudios.value.length) return
  if (player.currentTime > 3) { player.seekTo(0); return }
  void player.playPreviousInQueue().then(() => scrollActiveTrackIntoView())
}
function handleNext() {
  if (!filteredAudios.value.length) return
  void player.playNextInQueue().then(() => scrollActiveTrackIntoView())
}
function handleShuffle() {
  void player.randomTrack(getPlaybackList().map((t) => t.id)).then((trackId) => {
    selectTrack(trackId);
    scrollActiveTrackIntoView()
  })
}
function handleTogglePlayback() {
  if (isTogglingPlayback.value) return
  isTogglingPlayback.value = true
  player.togglePlayback()
  void scrollActiveTrackIntoView()
  setTimeout(() => { isTogglingPlayback.value = false }, 150)
}
function applySort(next: TrackSortOption) {
  selectedSort.value = next; writeViewState(); playFirstFromCurrentList()
}
function toggleSortGroup(desc: TrackSortOption, asc: TrackSortOption) {
  applySort(selectedSort.value === desc ? asc : desc)
}
function handleWindowPointerDown(e: PointerEvent) {
  if (!sortMenuOpen.value || !sortMenuRef.value) return
  const t = e.target
  if (t instanceof Node && !sortMenuRef.value.contains(t)) closeSortMenu()
}
function scrollActiveTrackIntoView() {
  nextTick().then(() => {
    if (!scroller.value || !currentTrack.value) return
    const i = filteredAudios.value.findIndex((t) => t.id === currentTrack.value!.id)
    if (i < 0) return
    scroller.value.scrollToItem(i - 1)
  })
}

watch(() => query.value, (next, prev) => {
  if (next === prev) return
  writeViewState()
  if (filteredAudios.value.length > 0) playFirstFromCurrentList()
  else syncPlaybackQueue()
})
watch(() => timerValue.value, () => writeViewState())
watch(() => filteredAudios.value.map((t) => t.id).join('|'), () => syncPlaybackQueue(), { immediate: true })
watch(() => player.currentIndex, () => scrollActiveTrackIntoView())
watch(() => filteredAudios.value.map((t) => t.id).join('|'), () => scrollActiveTrackIntoView())

onMounted(() => {
  updateClock()
  clockInterval = window.setInterval(updateClock, 30000)
  window.addEventListener('pointerdown', handleWindowPointerDown)
  if (timerDeadline.value) {
    const remaining = timerDeadline.value - Date.now()
    if (remaining > 0) {
      updateTimerCountdown()
      timerInterval = window.setInterval(updateTimerCountdown, 1000)
      timerTimeout  = window.setTimeout(() => { player.pausePlayback(); clearSleepTimer() }, remaining)
    } else { clearSleepTimer() }
  }
  writeViewState()
  if (player.identifier === PLAYLIST_SOURCE_URL && player.audios.length > 0) {
    scrollActiveTrackIntoView()
    return
  }
  void player.loadAudios(PLAYLIST_SOURCE_URL, { downloadBaseUrl: DOWNLOAD_BASE_URL }).then(() => {
    scrollActiveTrackIntoView()
  })
})
onUnmounted(() => {
  if (clockInterval) window.clearInterval(clockInterval)
  window.removeEventListener('pointerdown', handleWindowPointerDown)
  clearSleepTimer()
  player.dispose()
})
</script>

<template>
  <!-- ────────────────────────────────────────────────────────── ROOT -->
  <div class="root relative h-svh w-svw overflow-hidden text-(--c-text)">
    <main class="relative z-10 flex h-full flex-col px-3.5">

      <!-- ──────────────────────── HEADER -->
      <header class="shrink-0">

        <!-- Sleep Timer -->
        <section class="border-b border-(--c-divider) py-3.5">
          <p class="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-(--c-label-muted)">
            <Clock3 class="h-2.5 w-2.5" /> Hẹn giờ ngủ
          </p>
          <div class="flex items-center gap-2.5">

            <!-- Time display button -->
            <button
              type="button"
              class="timer-display flex h-11 flex-1 items-center justify-between rounded-2xl border border-(--c-border) bg-(--c-surface) px-4"
              @click="openTimerPicker"
            >
              <span class="text-[22px] font-bold tabular-nums text-(--c-primary)">
                {{ timerDeadline ? timerCountdown : formatSelectedTime(timerValue, currentClock) }}
              </span>
              <span
                v-if="timerDeadline"
                class="h-2 w-2 rounded-full"
                style="background: var(--c-primary)"
              />
            </button>
            <input ref="timerInput" v-model="timerValue" type="time" class="sr-only" />

            <!-- Start / Cancel -->
            <button
              type="button"
              class="h-11 min-w-22 rounded-2xl text-[13.5px] font-semibold"
              :class="timerDeadline ? 'timer-btn-cancel' : 'timer-btn-start'"
              @click="timerDeadline ? clearSleepTimer() : handlePrimaryAction()"
            >
              {{ timerDeadline ? 'Hủy' : 'Bắt đầu' }}
            </button>
          </div>
        </section>

        <!-- Search + Sort -->
        <section class="flex gap-2.5 py-3">
          <!-- Search input -->
          <div class="relative flex-1">
            <Search class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-(--c-label-muted)" />
            <input
              v-model="query"
              type="text"
              inputmode="search"
              placeholder="Tìm kiếm bài hát..."
              class="search-input h-11 w-full rounded-2xl border border-(--c-border) bg-(--c-surface) pl-11 pr-4 text-[15px] text-(--c-text) outline-none placeholder:text-(--c-label-muted)"
            />
          </div>

          <!-- Sort -->
          <div ref="sortMenuRef" class="relative">
            <button
              type="button"
              class="sort-trigger flex h-11 items-center gap-1.5 rounded-2xl border border-(--c-border) bg-(--c-surface) px-3.5 text-[13px] font-medium text-(--c-label-secondary)"
              :title="selectedSortLabel"
              @click.stop="toggleSortMenu"
            >
              <component :is="selectedSortGroup?.icon || Clock3" class="h-3.5 w-3.5 shrink-0" />
              <span class="whitespace-nowrap">{{ selectedSortShortLabel }}</span>
              <ArrowUp   v-if="selectedSortIsAscending" class="size-4 opacity-50" />
              <ArrowDown v-else                          class="size-4 opacity-50" />
            </button>

            <div
              v-if="sortMenuOpen"
              class="sort-menu absolute right-0 top-[calc(100%+8px)] z-30 min-w-44.5 rounded-2xl border border-(--c-border-strong) bg-(--c-bg-elevated) p-1.5"
            >
              <button
                v-for="group in sortGroups"
                :key="group.key"
                type="button"
                class="sort-item flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.25 text-[13px]"
                :class="selectedSort === group.desc || selectedSort === group.asc
                  ? 'text-(--c-text)'
                  : 'text-(--c-label-faint)'"
                @click="toggleSortGroup(group.desc, group.asc)"
              >
                <span class="flex items-center gap-2 whitespace-nowrap">
                  <component :is="group.icon" class="h-3.5 w-3.5" />
                  {{ group.shortLabel }}
                </span>
                <span class="flex items-center gap-0.5">
                  <ArrowDown class="size-4"
                    :style="selectedSort === group.desc ? 'color: var(--c-primary)' : 'color: var(--c-label-faint)'" />
                  <ArrowUp   class="size-4"
                    :style="selectedSort === group.asc  ? 'color: var(--c-primary)' : 'color: var(--c-label-faint)'" />
                </span>
              </button>
            </div>
          </div>
        </section>
      </header>

      <!-- ──────────────────────── TRACK LIST -->
      <section class="min-h-0 flex-1 overflow-hidden">

        <!-- Skeleton -->
        <div v-if="player.loading && player.audios.length === 0" class="flex flex-col gap-1.5 pt-1">
          <div
            v-for="n in 7" :key="n"
            class="h-20 rounded-2xl bg-(--c-surface) animate-pulse"
          />
        </div>

        <!-- Empty -->
        <div
          v-else-if="filteredAudios.length === 0"
          class="flex h-full flex-col items-center justify-center gap-3 text-(--c-label-muted)"
        >
          <Search class="h-8 w-8 opacity-40" />
          <p class="text-[14px]">{{ player.error || 'Không tìm thấy bài hát nào' }}</p>
        </div>

        <RecycleScroller
          v-else
          ref="scroller"
          :items="filteredAudios"
          :item-size="88"
          key-field="id"
          class="h-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <template #default="{ item: track }">
            <div class="py-1">
              <button
                :data-track-id="track.id"
                type="button"
                class="track-card relative flex h-20 w-full items-center overflow-hidden rounded-2xl border px-3.5 text-left"
                :class="track.id === currentTrack?.id ? 'track-active' : 'track-idle'"
                @click="selectTrack(track.id)"
              >
                <div class="flex w-full flex-col gap-1.5">
                  <!-- Title -->
                  <p
                    class="truncate text-[13.5px] font-semibold leading-snug"
                    :style="track.id === currentTrack?.id ? 'color: var(--c-primary-soft)' : 'color: var(--c-text-secondary)'"
                  >
                    {{ track.title }}
                  </p>

                  <!-- Stats row -->
                  <div class="flex flex-nowrap items-center gap-1.5 overflow-x-auto">
                    <template
                      v-for="stat in [
                        { icon: Play,          val: player.playCounts[track.id] ?? 0, label: 'Lượt phát' },
                        { icon: Headphones,    val: track.viewCount,                  label: 'Lượt nghe'  },
                        { icon: Heart,         val: track.likeCount,                  label: 'Lượt thích' },
                        { icon: Repeat2,       val: track.repostCount,                label: 'Đăng lại'   },
                        { icon: MessageCircle, val: track.commentCount,               label: 'Bình luận'  },
                        { icon: Bookmark,      val: track.saveCount,                  label: 'Lưu'        },
                      ]"
                      :key="stat.label"
                    >
                      <span
                        :aria-label="stat.label"
                        class="stat-badge flex shrink-0 items-center gap-0.75 rounded-[7px] px-1.5 py-0.75 text-[10px] font-semibold tabular-nums"
                        :class="track.id === currentTrack?.id ? 'stat-active' : 'stat-idle'"
                      >
                        <component :is="stat.icon" class="h-2.5 w-2.5 shrink-0" />
                        {{ stat.val.toLocaleString('vi-VN') }}
                      </span>
                    </template>
                  </div>
                </div>
              </button>
            </div>
          </template>
        </RecycleScroller>
      </section>

      <!-- ──────────────────────── BOTTOM PLAYER -->
      <section class="shrink-0">
        <div class="border-t border-(--c-divider) px-1 pb-6 pt-4">

          <!-- Track info -->
          <div class="mb-3.5 text-center">
            <p class="truncate text-[17px] font-bold tracking-tight text-(--c-text)">
              {{ currentTrack?.title || 'Chưa chọn bài hát' }}
            </p>
            <p class="mt-1 text-[11px] font-medium text-(--c-label-muted)">{{ trackPositionLabel }}</p>
          </div>

          <!-- Seek bar -->
          <div class="mb-4 flex items-center gap-2.5">
            <span class="w-8 text-right text-[11px] font-semibold tabular-nums text-(--c-label-muted)">
              {{ formatDuration(displayedCurrentTime) }}
            </span>

            <div
              ref="seekSliderTrackRef"
              class="seek-track relative h-2 flex-1 cursor-pointer touch-none select-none rounded-full"
              role="slider"
              :aria-valuemin="0"
              :aria-valuemax="displayDuration"
              :aria-valuenow="Math.round(seekSliderPreviewValue)"
              aria-label="Tua audio"
              @pointerdown="onSeekSliderPointerDown"
            >
              <div
                class="seek-fill absolute inset-y-0 left-0 rounded-full"
                :style="{ width: `${seekSliderProgress}%` }"
              />
            </div>

            <span class="w-8 text-[11px] font-semibold tabular-nums text-(--c-label-muted)">
              {{ formatDuration(displayDuration) }}
            </span>
          </div>

          <!-- Transport controls -->
          <div class="flex items-center justify-between">

            <button
              type="button"
              class="ctrl-btn flex h-11 w-11 items-center justify-center rounded-2xl disabled:opacity-25"
              :disabled="player.loading"
              @click="handleReload"
            >
              <RefreshCcw class="h-5.5 w-5.5" :class="player.loading && 'animate-spin'" />
            </button>

            <button
              type="button"
              class="ctrl-btn flex h-11 w-11 items-center justify-center rounded-2xl"
              @click="handlePrev"
            >
              <SkipBack class="h-5.5 w-5.5" />
            </button>

            <!-- Play button -->
            <button
              type="button"
              class="play-btn flex h-15.5 w-15.5 items-center justify-center rounded-[18px]"
              :disabled="isTogglingPlayback"
              @click="handleTogglePlayback"
            >
              <Loader2 v-if="buffering" class="h-6 w-6 animate-spin" />
              <Pause v-else-if="player.playing" class="h-6 w-6" />
              <Play  v-else                      class="ml-0.5 h-6 w-6" />
            </button>

            <button
              type="button"
              class="ctrl-btn flex h-11 w-11 items-center justify-center rounded-2xl"
              @click="handleNext"
            >
              <SkipForward class="h-5.5 w-5.5" />
            </button>

            <button
              type="button"
              class="ctrl-btn flex h-11 w-11 items-center justify-center rounded-2xl"
              @click="handleShuffle"
            >
              <Shuffle class="h-5.5 w-5.5" />
            </button>

          </div>
        </div>
      </section>

    </main>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════════════════════════ */
.root {
  --c-bg:           #07080c;
  --c-bg-elevated:  #0f1115;
  --c-surface:      rgba(255,255,255,0.04);
  --c-surface-hover:rgba(255,255,255,0.06);
  --c-surface-press:rgba(255,255,255,0.07);

  --c-text:           #e4e6ec;
  --c-text-secondary: rgba(255,255,255,0.85);
  --c-label-secondary:rgba(255,255,255,0.55);
  --c-label-muted:    rgba(255,255,255,0.25);
  --c-label-faint:    rgba(255,255,255,0.40);

  --c-border:        rgba(255,255,255,0.08);
  --c-border-strong: rgba(255,255,255,0.10);
  --c-divider:       rgba(255,255,255,0.07);
  --c-track-idle-border: rgba(255,255,255,0.06);

  --c-primary:       #34d399;
  --c-primary-soft:  #6ee7b7;
  --c-primary-mid:   #10b981;
  --c-primary-deep:  #059669;
  --c-primary-ink:   #022c22;
  --c-primary-tint:  rgba(52,211,153,0.07);
  --c-primary-tint-stat: rgba(52,211,153,0.10);

  --shadow-play-btn:  0 6px 28px rgba(52,211,153,0.45);
  --shadow-seek-bar:  0 0  8px  rgba(52,211,153,0.55);
  --shadow-seek-thumb:0 0 10px  rgba(52,211,153,0.50), 0 1px 4px rgba(0,0,0,0.50);
  --shadow-sort-menu: 0 20px 60px rgba(0,0,0,0.65), 0 0 0 1px rgba(52,211,153,0.04);

  background-color: var(--c-bg);
}

.timer-display:active {
  border-color: rgba(52,211,153,0.30);
  background: rgba(52,211,153,0.04);
}

.timer-btn-start {
  background: linear-gradient(135deg, var(--c-primary), var(--c-primary-deep));
  color: var(--c-primary-ink);
}

.timer-btn-cancel {
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.60);
}
.timer-btn-cancel:active { background: rgba(255,255,255,0.10); }

.search-input:focus {
  border-color: rgba(52,211,153,0.35);
  background: rgba(52,211,153,0.03);
}

.sort-trigger:active {
  border-color: rgba(255,255,255,0.15);
  color: var(--c-text);
}

.sort-menu { box-shadow: var(--shadow-sort-menu); }

.sort-item:active { background: rgba(255,255,255,0.07); }

.track-idle {
  border-color: var(--c-track-idle-border);
  background: var(--c-surface);
}
.track-idle:active {
  border-color: rgba(255,255,255,0.10);
  background: var(--c-surface-hover);
}
.track-active {
  border-color: rgba(52,211,153,0.25);
  background: var(--c-primary-tint);
  box-shadow: inset 0 0 0 1px rgba(52,211,153,0.08);
}

.stat-idle   { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.32); }
.stat-active { background: var(--c-primary-tint-stat); color: rgba(110,231,183,0.65); }

.seek-track  { background: rgba(255,255,255,0.10); }
.seek-fill   {
  background: linear-gradient(to right, var(--c-primary), var(--c-primary-soft));
  box-shadow: var(--shadow-seek-bar);
}
.seek-thumb  { box-shadow: var(--shadow-seek-thumb); }

.ctrl-btn { color: rgba(255,255,255,0.45); }
.ctrl-btn:active {
  background: rgba(255,255,255,0.07);
  color: var(--c-text);
}

.play-btn {
  background: linear-gradient(135deg, var(--c-primary), var(--c-primary-deep));
  color: var(--c-primary-ink);
  box-shadow: var(--shadow-play-btn);
}
.play-btn:disabled {
  opacity: 0.6;
}
</style>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Clock3,
  Pause,
  Play,
  RefreshCcw,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
} from '@lucide/vue'

import { RecycleScroller } from 'vue-virtual-scroller' // ← Thêm import này
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css' // ← Import CSS (nên import 1 lần trong main.ts hoặc App.vue)

import { usePlayerStore } from '@/stores/player'
import {
  createDeadlineFromTime,
  formatCountdown,
  formatLocalClock,
  formatSelectedTime,
} from '@/lib/time'
import { useSeekSlider } from '@/lib/slider'
import { filterTracksByQuery, moveTracksToFront, sortTracksByPlayCount } from '@/lib/trackList'
import { formatDuration } from '@/utils/format'

const ARCHIVE_IDENTIFIER = 'tiktok-tacgiasuthatman'

const player = usePlayerStore()

const query = ref('')
const currentClock = ref('')
const scroller = ref<any>(null) // ref cho RecycleScroller
const timerInput = ref<HTMLInputElement | null>(null)
const timerValue = ref('06:00')
const timerDeadline = ref<number | null>(null)
const timerCountdown = ref('')
const sortByPlays = ref<'desc' | 'asc'>('desc')
let clockInterval: number | null = null
let timerInterval: number | null = null
let timerTimeout: number | null = null

const filteredAudios = computed(() => {
  return filterTracksByQuery(player.audios, query.value)
})

const currentTrack = computed(() => player.currentAudio)
const trackPositionLabel = computed(() => {
  if (!currentTrack.value) return `0/${player.audios.length}`
  return `${player.currentIndex + 1}/${player.audios.length}`
})

const displayDuration = computed(() => player.duration || currentTrack.value?.durationHint || 0)
const buffering = computed(() => player.playerState === 'buffering')
const sortButtonLabel = computed(() =>
  sortByPlays.value === 'desc' ? 'Nghe nhiều đến ít' : 'Nghe ít đến nhiều'
)

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

function getPlaybackList() {
  return filteredAudios.value
}

function updateClock() {
  currentClock.value = formatLocalClock()
}

function updateTimerCountdown() {
  if (!timerDeadline.value) {
    timerCountdown.value = ''
    return
  }
  timerCountdown.value = formatCountdown(Math.max(0, timerDeadline.value - Date.now()))
}

function clearSleepTimer() {
  if (timerInterval !== null) {
    window.clearInterval(timerInterval)
    timerInterval = null
  }
  if (timerTimeout !== null) {
    window.clearTimeout(timerTimeout)
    timerTimeout = null
  }
  timerDeadline.value = null
  timerCountdown.value = ''
}

function openTimerPicker() {
  if (!timerInput.value) return
  if ('showPicker' in HTMLInputElement.prototype) {
    timerInput.value.showPicker()
    return
  }
  timerInput.value.focus()
  timerInput.value.click()
}

async function playFirstFromCurrentList() {
  const firstTrack = getPlaybackList()[0]
  if (!firstTrack) return
  const index = player.audios.findIndex((track) => track.id === firstTrack.id)
  if (index >= 0) await player.playAt(index)
}

async function handlePrimaryAction() {
  if (!timerValue.value) return
  clearSleepTimer()

  const now = new Date()
  const targetDate = createDeadlineFromTime(timerValue.value, now)
  if (!targetDate) return

  timerDeadline.value = targetDate.getTime()
  updateTimerCountdown()
  timerInterval = window.setInterval(updateTimerCountdown, 1000)
  timerTimeout = window.setTimeout(() => {
    player.pausePlayback()
    clearSleepTimer()
  }, timerDeadline.value - now.getTime())
}

async function selectTrack(trackId: string) {
  const index = player.audios.findIndex((track) => track.id === trackId)
  if (index < 0) return
  if (index === player.currentIndex) {
    player.togglePlayback()
    return
  }
  await player.playAt(index)
}

async function handleReload() {
  await player.loadAudios(ARCHIVE_IDENTIFIER, { force: true })
  await nextTick()
  await playFirstFromCurrentList()
}

async function handlePrev() {
  const playbackList = getPlaybackList()
  if (playbackList.length === 0) return

  if (player.currentTime > 3) {
    player.seekTo(0)
    return
  }

  const activeIndex = playbackList.findIndex((track) => track.id === currentTrack.value?.id)
  const previousIndex =
    activeIndex >= 0 ? (activeIndex - 1 + playbackList.length) % playbackList.length : playbackList.length - 1

  await selectTrack(playbackList[previousIndex]!.id)
}

async function handleNext() {
  const playbackList = getPlaybackList()
  if (playbackList.length === 0) return

  const activeIndex = playbackList.findIndex((track) => track.id === currentTrack.value?.id)
  const nextIndex = activeIndex >= 0 ? (activeIndex + 1) % playbackList.length : 0
  await selectTrack(playbackList[nextIndex]!.id)
}

async function handleShuffle() {
  const playbackList = getPlaybackList()
  await player.shuffleAndPlay(playbackList.map((track) => track.id))
}

async function toggleSortDirection() {
  sortByPlays.value = sortByPlays.value === 'desc' ? 'asc' : 'desc'
  const sortedSubset = sortTracksByPlayCount(filteredAudios.value, player.playCounts, sortByPlays.value)
  player.audios = moveTracksToFront(player.audios, sortedSubset.map((track) => track.id))

  await playFirstFromCurrentList()
}

// Cập nhật hàm scroll để dùng API của RecycleScroller
async function scrollActiveTrackIntoView() {
  await nextTick()
  if (!scroller.value || !currentTrack.value) return

  const index = filteredAudios.value.findIndex((track) => track.id === currentTrack.value!.id)
  if (index < 0) return

  // scrollToItem sẽ đưa item vào viewport (thường align top, đủ mượt mà trên mobile)
  scroller.value.scrollToItem(index - 2)
}

watch(() => query.value, async (next, prev) => {
  if (next === prev) return
  if (filteredAudios.value.length > 0) await playFirstFromCurrentList()
})

watch(
  () => [player.currentIndex, filteredAudios.value.map(t => t.id).join('|')],
  async () => await scrollActiveTrackIntoView()
)

onMounted(async () => {
  updateClock()
  clockInterval = window.setInterval(updateClock, 30000)

  if (player.identifier === ARCHIVE_IDENTIFIER && player.audios.length > 0) return
  await player.loadAudios(ARCHIVE_IDENTIFIER)
})

onUnmounted(() => {
  if (clockInterval) window.clearInterval(clockInterval)
  clearSleepTimer()
  player.dispose()
})
</script>

<template>
  <div class="h-svh overflow-hidden bg-[#050505] text-white">
    <main class="mx-auto flex h-full w-full max-w-sm flex-col overflow-hidden px-3 pb-52 pt-2">
      <!-- HEADER -->
      <div class="sticky top-0 z-10 shrink-0 bg-[#050505]">
        <!-- Timer -->
        <section class="border-b border-white/10 pb-4 pt-1">
          <div class="flex items-center justify-between gap-4">
            <span class="text-base font-medium text-white/90">Hẹn giờ ngủ</span>
            <button
              type="button"
              class="flex h-10 items-center gap-3 rounded-3xl border border-white/10 bg-[#111113] px-4 text-base font-semibold shadow-inner active:scale-[0.97]"
              @click="openTimerPicker"
            >
              <Clock3 class="h-5 w-5 text-emerald-400" />
              <span class="tabular-nums">
                {{ timerDeadline ? timerCountdown : formatSelectedTime(timerValue, currentClock) }}
              </span>
            </button>
            <input ref="timerInput" v-model="timerValue" type="time" class="sr-only" />

            <button
              type="button"
              class="h-10 min-w-22 rounded-3xl px-2 text-base font-semibold active:scale-[0.97]"
              :class="
                timerDeadline
                  ? 'bg-white/10 text-white hover:bg-white/20'
                  : 'bg-white text-black'
              "
              @click="timerDeadline ? clearSleepTimer() : handlePrimaryAction()"
            >
              {{ timerDeadline ? 'Hủy' : 'Bắt đầu' }}
            </button>
          </div>
        </section>

        <!-- Search + Sort -->
        <section class="pt-4">
          <div class="flex gap-2">
            <div class="relative flex-1">
              <Search class="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-white/50" />
              <input
                v-model="query"
                type="text"
                inputmode="search"
                placeholder="Tìm kiếm..."
                class="h-11 w-full rounded-3xl border border-white/10 bg-[#141417] pl-12 pr-5 text-[17px] text-white outline-none placeholder:text-white/50 focus:border-emerald-400/30"
              />
            </div>

            <button
              type="button"
              class="flex h-11 w-11 items-center justify-center rounded-3xl border border-white/10 bg-[#141417] active:scale-95"
              :title="sortButtonLabel"
              @click="toggleSortDirection"
            >
              <ArrowDownWideNarrow v-if="sortByPlays === 'desc'" class="h-5 w-5" />
              <ArrowUpNarrowWide v-else class="h-5 w-5" />
            </button>
          </div>
        </section>
      </div>

      <!-- LIST - Sử dụng vue-virtual-scroller -->
      <section class="flex-1 overflow-hidden pt-4">
        <div
          v-if="player.loading && player.audios.length === 0"
          class="space-y-3 px-1"
        >
          <div v-for="n in 8" :key="n" class="h-16 animate-pulse rounded-3xl bg-white/5" />
        </div>

        <div
          v-else-if="filteredAudios.length === 0"
          class="flex h-full flex-col items-center justify-center text-center text-white/60"
        >
          <p class="text-base">{{ player.error || 'Không tìm thấy bài hát nào' }}</p>
        </div>

        <!-- RecycleScroller thay thế v-for thông thường -->
        <RecycleScroller
          v-else
          ref="scroller"
          :items="filteredAudios"
          :item-size="56" 
          :key-field="'id'"
          class="hide-scrollbar h-full px-1 pb-6"
        >
          <template #default="{ item: track }">
            <button
              :data-track-id="track.id"
              type="button"
              class="block w-full rounded-3xl px-5 py-4 text-left hover:bg-white/5 active:scale-[0.98]"
              :class="{ 'bg-white/10 shadow-inner': track.id === currentTrack?.id }"
              @click="selectTrack(track.id)"
            >
              <div class="flex justify-between">
                <p
                  class="flex-1 text-[17px] font-medium leading-tight pr-4 line-clamp-1"
                  :class="track.id === currentTrack?.id ? 'text-white' : 'text-white/90'"
                >
                  {{ track.title }}
                </p>
                <div class="text-right">
                  <span class="tabular-nums text-xs font-medium text-white/40">
                    {{ (player.playCounts[track.id] ?? 0).toLocaleString('vi-VN') }}
                  </span>
                  <span class="ml-1 text-[10px] font-medium uppercase tracking-widest text-white/30">lượt</span>
                </div>
              </div>
            </button>
          </template>
        </RecycleScroller>
      </section>
    </main>

    <!-- BOTTOM PLAYER (không thay đổi) -->
    <section class="fixed inset-x-0 bottom-0 bg-[#050505] shadow-[0_-8px_25px_-8px] shadow-black/70">
      <div class="mx-auto max-w-sm border-t border-white/10 px-4 pb-5 pt-4">
        <!-- Info -->
        <div class="mb-4 text-center">
          <p class="line-clamp-1 text-2xl font-semibold tracking-tight text-white">
            {{ currentTrack?.title || 'Chưa chọn bài hát' }}
          </p>
          <p class="mt-1 text-sm font-medium text-white/50">
            {{ trackPositionLabel }}
          </p>
        </div>

        <!-- Progress -->
        <div class="mb-5 flex items-center gap-3">
          <span class="w-10 tabular-nums text-sm font-medium text-white/70">
            {{ formatDuration(displayedCurrentTime) }}
          </span>
          <div
            ref="seekSliderTrackRef"
            class="relative h-3 flex-1 cursor-pointer rounded-3xl bg-white/10 touch-none select-none"
            role="slider"
            :aria-valuemin="0"
            :aria-valuemax="displayDuration"
            :aria-valuenow="Math.round(seekSliderPreviewValue)"
            aria-label="Tua audio"
            @pointerdown="onSeekSliderPointerDown"
          >
            <div class="absolute inset-0 rounded-3xl bg-white/10" />
            <div
              class="absolute inset-y-0 left-0 rounded-3xl bg-linear-to-r from-emerald-300 to-white shadow-[0_0_12px_2px] shadow-emerald-300/60"
              :class="isSeekDragging ? 'transition-none' : 'transition-all'"
              :style="{ width: `${seekSliderProgress}%` }"
            />
          </div>
          <span class="w-10 tabular-nums text-sm font-medium text-white/70 text-right">
            {{ formatDuration(displayDuration) }}
          </span>
        </div>

        <!-- Controls -->
        <div class="flex items-center justify-between px-1">
          <button
            type="button"
            class="flex h-11 w-11 items-center justify-center rounded-3xl text-white transition active:scale-95 disabled:opacity-40"
            :disabled="player.loading"
            @click="handleReload"
          >
            <RefreshCcw :class="{ 'animate-spin': player.loading }" class="h-7 w-7" />
          </button>

          <button
            type="button"
            class="flex h-11 w-11 items-center justify-center rounded-3xl text-white transition active:scale-95"
            @click="handlePrev"
          >
            <SkipBack class="h-7 w-7" />
          </button>

          <button
            type="button"
            class="flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-black shadow-[0_0_12px_2px] shadow-white/40 transition active:scale-95"
            @click="player.togglePlayback"
          >
            <div v-if="buffering" class="h-8 w-8 animate-spin rounded-full border-4 border-black/20 border-t-black" />
            <Pause v-else-if="player.playing" class="h-10 w-10" />
            <Play v-else class="ml-1 h-10 w-10" />
          </button>

          <button
            type="button"
            class="flex h-11 w-11 items-center justify-center rounded-3xl text-white transition active:scale-95"
            @click="handleNext"
          >
            <SkipForward class="h-7 w-7" />
          </button>

          <button
            type="button"
            class="flex h-11 w-11 items-center justify-center rounded-3xl text-white transition active:scale-95"
            @click="handleShuffle"
          >
            <Shuffle class="h-7 w-7" />
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

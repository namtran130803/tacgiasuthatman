<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Clock3,
  Heart,
  Headphones,
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

import { RecycleScroller } from 'vue-virtual-scroller' // ← Thêm import này
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css' // ← Import CSS (nên import 1 lần trong main.ts hoặc App.vue)

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
const scroller = ref<any>(null) // ref cho RecycleScroller
const sortMenuRef = ref<HTMLElement | null>(null)
const timerInput = ref<HTMLInputElement | null>(null)
const timerValue = ref(homeViewState?.timerValue || '06:00')
const timerDeadline = ref<number | null>(homeViewState?.timerDeadline ?? null)
const timerCountdown = ref('')
const sortMenuOpen = ref(homeViewState?.sortMenuOpen || false)
const selectedSort = ref<TrackSortOption>(
  (homeViewState?.selectedSort as TrackSortOption | undefined) || 'newest',
)
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
  { key: 'date', label: 'Ngày đăng', shortLabel: 'Ngày đăng', icon: Clock3, desc: 'newest', asc: 'oldest' },
  { key: 'play', label: 'Lượt phát', shortLabel: 'Phát', icon: Play, desc: 'play_desc', asc: 'play_asc' },
  {
    key: 'view',
    label: 'Lượt nghe',
    shortLabel: 'Nghe',
    icon: Headphones,
    desc: 'view_desc',
    asc: 'view_asc',
  },
  { key: 'like', label: 'Lượt thích', shortLabel: 'Thích', icon: Heart, desc: 'like_desc', asc: 'like_asc' },
  {
    key: 'repost',
    label: 'Đăng lại',
    shortLabel: 'Đăng lại',
    icon: Repeat2,
    desc: 'repost_desc',
    asc: 'repost_asc',
  },
  {
    key: 'comment',
    label: 'Bình luận',
    shortLabel: 'Bình luận',
    icon: MessageCircle,
    desc: 'comment_desc',
    asc: 'comment_asc',
  },
  { key: 'save', label: 'Lưu', shortLabel: 'Lưu', icon: Bookmark, desc: 'save_desc', asc: 'save_asc' },
]

const filteredAudios = computed(() => {
  const tracks = filterTracksByQuery(player.audios, query.value)
  return sortTracks(tracks, player.playCounts, selectedSort.value)
})

const currentTrack = computed(() => player.currentAudio)
const trackPositionLabel = computed(() => {
  if (!currentTrack.value) return `0/${filteredAudios.value.length || player.audios.length}`

  const activeIndex = filteredAudios.value.findIndex((track) => track.id === currentTrack.value?.id)
  if (activeIndex < 0) {
    return `0/${filteredAudios.value.length || player.audios.length}`
  }

  return `${activeIndex + 1}/${filteredAudios.value.length}`
})

const displayDuration = computed(() => player.duration || currentTrack.value?.durationHint || 0)
const buffering = computed(() => player.playerState === 'buffering')
const selectedSortGroup = computed(() =>
  sortGroups.find((option) => option.desc === selectedSort.value || option.asc === selectedSort.value),
)
const selectedSortLabel = computed(() => {
  const group = selectedSortGroup.value
  if (!group) {
    return 'Sắp xếp'
  }

  return group.label
})
const selectedSortShortLabel = computed(() => selectedSortGroup.value?.shortLabel || 'Sắp xếp')
const selectedSortIsAscending = computed(() => {
  const group = selectedSortGroup.value
  if (!group) {
    return false
  }

  return selectedSort.value === group.asc
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

function writeViewState() {
  writeHomeViewState({
    query: query.value,
    selectedSort: selectedSort.value,
    sortMenuOpen: sortMenuOpen.value,
    timerValue: timerValue.value,
    timerDeadline: timerDeadline.value,
  })
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
  writeViewState()
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

function closeSortMenu() {
  sortMenuOpen.value = false
  writeViewState()
}

function toggleSortMenu() {
  sortMenuOpen.value = !sortMenuOpen.value
  writeViewState()
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
  writeViewState()
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
  await player.loadAudios(PLAYLIST_SOURCE_URL, { force: true, downloadBaseUrl: DOWNLOAD_BASE_URL })
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
    activeIndex >= 0
      ? (activeIndex - 1 + playbackList.length) % playbackList.length
      : playbackList.length - 1

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

async function handleTogglePlayback() {
  player.togglePlayback()
  await scrollActiveTrackIntoView()
}

async function applySort(nextSort: TrackSortOption) {
  selectedSort.value = nextSort
  writeViewState()
  await playFirstFromCurrentList()
}

async function toggleSortGroup(desc: TrackSortOption, asc: TrackSortOption) {
  await applySort(selectedSort.value === desc ? asc : desc)
}

function handleWindowPointerDown(event: PointerEvent) {
  if (!sortMenuOpen.value || !sortMenuRef.value) {
    return
  }

  const target = event.target
  if (target instanceof Node && !sortMenuRef.value.contains(target)) {
    closeSortMenu()
  }
}

// Cập nhật hàm scroll để dùng API của RecycleScroller
async function scrollActiveTrackIntoView() {
  await nextTick()
  if (!scroller.value || !currentTrack.value) return

  const index = filteredAudios.value.findIndex((track) => track.id === currentTrack.value!.id)
  if (index < 0) return

  // scrollToItem sẽ đưa item vào viewport (thường align top, đủ mượt mà trên mobile)
  scroller.value.scrollToItem(index - 1)
}

watch(
  () => query.value,
  async (next, prev) => {
    if (next === prev) return
    writeViewState()
    if (filteredAudios.value.length > 0) await playFirstFromCurrentList()
  },
)

watch(
  () => timerValue.value,
  () => writeViewState(),
)

watch(
  () => [player.currentIndex, filteredAudios.value.map((t) => t.id).join('|')],
  async () => await scrollActiveTrackIntoView(),
)

onMounted(async () => {
  updateClock()
  clockInterval = window.setInterval(updateClock, 30000)
  window.addEventListener('pointerdown', handleWindowPointerDown)

  if (timerDeadline.value) {
    const remaining = timerDeadline.value - Date.now()
    if (remaining > 0) {
      updateTimerCountdown()
      timerInterval = window.setInterval(updateTimerCountdown, 1000)
      timerTimeout = window.setTimeout(() => {
        player.pausePlayback()
        clearSleepTimer()
      }, remaining)
    } else {
      clearSleepTimer()
    }
  }

  writeViewState()

  if (player.identifier === PLAYLIST_SOURCE_URL && player.audios.length > 0) {
    await scrollActiveTrackIntoView()
    return
  }

  await player.loadAudios(PLAYLIST_SOURCE_URL, { downloadBaseUrl: DOWNLOAD_BASE_URL })
  await scrollActiveTrackIntoView()
})

onUnmounted(() => {
  if (clockInterval) window.clearInterval(clockInterval)
  window.removeEventListener('pointerdown', handleWindowPointerDown)
  clearSleepTimer()
  player.dispose()
})
</script>

<template>
  <div class="h-svh w-svw bg-[#050505] text-white px-3">
    <main class="flex h-full w-full flex-col">
      <!-- HEADER -->
      <div class="sticky top-0 z-10 shrink-0 bg-[#050505]">
        <!-- Timer -->
        <section class="border-b border-white/10 py-3">
          <div class="flex items-center justify-between gap-3">
            <span class="text-base font-medium text-white/90">Hẹn giờ ngủ</span>
            <button
              type="button"
              class="flex flex-1 h-10 items-center gap-3 rounded-3xl border border-white/10 bg-[#111113] px-4 text-base font-semibold shadow-inner active:scale-[0.97]"
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
                timerDeadline ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-white text-black'
              "
              @click="timerDeadline ? clearSleepTimer() : handlePrimaryAction()"
            >
              {{ timerDeadline ? 'Hủy' : 'Bắt đầu' }}
            </button>
          </div>
        </section>

        <!-- Search + Sort -->
        <section class="py-3">
          <div class="flex gap-2">
            <div class="relative flex-1">
              <Search
                class="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-white/50"
              />
              <input
                v-model="query"
                type="text"
                inputmode="search"
                placeholder="Tìm kiếm..."
                class="h-11 w-full rounded-3xl border border-white/10 bg-[#141417] pl-12 pr-5 text-[17px] text-white outline-none placeholder:text-white/50 focus:border-emerald-400/30"
              />
            </div>

            <div ref="sortMenuRef" class="relative">
              <button
                type="button"
                class="flex h-11 items-center justify-center gap-2 rounded-3xl border border-white/10 bg-[#141417] px-4 text-sm font-medium text-white active:scale-95"
                :title="selectedSortLabel"
                @click.stop="toggleSortMenu"
              >
                <component :is="selectedSortGroup?.icon || Clock3" class="h-4 w-4" />
                <span>{{ selectedSortShortLabel }}</span>
                <ArrowUp v-if="selectedSortIsAscending" class="h-4 w-4" />
                <ArrowDown v-else class="h-4 w-4" />
              </button>

              <div
                v-if="sortMenuOpen"
                class="absolute right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-3xl border border-white/10 bg-[#141417] py-2 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
              >
                <button
                  v-for="group in sortGroups"
                  :key="group.key"
                  type="button"
                  class="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm transition hover:bg-white/10"
                  :class="
                    selectedSort === group.desc || selectedSort === group.asc
                      ? 'text-white'
                      : 'text-white/75'
                  "
                  @click="toggleSortGroup(group.desc, group.asc)"
                >
                  <span class="flex items-center gap-2 text-nowrap">
                    <component :is="group.icon" class="h-4 w-4" />
                    <span>{{ group.shortLabel }}</span>
                  </span>
                  <span class="flex items-center gap-1">
                    <ArrowDown
                      class="h-4 w-4"
                      :class="selectedSort === group.desc ? 'text-white' : 'text-white/35'"
                    />
                    <ArrowUp
                      class="h-4 w-4"
                      :class="selectedSort === group.asc ? 'text-white' : 'text-white/35'"
                    />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- LIST - Sử dụng vue-virtual-scroller -->
      <section class="flex-1 overflow-hidden bg-[#050505]">
        <div v-if="player.loading && player.audios.length === 0" class="space-y-3">
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
          :item-size="92"
          :key-field="'id'"
          class="hide-scrollbar h-full pb-3"
        >
          <template #default="{ item: track }">
            <button
              :data-track-id="track.id"
              type="button"
              class="block w-full rounded-3xl p-3 text-left hover:bg-white/5 active:scale-[0.98]"
              :class="{ 'bg-white/10 shadow-inner': track.id === currentTrack?.id }"
              @click="selectTrack(track.id)"
            >
              <div class="flex flex-col gap-2">
                <div class="flex justify-between">
                  <p
                    class="flex-1 font-medium line-clamp-1"
                    :class="track.id === currentTrack?.id ? 'text-white' : 'text-white/90'"
                  >
                    {{ track.title }}
                  </p>

                  <div class="flex flex-wrap gap-2 text-sm">
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 tabular-nums"
                      aria-label="Lượt phát"
                    >
                      <Play class="h-3.5 w-3.5" />
                      {{ (player.playCounts[track.id] ?? 0).toLocaleString('vi-VN') }}
                    </span>
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 tabular-nums"
                      aria-label="Lượt nghe"
                    >
                      <Headphones class="h-3.5 w-3.5" />
                      {{ track.viewCount.toLocaleString('vi-VN') }}
                    </span>
                  </div>
                </div>

                <div class="space-y-2 text-sm text-white/50">
                  <div class="flex flex-wrap gap-2 justify-end">
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 tabular-nums"
                      aria-label="Lượt thích"
                    >
                      <Heart class="h-3.5 w-3.5" />
                      {{ track.likeCount.toLocaleString('vi-VN') }}
                    </span>
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 tabular-nums"
                      aria-label="Đăng lại"
                    >
                      <Repeat2 class="h-3.5 w-3.5" />
                      {{ track.repostCount.toLocaleString('vi-VN') }}
                    </span>
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 tabular-nums"
                      aria-label="Bình luận"
                    >
                      <MessageCircle class="h-3.5 w-3.5" />
                      {{ track.commentCount.toLocaleString('vi-VN') }}
                    </span>
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 tabular-nums"
                      aria-label="Lưu"
                    >
                      <Bookmark class="h-3.5 w-3.5" />
                      {{ track.saveCount.toLocaleString('vi-VN') }}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          </template>
        </RecycleScroller>
      </section>

      <!-- BOTTOM PLAYER (không thay đổi) -->
      <section class="bg-[#050505]">
        <div class="mx-auto border-t border-white/10 py-6 px-3 flex flex-col gap-3">
          <!-- Info -->
          <div class="text-center">
            <p class="line-clamp-1 text-xl font-semibold tracking-tight text-white">
              {{ currentTrack?.title || 'Chưa chọn bài hát' }}
            </p>
            <p class="text-sm font-medium text-white/50 mt-1">
              {{ trackPositionLabel }}
            </p>
          </div>

          <!-- Progress -->
          <div class="flex items-center gap-3">
            <span class="tabular-nums text-sm font-medium text-white/70">
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
            <span class="tabular-nums text-sm font-medium text-white/70 text-right">
              {{ formatDuration(displayDuration) }}
            </span>
          </div>

          <!-- Controls -->
          <div class="flex items-center justify-between">
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
              @click="handleTogglePlayback"
            >
              <div
                v-if="buffering"
                class="h-8 w-8 animate-spin rounded-full border-4 border-black/20 border-t-black"
              />
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
    </main>
  </div>
</template>

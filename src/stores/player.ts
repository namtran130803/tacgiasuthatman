import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { fetchArchiveAudios, type ArchiveAudio } from '@/services/audioApi'
import { audioPlayer } from '@/services/audioPlayer'
import {
  readLastIdentifier,
  readPlayCounts as readStoredPlayCounts,
  readPlayerSnapshot,
  writeLastIdentifier,
  writePlayCounts as persistPlayCounts,
  writePlayerSnapshot,
} from '@/lib/playerSnapshot'

type PlayerState = 'idle' | 'playing' | 'paused' | 'buffering' | 'error'

function shuffleArray<T>(items: T[]) {
  const nextItems = [...items]
  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const currentItem = nextItems[index]!
    nextItems[index] = nextItems[swapIndex]!
    nextItems[swapIndex] = currentItem
  }

  return nextItems
}

function sortAudiosByNewest(items: ArchiveAudio[]) {
  return [...items].sort((left, right) => right.mtime - left.mtime)
}

export const usePlayerStore = defineStore('player', () => {
  const audios = ref<ArchiveAudio[]>([])
  const currentIndex = ref(-1)
  const currentTime = ref(0)
  const playing = ref(false)
  const duration = ref(0)
  const identifier = ref(readLastIdentifier())
  const loading = ref(false)
  const error = ref('')
  const shuffle = ref(false)
  const playerState = ref<PlayerState>('idle')
  const playCounts = ref<Record<string, number>>(readStoredPlayCounts())
  const snapshot = readPlayerSnapshot()

  if (snapshot) {
    audios.value = snapshot.audios
    currentIndex.value = snapshot.currentIndex
    currentTime.value = snapshot.currentTime
    duration.value = snapshot.duration
    playing.value = false
    shuffle.value = snapshot.shuffle
    identifier.value = snapshot.identifier || identifier.value
    playCounts.value = snapshot.playCounts
    playerState.value = snapshot.playing ? 'paused' : 'idle'
  }

  let progressTimer: number | null = null

  const currentAudio = computed(() => audios.value[currentIndex.value] ?? null)

  function stopProgressTimer() {
    if (progressTimer !== null) {
      window.clearInterval(progressTimer)
      progressTimer = null
    }
  }

  function syncProgress() {
    currentTime.value = audioPlayer.getCurrentTime()
    duration.value = audioPlayer.getDuration()
    writeSnapshot()
  }

  function startProgressTimer() {
    stopProgressTimer()
    progressTimer = window.setInterval(syncProgress, 500)
  }

  function writePlayCounts() {
    persistPlayCounts(playCounts.value)
  }

  function writeSnapshot() {
    writePlayerSnapshot({
      audios: audios.value,
      currentIndex: currentIndex.value,
      currentTime: currentTime.value,
      duration: duration.value,
      playing: playing.value,
      shuffle: shuffle.value,
      identifier: identifier.value,
      playCounts: playCounts.value,
    })
  }

  function incrementPlayCount(trackId: string) {
    playCounts.value = {
      ...playCounts.value,
      [trackId]: (playCounts.value[trackId] ?? 0) + 1,
    }
    writePlayCounts()
    writeSnapshot()
  }

  function bindPlayerEvents() {
    audioPlayer.configure({
      onPlay: () => {
        playing.value = true
        playerState.value = 'playing'
        error.value = ''
        duration.value = audioPlayer.getDuration()
        startProgressTimer()
        writeSnapshot()
      },
      onPause: () => {
        playing.value = false
        playerState.value = currentAudio.value ? 'paused' : 'idle'
        syncProgress()
        stopProgressTimer()
        writeSnapshot()
      },
      onStop: () => {
        playing.value = false
        currentTime.value = 0
        playerState.value = currentAudio.value ? 'paused' : 'idle'
        stopProgressTimer()
        writeSnapshot()
      },
      onEnd: () => {
        stopProgressTimer()
        if (currentAudio.value) {
          incrementPlayCount(currentAudio.value.id)
        }
        const nextIndex = resolveNextIndex(1)
        if (nextIndex >= 0) {
          void playAt(nextIndex)
        }
      },
      onLoad: () => {
        duration.value = audioPlayer.getDuration()
      },
      onSeek: syncProgress,
      onError: (message) => {
        error.value = message
        playing.value = false
        playerState.value = 'error'
        stopProgressTimer()
        writeSnapshot()
      },
    })
  }

  async function loadAudios(
    nextIdentifier: string,
    options?: { force?: boolean; downloadBaseUrl?: string },
  ) {
    const normalizedIdentifier = nextIdentifier.trim()
    if (!normalizedIdentifier) {
      error.value = 'Playlist source URL is required.'
      audios.value = []
      currentIndex.value = -1
      return
    }

    loading.value = true
    error.value = ''

    try {
      const tracks = sortAudiosByNewest(await fetchArchiveAudios(normalizedIdentifier, options))
      audios.value = tracks
      identifier.value = normalizedIdentifier
      writeLastIdentifier(normalizedIdentifier)

      if (tracks.length === 0) {
        currentIndex.value = -1
        audioPlayer.unload()
        playing.value = false
        currentTime.value = 0
        duration.value = 0
        playerState.value = 'idle'
        shuffle.value = false
        writeSnapshot()
        return
      }

      shuffle.value = false
      if (options?.force) {
        currentIndex.value = 0
      } else if (currentIndex.value < 0 || currentIndex.value >= tracks.length) {
        currentIndex.value = 0
      }
      writeSnapshot()
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : 'Unable to load audio library.'
      error.value = message
      audios.value = []
      currentIndex.value = -1
      playerState.value = 'error'
      writeSnapshot()
    } finally {
      loading.value = false
    }
  }

  async function playAt(index: number, options?: { startAt?: number }) {
    const track = audios.value[index]
    if (!track) {
      return
    }

    const startAt = options?.startAt ?? 0
    currentIndex.value = index
    currentTime.value = startAt
    duration.value = 0
    error.value = ''
    playerState.value = 'buffering'
    writeSnapshot()

    await audioPlayer.load(track, { force: true })
    if (startAt > 0) {
      audioPlayer.seek(startAt)
    }
    audioPlayer.play()
  }

  function replayCurrent() {
    if (!currentAudio.value) {
      return
    }

    if (!audioPlayer.hasTrack(currentAudio.value.id)) {
      void playAt(currentIndex.value)
      return
    }

    currentTime.value = 0
    audioPlayer.seek(0)
    playerState.value = 'buffering'
    writeSnapshot()
    audioPlayer.play()
  }

  function togglePlayback() {
    if (!currentAudio.value && audios.value.length > 0) {
      void playAt(0)
      return
    }

    if (!currentAudio.value) {
      return
    }

    if (!audioPlayer.hasTrack(currentAudio.value.id)) {
      void playAt(currentIndex.value >= 0 ? currentIndex.value : 0, {
        startAt: currentTime.value > 0 ? currentTime.value : 0,
      })
      return
    }

    if (playing.value) {
      audioPlayer.pause()
      return
    }

    playerState.value = 'buffering'
    writeSnapshot()
    audioPlayer.play()
  }

  function pausePlayback() {
    if (!currentAudio.value) {
      return
    }

    audioPlayer.pause()
  }

  function resolveNextIndex(direction: 1 | -1) {
    if (audios.value.length === 0) {
      return -1
    }

    const baseIndex = currentIndex.value >= 0 ? currentIndex.value : 0
    return (baseIndex + direction + audios.value.length) % audios.value.length
  }

  async function shuffleAndPlay(trackIds?: string[]) {
    if (audios.value.length === 0) {
      return
    }

    if (!trackIds || trackIds.length === 0) {
      audios.value = shuffleArray(audios.value)
      shuffle.value = true
      await playAt(0)
      return
    }

    const trackMap = new Map(audios.value.map((track) => [track.id, track]))
    const uniqueIds = Array.from(new Set(trackIds)).filter((id) => trackMap.has(id))
    if (uniqueIds.length === 0) {
      return
    }

    const subset = uniqueIds
      .map((id) => trackMap.get(id))
      .filter((track): track is ArchiveAudio => Boolean(track))

    const shuffledSubset = shuffleArray(subset)
    const subsetIdSet = new Set(uniqueIds)
    const remainingTracks = audios.value.filter((track) => !subsetIdSet.has(track.id))

    audios.value = [...shuffledSubset, ...remainingTracks]
    shuffle.value = true
    await playAt(0)
    writeSnapshot()
  }

  function seekTo(value: number) {
    const nextValue = Math.max(0, Math.min(value, duration.value || 0))
    audioPlayer.seek(nextValue)
    currentTime.value = nextValue
    writeSnapshot()
  }

  function dispose() {
    stopProgressTimer()
    writeSnapshot()
  }

  bindPlayerEvents()

  return {
    audios,
    currentIndex,
    currentTime,
    playing,
    duration,
    identifier,
    loading,
    error,
    shuffle,
    playerState,
    playCounts,
    currentAudio,
    loadAudios,
    playAt,
    replayCurrent,
    togglePlayback,
    pausePlayback,
    shuffleAndPlay,
    seekTo,
    dispose,
  }
})

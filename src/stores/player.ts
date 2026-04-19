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
type NextTrackState = 'idle' | 'loading' | 'ready' | 'error'

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
  const playbackQueue = ref<string[]>([])
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
  const nextTrackState = ref<NextTrackState>('idle')

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
  
  // Event handlers for audio element
  let onAudioPlay: (() => void) | null = null
  let onAudioPause: (() => void) | null = null
  let onAudioEnded: (() => void) | null = null

  const currentAudio = computed(() => audios.value[currentIndex.value] ?? null)

  const nextAudio = computed(() => {
    const queue = getEffectiveQueue()
    if (queue.length < 2 || !currentAudio.value) {
      return null
    }

    const currentQueueIndex = queue.findIndex((trackId) => trackId === currentAudio.value?.id)
    if (currentQueueIndex < 0) {
      return null
    }

    const nextQueueIndex = (currentQueueIndex + 1) % queue.length
    const nextTrackId = queue[nextQueueIndex]
    return audios.value.find((track) => track.id === nextTrackId) ?? null
  })

  function getEffectiveQueue() {
    if (playbackQueue.value.length === 0) {
      return audios.value.map((track) => track.id)
    }

    return playbackQueue.value.filter((trackId) => audios.value.some((track) => track.id === trackId))
  }

  function resolveQueueTargetIndex(direction: 1 | -1) {
    const queue = getEffectiveQueue()
    if (queue.length === 0) {
      return -1
    }

    const currentId = currentAudio.value?.id
    const activeQueueIndex = currentId ? queue.findIndex((trackId) => trackId === currentId) : -1
    const targetQueueIndex =
      activeQueueIndex >= 0
        ? (activeQueueIndex + direction + queue.length) % queue.length
        : direction === 1
          ? 0
          : queue.length - 1

    const targetId = queue[targetQueueIndex]
    return audios.value.findIndex((track) => track.id === targetId)
  }

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

  function preloadNextTrack(baseIndex = currentIndex.value) {
    const queue = getEffectiveQueue()
    if (queue.length < 2) {
      return
    }

    const baseTrack = audios.value[baseIndex >= 0 ? baseIndex : 0]
    const baseQueueIndex = baseTrack ? queue.findIndex((trackId) => trackId === baseTrack.id) : -1
    const nextQueueIndex = baseQueueIndex >= 0 ? (baseQueueIndex + 1) % queue.length : 0
    const nextTrackId = queue[nextQueueIndex]
    const nextTrack = audios.value.find((track) => track.id === nextTrackId)
    
    if (!nextTrack) {
      return
    }
    
    nextTrackState.value = 'loading'
    audioPlayer.preload(nextTrack)
  }

  function bindPlayerEvents() {
    const audio = audioPlayer.getAudio()

    // Create event handlers and store them for later reuse
    onAudioPlay = () => {
      playing.value = true
      playerState.value = 'playing'
      error.value = ''
      duration.value = audioPlayer.getDuration()
      startProgressTimer()

      console.log('Started playing:', currentAudio.value)
      preloadNextTrack()
      writeSnapshot()
    }

    onAudioPause = () => {
      playing.value = false
      playerState.value = currentAudio.value ? 'paused' : 'idle'
      syncProgress()
      stopProgressTimer()
      writeSnapshot()
    }

    onAudioEnded = () => {
      stopProgressTimer()
      nextTrackState.value = 'idle'
      if (currentAudio.value) {
        incrementPlayCount(currentAudio.value.id)
      }
      const nextIndex = resolveQueueTargetIndex(1)
      if (nextIndex >= 0) {
        void playAt(nextIndex)
      }
    }

    // Attach event listeners
    audio.addEventListener('play', onAudioPlay)
    audio.addEventListener('pause', onAudioPause)
    audio.addEventListener('ended', onAudioEnded)
    audio.addEventListener('timeupdate', syncProgress)
    audio.addEventListener('seeked', syncProgress)

    audioPlayer.configure({
      onLoad: () => {
        duration.value = audioPlayer.getDuration()
      },
      onPreloadStart: () => {
        nextTrackState.value = 'loading'
      },
      onPreloadReady: () => {
        nextTrackState.value = 'ready'
      },
      onAudioSwapped: () => {
        rebindPlayerEvents()
      },
      onError: (message) => {
        error.value = message
        playing.value = false
        playerState.value = 'error'
        nextTrackState.value = 'idle'
        stopProgressTimer()
        writeSnapshot()
      },
    })
  }

  function rebindPlayerEvents() {
    const audio = audioPlayer.getAudio()
    
    // Detach handlers from old audio (if they were set)
    // We can't detach from old element as reference is lost, so just attach to new one
    
    if (onAudioPlay) audio.addEventListener('play', onAudioPlay)
    if (onAudioPause) audio.addEventListener('pause', onAudioPause)
    if (onAudioEnded) audio.addEventListener('ended', onAudioEnded)
    
    audio.addEventListener('timeupdate', syncProgress)
    audio.addEventListener('seeked', syncProgress)
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
      playbackQueue.value = tracks.map((track) => track.id)
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

  async function performPlayAt(
    index: number,
    options: { startAt?: number } | undefined,
  ) {
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

    await audioPlayer.load(track)
    audioPlayer.setMediaSessionMetadata(track)

    if (startAt > 0) {
      audioPlayer.seek(startAt)
    }
    
    audioPlayer.play()
    // Set playing state immediately after play() call
    playing.value = true
    playerState.value = 'playing'
  }

  async function playAt(index: number, options?: { startAt?: number }) {
    const track = audios.value[index]
    if (!track) {
      return
    }

    try {
      await performPlayAt(index, options)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Load failed'
      error.value = message
      playerState.value = 'error'
      writeSnapshot()
    }
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
    // Set playing state immediately after play() call
    playing.value = true
    playerState.value = 'playing'
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
    // Set playing state immediately after play() call
    playing.value = true
    playerState.value = 'playing'
  }

  function pausePlayback() {
    if (!currentAudio.value) {
      return
    }

    audioPlayer.pause()
  }

  function setPlaybackQueue(trackIds: string[]) {
    const availableIds = new Set(audios.value.map((track) => track.id))
    const nextQueue = Array.from(new Set(trackIds)).filter((trackId) => availableIds.has(trackId))
    playbackQueue.value = nextQueue.length > 0 ? nextQueue : audios.value.map((track) => track.id)
    writeSnapshot()
  }

  async function playNextInQueue() {
    const nextIndex = resolveQueueTargetIndex(1)
    if (nextIndex < 0) {
      return
    }

    await playAt(nextIndex)
  }

  async function playPreviousInQueue() {
    const previousIndex = resolveQueueTargetIndex(-1)
    if (previousIndex < 0) {
      return
    }

    await playAt(previousIndex)
  }

  async function randomTrack(trackIds: string[]): Promise<string> {
    const randomIndex = Math.floor(Math.random() * trackIds.length)
    return trackIds[randomIndex] as string
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
    nextAudio,
    nextTrackState,
    playbackQueue,
    loadAudios,
    playAt,
    playNextInQueue,
    playPreviousInQueue,
    replayCurrent,
    setPlaybackQueue,
    togglePlayback,
    pausePlayback,
    randomTrack,
    seekTo,
    dispose,
  }
})

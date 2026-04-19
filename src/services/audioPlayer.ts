import type { ArchiveAudio } from '@/services/audioApi'

interface AudioPlayerListeners {
  onPlay?: () => void
  onPause?: () => void
  onStop?: () => void
  onEnd?: () => void
  onLoad?: () => void
  onSeek?: () => void
  onError?: (message: string) => void
}

class AudioPlayer {
  private audio: HTMLAudioElement
  private listeners: AudioPlayerListeners = {}
  private currentTrackId = ''
  private preloadedTrackId = ''
  private mediaSessionActive = false

  constructor() {
    this.audio = new Audio()
    this.audio.crossOrigin = 'anonymous'
    this.setupMediaSession()
  }

  configure(listeners: AudioPlayerListeners) {
    this.listeners = listeners
  }

  async load(track: ArchiveAudio) {
    this.currentTrackId = track.id
    this.audio.src = track.url
    this.audio.currentTime = 0
    
    return new Promise<void>((resolve, reject) => {
      const onCanPlayThrough = () => {
        cleanup()
        this.listeners.onLoad?.()
        resolve()
      }

      const onError = () => {
        cleanup()
        const message = `Load error: ${this.audio.error?.message || 'Unknown error'}`
        this.listeners.onError?.(message)
        reject(new Error(message))
      }

      const cleanup = () => {
        this.audio.removeEventListener('canplaythrough', onCanPlayThrough)
        this.audio.removeEventListener('error', onError)
      }

      this.audio.addEventListener('canplaythrough', onCanPlayThrough, { once: true })
      this.audio.addEventListener('error', onError, { once: true })
      this.audio.load()
    })
  }

  preload(track: ArchiveAudio) {
    if (this.preloadedTrackId === track.id) {
      return
    }
    
    this.preloadedTrackId = track.id
    
    // Create a separate audio element for preloading
    const preloadAudio = new Audio()
    preloadAudio.crossOrigin = 'anonymous'
    preloadAudio.src = track.url
    preloadAudio.preload = 'auto'
    preloadAudio.load()
  }

  play() {
    this.updateMediaSession('play')
    this.audio.play().catch(() => {
      // Handle autoplay policy or other errors
    })
  }

  pause() {
    this.updateMediaSession('pause')
    this.audio.pause()
  }

  stop() {
    this.audio.pause()
    this.audio.currentTime = 0
  }

  hasTrack(trackId?: string) {
    if (!trackId) {
      return Boolean(this.audio.src)
    }
    return this.currentTrackId === trackId
  }

  seek(value: number) {
    this.audio.currentTime = value
  }

  getCurrentTime() {
    return this.audio.currentTime
  }

  getDuration() {
    return this.audio.duration
  }

  getAudio() {
    return this.audio
  }

  private setupMediaSession() {
    if (!navigator.mediaSession) {
      return
    }

    this.audio.addEventListener('play', () => {
      this.updateMediaSession('play')
    })

    this.audio.addEventListener('pause', () => {
      this.updateMediaSession('pause')
    })

    // Media session handlers
    navigator.mediaSession.setActionHandler('play', () => {
      this.play()
    })

    navigator.mediaSession.setActionHandler('pause', () => {
      this.pause()
    })

    navigator.mediaSession.setActionHandler('stop', () => {
      this.stop()
    })

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      this.listeners.onEnd?.()
    })

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      this.listeners.onEnd?.()
    })
  }

  private updateMediaSession(state: 'play' | 'pause') {
    if (!navigator.mediaSession || !this.mediaSessionActive) {
      return
    }

    navigator.mediaSession.playbackState = state === 'play' ? 'playing' : 'paused'
  }

  setMediaSessionMetadata(track: ArchiveAudio) {
    if (!navigator.mediaSession) {
      return
    }

    this.mediaSessionActive = true
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Unknown Track',
      artist: 'Archive',
      album: 'Playlist',
    })

    navigator.mediaSession.playbackState = this.audio.paused ? 'paused' : 'playing'
  }

  unload() {
    this.audio.pause()
    this.audio.src = ''
    this.currentTrackId = ''
    this.preloadedTrackId = ''
  }
}

export const audioPlayer = new AudioPlayer()

import type { ArchiveAudio } from '@/services/audioApi'

interface AudioPlayerListeners {
  onPlay?: () => void
  onPause?: () => void
  onStop?: () => void
  onEnd?: () => void
  onLoad?: () => void
  onSeek?: () => void
  onError?: (message: string) => void
  onPreloadStart?: (trackId: string) => void
  onPreloadReady?: (trackId: string) => void
  onAudioSwapped?: () => void
}

class AudioPlayer {
  private currentAudio: HTMLAudioElement
  private nextAudio: HTMLAudioElement
  private listeners: AudioPlayerListeners = {}
  private currentTrackId = ''
  private preloadedTrackId = ''
  private preloadedAudioReady = false
  private mediaSessionActive = false
  private audioPlayListener: (() => void) | null = null
  private audioPauseListener: (() => void) | null = null

  constructor() {
    // Create two audio elements for alternating playback
    this.currentAudio = this.createAudioElement()
    this.nextAudio = this.createAudioElement()
    this.setupMediaSession()
  }

  private createAudioElement(): HTMLAudioElement {
    const audio = document.createElement('audio')
    audio.crossOrigin = 'anonymous'
    return audio
  }

  configure(listeners: AudioPlayerListeners) {
    this.listeners = listeners
  }

  async load(track: ArchiveAudio) {
    this.currentTrackId = track.id

    // If track was preloaded in nextAudio and is ready, swap them
    if (this.preloadedAudioReady && this.preloadedTrackId === track.id) {
      this.detachMediaSessionListeners()
      
      // Pause and stop current audio
      this.currentAudio.pause()
      this.currentAudio.currentTime = 0
      
      // Swap audio elements
      const temp = this.currentAudio
      this.currentAudio = this.nextAudio
      this.nextAudio = temp
      
      // Reset next audio (will be used for next preload)
      this.nextAudio.src = ''
      this.nextAudio.currentTime = 0
      
      // Reattach media session listeners to new current audio
      this.reattachMediaSessionListeners()
      
      // Reset preload state
      this.preloadedAudioReady = false
      this.preloadedTrackId = ''
      
      this.listeners.onAudioSwapped?.()
      this.listeners.onLoad?.()
      return
    }

    // Normal load process - load into nextAudio first
    this.nextAudio.src = track.url
    this.nextAudio.currentTime = 0
    
    return new Promise<void>((resolve, reject) => {
      const onCanPlayThrough = () => {
        cleanup()
        
        // Swap audio elements
        this.detachMediaSessionListeners()
        this.currentAudio.pause()
        const temp = this.currentAudio
        this.currentAudio = this.nextAudio
        this.nextAudio = temp
        this.nextAudio.src = ''
        this.reattachMediaSessionListeners()
        
        this.listeners.onAudioSwapped?.()
        this.listeners.onLoad?.()
        resolve()
      }

      const onError = () => {
        cleanup()
        const message = `Load error: ${this.nextAudio.error?.message || 'Unknown error'}`
        this.listeners.onError?.(message)
        reject(new Error(message))
      }

      const cleanup = () => {
        this.nextAudio.removeEventListener('canplaythrough', onCanPlayThrough)
        this.nextAudio.removeEventListener('error', onError)
      }

      this.nextAudio.addEventListener('canplaythrough', onCanPlayThrough, { once: true })
      this.nextAudio.addEventListener('error', onError, { once: true })
      this.nextAudio.load()
    })
  }

  preload(track: ArchiveAudio) {
    if (this.preloadedTrackId === track.id) {
      return
    }
    
    this.preloadedTrackId = track.id
    this.preloadedAudioReady = false
    this.listeners.onPreloadStart?.(track.id)
    
    // Preload into nextAudio element
    this.nextAudio.src = track.url
    this.nextAudio.preload = 'auto'
    
    const onCanPlayThrough = () => {
      cleanup()
      this.preloadedAudioReady = true
      this.listeners.onPreloadReady?.(track.id)
    }

    const onError = () => {
      cleanup()
      console.warn(`Preload error for track ${track.id}`)
      this.preloadedAudioReady = false
    }

    const cleanup = () => {
      this.nextAudio.removeEventListener('canplaythrough', onCanPlayThrough)
      this.nextAudio.removeEventListener('error', onError)
    }

    this.nextAudio.addEventListener('canplaythrough', onCanPlayThrough, { once: true })
    this.nextAudio.addEventListener('error', onError, { once: true })
    this.nextAudio.load()
  }

  play() {
    this.updateMediaSession('play')
    this.currentAudio.play().catch(() => {
      // Handle autoplay policy or other errors
    })
  }

  pause() {
    this.updateMediaSession('pause')
    this.currentAudio.pause()
  }

  stop() {
    this.currentAudio.pause()
    this.currentAudio.currentTime = 0
  }

  hasTrack(trackId?: string) {
    if (!trackId) {
      return Boolean(this.currentAudio.src)
    }
    return this.currentTrackId === trackId
  }

  seek(value: number) {
    this.currentAudio.currentTime = value
  }

  getCurrentTime() {
    return this.currentAudio.currentTime
  }

  getDuration() {
    return this.currentAudio.duration
  }

  getAudio() {
    return this.currentAudio
  }

  private setupMediaSession() {
    if (!navigator.mediaSession) {
      return
    }

    this.audioPlayListener = () => {
      this.updateMediaSession('play')
    }

    this.audioPauseListener = () => {
      this.updateMediaSession('pause')
    }

    this.currentAudio.addEventListener('play', this.audioPlayListener)
    this.currentAudio.addEventListener('pause', this.audioPauseListener)

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

  private reattachMediaSessionListeners() {
    if (!this.audioPlayListener || !this.audioPauseListener) return
    
    this.currentAudio.addEventListener('play', this.audioPlayListener)
    this.currentAudio.addEventListener('pause', this.audioPauseListener)
  }

  private detachMediaSessionListeners() {
    if (!this.audioPlayListener || !this.audioPauseListener) return
    
    this.currentAudio.removeEventListener('play', this.audioPlayListener)
    this.currentAudio.removeEventListener('pause', this.audioPauseListener)
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

    navigator.mediaSession.playbackState = this.currentAudio.paused ? 'paused' : 'playing'
  }

  unload() {
    this.currentAudio.pause()
    this.currentAudio.src = ''
    this.currentTrackId = ''
    this.preloadedTrackId = ''
    this.preloadedAudioReady = false
    
    this.nextAudio.pause()
    this.nextAudio.src = ''
  }
}

export const audioPlayer = new AudioPlayer()

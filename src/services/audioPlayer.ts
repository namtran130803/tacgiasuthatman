import { Howl } from 'howler'

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
  private howl: Howl | null = null
  private preloadedHowl: Howl | null = null
  private listeners: AudioPlayerListeners = {}
  private currentTrackId = ''
  private preloadedTrackId = ''

  configure(listeners: AudioPlayerListeners) {
    this.listeners = listeners
  }

  async load(track: ArchiveAudio, options?: { force?: boolean }) {
    if (this.currentTrackId === track.id && this.howl && !options?.force) {
      return
    }

    this.unloadCurrent()

    this.currentTrackId = track.id
    if (this.preloadedTrackId === track.id && this.preloadedHowl) {
      this.howl = this.preloadedHowl
      this.preloadedHowl = null
      this.preloadedTrackId = ''
      this.attachListeners(this.howl)
      return
    }

    this.howl = this.createHowl(track, true)
  }

  preload(track: ArchiveAudio) {
    if (this.currentTrackId === track.id) {
      return
    }

    if (this.preloadedTrackId === track.id && this.preloadedHowl) {
      return
    }

    this.unloadPreloaded()
    this.preloadedTrackId = track.id
    this.preloadedHowl = this.createHowl(track, false)
  }

  play() {
    this.howl?.play()
  }

  pause() {
    this.howl?.pause()
  }

  hasTrack(trackId?: string) {
    if (!trackId) {
      return Boolean(this.howl)
    }

    return Boolean(this.howl) && this.currentTrackId === trackId
  }

  stop() {
    this.howl?.stop()
  }

  private createHowl(track: ArchiveAudio, attachEvents: boolean) {
    const howl = new Howl({
      src: [track.url],
      html5: true,
      preload: true,
      format: ['mp3'],
    })

    if (attachEvents) {
      this.attachListeners(howl)
    }

    howl.on('loaderror', (_soundId: number, error: unknown) => {
      this.listeners.onError?.(`Load error: ${String(error)}`)
    })
    howl.on('playerror', (_soundId: number, error: unknown) => {
      this.listeners.onError?.(`Playback error: ${String(error)}`)
    })

    return howl
  }

  private attachListeners(howl: Howl) {
    howl.off('play')
    howl.off('pause')
    howl.off('stop')
    howl.off('end')
    howl.off('load')
    howl.off('seek')

    howl.on('play', () => this.listeners.onPlay?.())
    howl.on('pause', () => this.listeners.onPause?.())
    howl.on('stop', () => this.listeners.onStop?.())
    howl.on('end', () => this.listeners.onEnd?.())
    howl.on('load', () => this.listeners.onLoad?.())
    howl.on('seek', () => this.listeners.onSeek?.())
  }

  private unloadCurrent() {
    this.howl?.unload()
    this.howl = null
    this.currentTrackId = ''
  }

  private unloadPreloaded() {
    this.preloadedHowl?.unload()
    this.preloadedHowl = null
    this.preloadedTrackId = ''
  }

  unload() {
    this.unloadCurrent()
    this.unloadPreloaded()
  }

  seek(value: number) {
    this.howl?.seek(value)
    this.listeners.onSeek?.()
  }

  getCurrentTime() {
    const value = this.howl?.seek()
    return typeof value === 'number' ? value : 0
  }

  getDuration() {
    return this.howl?.duration() ?? 0
  }
}

export const audioPlayer = new AudioPlayer()

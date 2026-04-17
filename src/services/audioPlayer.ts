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
  private listeners: AudioPlayerListeners = {}
  private currentTrackId = ''

  configure(listeners: AudioPlayerListeners) {
    this.listeners = listeners
  }

  async load(track: ArchiveAudio, options?: { force?: boolean }) {
    if (this.currentTrackId === track.id && this.howl && !options?.force) {
      return
    }

    this.unloadCurrent()

    this.currentTrackId = track.id
    this.howl = this.createHowl(track, true)
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

  unload() {
    this.unloadCurrent()
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

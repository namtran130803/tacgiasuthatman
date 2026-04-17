import type { ArchiveAudio } from '@/services/audioApi'

const LAST_IDENTIFIER_KEY = 'archive-player:last-identifier'
const PLAY_COUNTS_KEY = 'archive-player:play-counts'
const PLAYER_SNAPSHOT_KEY = 'archive-player:snapshot'

export interface PlayerSnapshot {
  audios: ArchiveAudio[]
  currentIndex: number
  currentTime: number
  duration: number
  playing: boolean
  shuffle: boolean
  identifier: string
  playCounts: Record<string, number>
}

export function readPlayCounts() {
  const raw = localStorage.getItem(PLAY_COUNTS_KEY)
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, number>
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

export function writePlayCounts(playCounts: Record<string, number>) {
  localStorage.setItem(PLAY_COUNTS_KEY, JSON.stringify(playCounts))
}

export function readPlayerSnapshot() {
  const raw = localStorage.getItem(PLAYER_SNAPSHOT_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PlayerSnapshot>
    if (!parsed || !Array.isArray(parsed.audios)) {
      return null
    }

    return {
      audios: parsed.audios,
      currentIndex: Number.isFinite(parsed.currentIndex) ? Number(parsed.currentIndex) : -1,
      currentTime: Number.isFinite(parsed.currentTime) ? Number(parsed.currentTime) : 0,
      duration: Number.isFinite(parsed.duration) ? Number(parsed.duration) : 0,
      playing: Boolean(parsed.playing),
      shuffle: Boolean(parsed.shuffle),
      identifier: typeof parsed.identifier === 'string' ? parsed.identifier : '',
      playCounts:
        parsed.playCounts && typeof parsed.playCounts === 'object' ? parsed.playCounts : {},
    } satisfies PlayerSnapshot
  } catch {
    return null
  }
}

export function writePlayerSnapshot(snapshot: PlayerSnapshot) {
  localStorage.setItem(PLAYER_SNAPSHOT_KEY, JSON.stringify(snapshot))
}

export function readLastIdentifier() {
  return localStorage.getItem(LAST_IDENTIFIER_KEY) ?? ''
}

export function writeLastIdentifier(identifier: string) {
  localStorage.setItem(LAST_IDENTIFIER_KEY, identifier)
}

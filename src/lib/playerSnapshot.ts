import type { ArchiveAudio } from '@/services/audioApi'

const LAST_IDENTIFIER_KEY = 'archive-player:last-identifier'
const PLAY_COUNTS_KEY = 'archive-player:play-counts'
const PLAYER_SNAPSHOT_KEY = 'archive-player:snapshot'
const HOME_VIEW_STATE_KEY = 'archive-player:home-view-state'

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

export interface HomeViewState {
  query: string
  selectedSort: string
  sortMenuOpen: boolean
  timerValue: string
  timerDeadline: number | null
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

export function readHomeViewState() {
  const raw = localStorage.getItem(HOME_VIEW_STATE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<HomeViewState>
    return {
      query: typeof parsed.query === 'string' ? parsed.query : '',
      selectedSort: typeof parsed.selectedSort === 'string' ? parsed.selectedSort : 'newest',
      sortMenuOpen: Boolean(parsed.sortMenuOpen),
      timerValue: typeof parsed.timerValue === 'string' ? parsed.timerValue : '06:00',
      timerDeadline: Number.isFinite(parsed.timerDeadline) ? Number(parsed.timerDeadline) : null,
    } satisfies HomeViewState
  } catch {
    return null
  }
}

export function writeHomeViewState(state: HomeViewState) {
  localStorage.setItem(HOME_VIEW_STATE_KEY, JSON.stringify(state))
}

export function readLastIdentifier() {
  return localStorage.getItem(LAST_IDENTIFIER_KEY) ?? ''
}

export function writeLastIdentifier(identifier: string) {
  localStorage.setItem(LAST_IDENTIFIER_KEY, identifier)
}

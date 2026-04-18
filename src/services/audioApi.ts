export interface ArchiveAudio {
  id: string
  identifier: string
  title: string
  artist: string
  album: string
  filename: string
  url: string
  artworkUrl: string
  mtime: number
  durationHint: number
  viewCount: number
  likeCount: number
  repostCount: number
  commentCount: number
  saveCount: number
}

interface PlaylistEntryThumbnail {
  url?: string
  preference?: number
}

interface PlaylistEntry {
  id?: string
  title?: string
  description?: string
  timestamp?: number
  duration?: number
  view_count?: number
  like_count?: number
  repost_count?: number
  comment_count?: number
  save_count?: number
  uploader?: string
  channel?: string
  track?: string
  album?: string
  artists?: string[]
  thumbnails?: PlaylistEntryThumbnail[]
}

interface PlaylistResponse {
  id?: string
  title?: string
  entries?: PlaylistEntry[]
}

interface CachedLibrary {
  audios: ArchiveAudio[]
  fetchedAt: number
}

const CACHE_PREFIX = 'archive-player:library:v3'
const CACHE_TTL = 1000 * 60 * 30
const DEFAULT_PLAYLIST_URL = 'https://archive.org/download/namtran-tacgiasuthatman/data.json'
const DEFAULT_DOWNLOAD_BASE_URL = 'https://archive.org/download/namtran-tacgiasuthatman'

function removeExtension(value: string) {
  return value.replace(/\.[^/.]+$/, '')
}

function stripHashtags(value: string) {
  return value.replace(/\s+#.+$/u, '').trim()
}

function normalizeText(value?: string) {
  return (value || '').normalize('NFKC').trim()
}

function getCacheKey(sourceUrl: string) {
  return `${CACHE_PREFIX}:${sourceUrl}`
}

function readCache(sourceUrl: string) {
  const raw = localStorage.getItem(getCacheKey(sourceUrl))
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as CachedLibrary
    if (Date.now() - parsed.fetchedAt > CACHE_TTL) {
      localStorage.removeItem(getCacheKey(sourceUrl))
      return null
    }

    return parsed.audios
  } catch {
    localStorage.removeItem(getCacheKey(sourceUrl))
    return null
  }
}

function writeCache(sourceUrl: string, audios: ArchiveAudio[]) {
  const payload: CachedLibrary = {
    audios,
    fetchedAt: Date.now(),
  }

  localStorage.setItem(getCacheKey(sourceUrl), JSON.stringify(payload))
}

function toSafeNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function buildMp3Url(downloadBaseUrl: string, entryId: string) {
  return `${downloadBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(entryId)}.mp3`
}

function pickArtworkUrl(entry: PlaylistEntry) {
  if (!Array.isArray(entry.thumbnails) || entry.thumbnails.length === 0) {
    return ''
  }

  const sorted = [...entry.thumbnails].sort(
    (left, right) => (right.preference ?? Number.NEGATIVE_INFINITY) - (left.preference ?? Number.NEGATIVE_INFINITY),
  )

  return sorted[0]?.url || ''
}

function mapPlaylistEntry(
  playlist: PlaylistResponse,
  entry: PlaylistEntry,
  downloadBaseUrl: string,
): ArchiveAudio | null {
  const entryId = normalizeText(entry.id)
  if (!entryId) {
    return null
  }

  const title = normalizeText(entry.title || entry.description || entry.track || entryId)
  const filename = `${entryId}.mp3`
  const artist = normalizeText(entry.artists?.[0] || entry.channel || entry.uploader || playlist.title || 'Unknown')
  const album = normalizeText(entry.album || playlist.title || 'Archive playlist')

  return {
    id: entryId,
    identifier: playlist.id || 'archive-playlist',
    title: stripHashtags(removeExtension(title)),
    artist,
    album,
    filename,
    url: buildMp3Url(downloadBaseUrl, entryId),
    artworkUrl: pickArtworkUrl(entry),
    mtime: toSafeNumber(entry.timestamp),
    durationHint: toSafeNumber(entry.duration),
    viewCount: toSafeNumber(entry.view_count),
    likeCount: toSafeNumber(entry.like_count),
    repostCount: toSafeNumber(entry.repost_count),
    commentCount: toSafeNumber(entry.comment_count),
    saveCount: toSafeNumber(entry.save_count),
  }
}

export async function fetchArchiveAudios(
  sourceUrl = DEFAULT_PLAYLIST_URL,
  options?: { force?: boolean; downloadBaseUrl?: string },
) {
  const normalizedSourceUrl = sourceUrl.trim() || DEFAULT_PLAYLIST_URL
  const normalizedDownloadBaseUrl = (options?.downloadBaseUrl || DEFAULT_DOWNLOAD_BASE_URL).trim()

  if (!options?.force) {
    const cached = readCache(normalizedSourceUrl)
    if (cached) {
      return cached
    }
  }

  const response = await fetch(normalizedSourceUrl)
  if (!response.ok) {
    throw new Error(`Playlist request failed with status ${response.status}.`)
  }

  const data = (await response.json()) as PlaylistResponse
  if (!Array.isArray(data.entries)) {
    throw new Error('Playlist response is missing entries.')
  }

  const audios = data.entries
    .map((entry) => mapPlaylistEntry(data, entry, normalizedDownloadBaseUrl))
    .filter((entry): entry is ArchiveAudio => Boolean(entry))
    .sort((left, right) => right.mtime - left.mtime)

  writeCache(normalizedSourceUrl, audios)
  return audios
}

export const archivePlaylistConfig = {
  sourceUrl: DEFAULT_PLAYLIST_URL,
  downloadBaseUrl: DEFAULT_DOWNLOAD_BASE_URL,
}

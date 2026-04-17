export interface ArchiveFile {
  name: string
  format?: string
  mtime?: string
  title?: string
  creator?: string
  length?: string
}

interface ArchiveMetadataResponse {
  server: string
  dir: string
  files?: ArchiveFile[]
  metadata?: {
    title?: string
    creator?: string
  }
}

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
}

interface CachedLibrary {
  audios: ArchiveAudio[]
  fetchedAt: number
}

const BASE_URL = 'https://archive.org/metadata'
const CACHE_PREFIX = 'archive-player:library:v2'
const CACHE_TTL = 1000 * 60 * 30

function removeExtension(value: string) {
  return value.replace(/\.[^/.]+$/, '')
}

function cleanTitle(value: string) {
  return removeExtension(value).normalize('NFKC').replace(/#.*$/, '').trim()
}

function toTimestamp(value?: string) {
  if (!value) {
    return 0
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseDuration(value?: string) {
  if (!value) {
    return 0
  }

  const normalized = value.trim()
  if (!normalized) {
    return 0
  }

  if (/^\d+(\.\d+)?$/.test(normalized)) {
    const seconds = Number(normalized)
    return Number.isFinite(seconds) ? seconds : 0
  }

  const segments = normalized.split(':').map((part) => Number(part))
  if (segments.some((part) => !Number.isFinite(part))) {
    return 0
  }

  if (segments.length === 3) {
    const [hours = 0, minutes = 0, seconds = 0] = segments
    return hours * 3600 + minutes * 60 + seconds
  }

  if (segments.length === 2) {
    const [minutes = 0, seconds = 0] = segments
    return minutes * 60 + seconds
  }

  return 0
}

function buildTrackUrl(server: string, dir: string, filename: string) {
  return `https://${server}${dir}/${encodeURIComponent(filename)}`
}

function buildArtworkUrl(identifier: string) {
  return `https://archive.org/services/img/${encodeURIComponent(identifier)}`
}

function getCacheKey(identifier: string) {
  return `${CACHE_PREFIX}:${identifier}`
}

function readCache(identifier: string) {
  const raw = localStorage.getItem(getCacheKey(identifier))
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as CachedLibrary
    if (Date.now() - parsed.fetchedAt > CACHE_TTL) {
      localStorage.removeItem(getCacheKey(identifier))
      return null
    }

    return parsed.audios
  } catch {
    localStorage.removeItem(getCacheKey(identifier))
    return null
  }
}

function writeCache(identifier: string, audios: ArchiveAudio[]) {
  const payload: CachedLibrary = {
    audios,
    fetchedAt: Date.now(),
  }

  localStorage.setItem(getCacheKey(identifier), JSON.stringify(payload))
}

function mapArchiveAudio(
  identifier: string,
  response: ArchiveMetadataResponse,
  file: ArchiveFile,
): ArchiveAudio {
  const title = cleanTitle(file.title || file.name)
  const artist = response.metadata?.creator || file.creator || identifier
  const album = response.metadata?.title || identifier

  return {
    id: `${identifier}:${file.name}`,
    identifier,
    title,
    artist,
    album,
    filename: file.name,
    url: buildTrackUrl(response.server, response.dir, file.name),
    artworkUrl: buildArtworkUrl(identifier),
    mtime: toTimestamp(file.mtime),
    durationHint: parseDuration(file.length),
  }
}

export async function fetchArchiveAudios(identifier: string, options?: { force?: boolean }) {
  if (!options?.force) {
    const cached = readCache(identifier)
    if (cached) {
      return cached
    }
  }

  const response = await fetch(`${BASE_URL}/${encodeURIComponent(identifier)}`)
  if (!response.ok) {
    throw new Error(`Archive request failed with status ${response.status}.`)
  }

  const data = (await response.json()) as ArchiveMetadataResponse
  if (!data.server || !data.dir || !Array.isArray(data.files)) {
    throw new Error('Archive response is missing required metadata fields.')
  }

  const audios = data.files
    .filter((file) => file.format === 'VBR MP3')
    .map((file) => mapArchiveAudio(identifier, data, file))
    .sort((left, right) => right.mtime - left.mtime)

  writeCache(identifier, audios)
  return audios
}

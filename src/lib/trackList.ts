import type { ArchiveAudio } from '@/services/audioApi'

export function normalizeQuery(value: string) {
  return value.trim().toLocaleLowerCase('vi-VN')
}

export function filterTracksByQuery(tracks: ArchiveAudio[], query: string) {
  const keyword = normalizeQuery(query)
  if (!keyword) {
    return tracks
  }

  return tracks.filter((track) => track.title.toLocaleLowerCase('vi-VN').includes(keyword))
}

export function sortTracksByPlayCount(
  tracks: ArchiveAudio[],
  playCounts: Record<string, number>,
  direction: 'desc' | 'asc',
) {
  return [...tracks].sort((left, right) => {
    const leftPlays = playCounts[left.id] ?? 0
    const rightPlays = playCounts[right.id] ?? 0

    if (leftPlays === rightPlays) {
      return left.title.localeCompare(right.title, 'vi')
    }

    return direction === 'desc' ? rightPlays - leftPlays : leftPlays - rightPlays
  })
}

export function moveTracksToFront(tracks: ArchiveAudio[], trackIds: string[]) {
  if (tracks.length === 0 || trackIds.length === 0) {
    return tracks
  }

  const trackMap = new Map(tracks.map((track) => [track.id, track]))
  const uniqueIds = Array.from(new Set(trackIds)).filter((id) => trackMap.has(id))
  if (uniqueIds.length === 0) {
    return tracks
  }

  const subset = uniqueIds
    .map((id) => trackMap.get(id))
    .filter((track): track is ArchiveAudio => Boolean(track))

  const subsetIdSet = new Set(uniqueIds)
  const remainingTracks = tracks.filter((track) => !subsetIdSet.has(track.id))
  return [...subset, ...remainingTracks]
}

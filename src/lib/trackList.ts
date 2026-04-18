import type { ArchiveAudio } from '@/services/audioApi'

export type TrackSortOption =
  | 'newest'
  | 'oldest'
  | 'view_desc'
  | 'view_asc'
  | 'play_desc'
  | 'play_asc'
  | 'like_desc'
  | 'like_asc'
  | 'repost_desc'
  | 'repost_asc'
  | 'comment_desc'
  | 'comment_asc'
  | 'save_desc'
  | 'save_asc'

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

function compareWithTieBreak(
  left: ArchiveAudio,
  right: ArchiveAudio,
  leftValue: number,
  rightValue: number,
  direction: 'desc' | 'asc',
) {
  if (leftValue !== rightValue) {
    return direction === 'desc' ? rightValue - leftValue : leftValue - rightValue
  }

  if (left.mtime !== right.mtime) {
    return right.mtime - left.mtime
  }

  return left.title.localeCompare(right.title, 'vi')
}

export function sortTracks(
  tracks: ArchiveAudio[],
  playCounts: Record<string, number>,
  sortOption: TrackSortOption,
) {
  return [...tracks].sort((left, right) => {
    switch (sortOption) {
      case 'oldest':
        return left.mtime - right.mtime || left.title.localeCompare(right.title, 'vi')
      case 'view_desc':
        return compareWithTieBreak(left, right, left.viewCount, right.viewCount, 'desc')
      case 'view_asc':
        return compareWithTieBreak(left, right, left.viewCount, right.viewCount, 'asc')
      case 'play_desc':
        return compareWithTieBreak(
          left,
          right,
          playCounts[left.id] ?? 0,
          playCounts[right.id] ?? 0,
          'desc',
        )
      case 'play_asc':
        return compareWithTieBreak(
          left,
          right,
          playCounts[left.id] ?? 0,
          playCounts[right.id] ?? 0,
          'asc',
        )
      case 'like_desc':
        return compareWithTieBreak(left, right, left.likeCount, right.likeCount, 'desc')
      case 'like_asc':
        return compareWithTieBreak(left, right, left.likeCount, right.likeCount, 'asc')
      case 'repost_desc':
        return compareWithTieBreak(left, right, left.repostCount, right.repostCount, 'desc')
      case 'repost_asc':
        return compareWithTieBreak(left, right, left.repostCount, right.repostCount, 'asc')
      case 'comment_desc':
        return compareWithTieBreak(left, right, left.commentCount, right.commentCount, 'desc')
      case 'comment_asc':
        return compareWithTieBreak(left, right, left.commentCount, right.commentCount, 'asc')
      case 'save_desc':
        return compareWithTieBreak(left, right, left.saveCount, right.saveCount, 'desc')
      case 'save_asc':
        return compareWithTieBreak(left, right, left.saveCount, right.saveCount, 'asc')
      case 'newest':
      default:
        return right.mtime - left.mtime || left.title.localeCompare(right.title, 'vi')
    }
  })
}

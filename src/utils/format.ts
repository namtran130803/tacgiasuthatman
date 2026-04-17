export function formatDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0:00'
  }

  const totalSeconds = Math.floor(value)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function formatDurationHint(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '--:--'
  }

  return formatDuration(value)
}

export function formatUpdatedAt(timestamp: number) {
  if (!timestamp) {
    return 'Unknown date'
  }

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(timestamp * 1000))
}

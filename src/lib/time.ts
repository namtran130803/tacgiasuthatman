export function formatLocalClock(date = new Date()) {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function formatSelectedTime(value: string, fallback = '') {
  const [rawHours = '0', rawMinutes = '00'] = value.split(':')
  const hours = Number(rawHours)
  const minutes = Number(rawMinutes)

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return fallback
  }

  const period = hours >= 12 ? 'CH' : 'SA'
  const normalizedHours = hours % 12 || 12
  return `${normalizedHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`
}

export function createDeadlineFromTime(value: string, now = new Date()) {
  const [rawHours = '0', rawMinutes = '0'] = value.split(':')
  const hours = Number(rawHours)
  const minutes = Number(rawMinutes)

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null
  }

  const deadline = new Date(now)
  deadline.setHours(hours, minutes, 0, 0)

  if (deadline.getTime() <= now.getTime()) {
    deadline.setDate(deadline.getDate() + 1)
  }

  return deadline
}

export function formatCountdown(ms: number) {
  const remainingMs = Math.max(0, ms)
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, '0')).join(':')
}

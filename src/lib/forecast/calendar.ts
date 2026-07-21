interface LocalParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function lastSundayOfMonth(year: number, month: number) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0))
  return lastDay.getUTCDate() - lastDay.getUTCDay()
}

function londonOffsetMilliseconds(instant: Date) {
  const year = instant.getUTCFullYear()
  const summerStarts = Date.UTC(year, 2, lastSundayOfMonth(year, 2), 1)
  const summerEnds = Date.UTC(year, 9, lastSundayOfMonth(year, 9), 1)
  return instant.getTime() >= summerStarts && instant.getTime() < summerEnds
    ? 3_600_000
    : 0
}

function londonParts(instant: Date): LocalParts {
  const local = new Date(instant.getTime() + londonOffsetMilliseconds(instant))
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
  }
}

function offsetMilliseconds(instant: Date) {
  return londonOffsetMilliseconds(instant)
}

function localToInstant(parts: LocalParts) {
  const localEpoch = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  let instant = new Date(localEpoch)
  for (let attempt = 0; attempt < 3; attempt++) {
    instant = new Date(localEpoch - offsetMilliseconds(instant))
  }
  return instant
}

function localDate(parts: LocalParts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

function isBusinessDay(parts: LocalParts) {
  const day = localDate(parts).getUTCDay()
  return day >= 1 && day <= 5
}

function nextBusinessDay(parts: LocalParts): LocalParts {
  const date = localDate(parts)
  do date.setUTCDate(date.getUTCDate() + 1)
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: 9,
    minute: 0,
    second: 0,
  }
}

export function normalizeToBusinessTime(value: string | number | Date) {
  const instant = new Date(value)
  if (!Number.isFinite(instant.getTime()))
    throw new RangeError('Invalid forecast timestamp')
  let parts = londonParts(instant)
  if (!isBusinessDay(parts)) {
    const date = localDate(parts)
    while (date.getUTCDay() === 0 || date.getUTCDay() === 6)
      date.setUTCDate(date.getUTCDate() + 1)
    parts = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: 9,
      minute: 0,
      second: 0,
    }
  } else if (parts.hour < 9) {
    parts = { ...parts, hour: 9, minute: 0, second: 0 }
  } else if (parts.hour >= 17) {
    parts = nextBusinessDay(parts)
  }
  return localToInstant(parts)
}

export function addLondonBusinessHours(
  value: string | number | Date,
  hours: number,
) {
  if (!Number.isFinite(hours) || hours < 0)
    throw new RangeError('Business hours must be finite and non-negative')
  let instant = normalizeToBusinessTime(value)
  let remainingMinutes = hours * 60
  while (remainingMinutes > 1e-9) {
    const parts = londonParts(instant)
    const minuteOfDay = parts.hour * 60 + parts.minute + parts.second / 60
    const available = 17 * 60 - minuteOfDay
    if (remainingMinutes <= available + 1e-9) {
      const localEpoch = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      )
      const completed = new Date(localEpoch + remainingMinutes * 60_000)
      return localToInstant({
        year: completed.getUTCFullYear(),
        month: completed.getUTCMonth() + 1,
        day: completed.getUTCDate(),
        hour: completed.getUTCHours(),
        minute: completed.getUTCMinutes(),
        second: completed.getUTCSeconds(),
      })
    }
    remainingMinutes -= available
    instant = localToInstant(nextBusinessDay(parts))
  }
  return instant
}

export function londonDate(value: string | number | Date) {
  const parts = londonParts(new Date(value))
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function londonTargetInstant(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new RangeError('Target date must use YYYY-MM-DD')
  return localToInstant({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: 17,
    minute: 0,
    second: 0,
  })
}

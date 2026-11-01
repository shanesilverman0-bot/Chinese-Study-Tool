// Local-date helpers. All YYYY-MM-DD strings are in studySettings.timeZone.

export function localDate(date = new Date(), tz = 'Asia/Taipei') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function toUtcMs(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUtcMs(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(ymd, n) {
  return fromUtcMs(toUtcMs(ymd) + n * 86400000)
}

// Monday of the week containing ymd.
export function weekStartMonday(ymd) {
  const dow = new Date(toUtcMs(ymd)).getUTCDay() // 0 = Sunday
  return addDays(ymd, -((dow + 6) % 7))
}

// Whole days from a to b (b - a).
export function daysBetween(a, b) {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86400000)
}

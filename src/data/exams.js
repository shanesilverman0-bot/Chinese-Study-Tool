// TOCFL (SC-TOP) Taiwan exam dates, DESIGN §5.5. Copied from the official 2026/2027 schedules.
// date = first test day; registration = [from, to]; scoresOn = score release date.

const E = (id, date, days, kind, bands, registration, scoresOn) =>
  ({ id, date, days, kind, bands, registration, scoresOn })

export const EXAM_DATES = [
  E('lr-2026-11', '2026-11-14', 2, 'LR', 'A–C', ['2026-10-05', '2026-10-20'], '2026-12-04'),
  E('lr-2026-12', '2026-12-12', 2, 'LR', 'A–C', ['2026-11-02', '2026-11-17'], '2027-01-04'),
  E('lr-2027-01', '2027-01-09', 2, 'LR', 'A–C', ['2026-11-30', '2026-12-11'], '2027-01-29'),
  E('lr-2027-03', '2027-03-06', 2, 'LR', 'A–C', ['2027-01-18', '2027-01-29'], '2027-03-26'),
  E('lr-2027-05', '2027-05-15', 2, 'LR', 'A–C', ['2027-04-05', '2027-04-16'], '2027-06-04'),
  E('lr-2027-06', '2027-06-26', 2, 'LR', 'A–C', ['2027-05-17', '2027-05-28'], '2027-07-16'),
  E('lr-2027-08', '2027-08-07', 2, 'LR', 'A–C', ['2027-06-28', '2027-07-09'], '2027-08-27'),
  E('lr-2027-11', '2027-11-06', 2, 'LR', 'A–C', ['2027-09-27', '2027-10-08'], '2027-11-26'),
  E('lr-2027-12', '2027-12-18', 2, 'LR', 'A–C', ['2027-11-08', '2027-11-19'], '2028-01-11'),
  // Not goal defaults.
  E('sw-2026-11', '2026-11-15', 1, 'speaking', 'B', null, null),
  E('sw-2027-03', '2027-03-07', 1, 'speaking', 'B', null, null),
  E('sw-2027-05', '2027-05-16', 1, 'speaking', 'C', null, null),
  E('sw-2027-11', '2027-11-07', 1, 'speaking', 'B', null, null),
  E('pilot-2027-04', '2027-04-17', 1, 'pilot', 'A–C', null, null),
  E('pilot-2027-10', '2027-10-16', 1, 'pilot', 'A–C', null, null),
]

export const examById = (id) => EXAM_DATES.find((e) => e.id === id) ?? null

// Listening & Reading (or `kind`) sessions whose first day is today or later, soonest first.
export function upcomingExams(today, kind = 'LR') {
  return EXAM_DATES.filter((e) => e.kind === kind && e.date >= today).sort((a, b) => a.date.localeCompare(b.date))
}

export function goalEndDate(goal) {
  const ex = goal?.examId ? examById(goal.examId) : null
  return ex ? ex.date : goal?.endDate
}

const md = (ymd) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`

export function examLabel(e) {
  return e.registration ? `${e.date} · 報名 ${md(e.registration[0])}–${md(e.registration[1])}` : e.date
}

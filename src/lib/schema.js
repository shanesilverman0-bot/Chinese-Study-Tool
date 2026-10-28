// progress.json schema v3 constants and empty shapes (DESIGN §5). Pure: no
// React, no Vite, no browser APIs, so Node scripts can import it.

export const CURRENT_SCHEMA = 3

export const THRESHOLD_EDGES = [1, 2, 3, 4, 5, 7, 10, 14, 21, 30, 45, 60, 90, 180]

const EPOCH = '1970-01-01T00:00:00.000Z'

export const DEFAULT_STUDY_SETTINGS = {
  updatedAt: EPOCH,
  knownThreshold: 3,
  knownRequiresReviewState: true,
  baseline: {
    enabled: true,
    solidThrough: { book: 3, chapter: 9 },
    studiedThrough: { book: 4, chapter: 4 },
  },
  courseHistory: {
    start: { date: '2025-09-01', book: 1, chapter: 3 },
    end: { date: '2026-08-19', book: 4, chapter: 4 },
  },
  contextRule: {
    minCorrect: 2,
    minDistinctExercises: 2,
    requireDistinctTypes: false,
    minRecentAccuracy: 0.75,
    recentWindow: 10,
    sentencesCount: true,
    approved: true,
  },
  understanding: {
    max: 10,
    points: { cloze: 1, fill: 1, usage: 1, listening: 1, sentence: 1, sentenceNaturalBonus: 0 },
  },
  timeZone: 'Asia/Taipei',
  selectedGoalId: null,
  attemptLogMax: 3000,
  logKeepDays: 90,
}

export const DEFAULT_GOALS = [
  {
    id: 'goal-exam', label: 'TOCFL exam', metric: 'known',
    startDate: '2026-11-01', startValue: null,
    endDate: '2027-05-15', examId: 'lr-2027-05',
    target: 5000, enabled: true, updatedAt: EPOCH,
  },
  {
    id: 'goal-jun-2027', label: 'June 2027', metric: 'known',
    startDate: '2027-05-17', startValue: null,
    endDate: '2027-06-30', examId: null,
    target: 5500, enabled: false, updatedAt: EPOCH,
  },
  {
    id: 'goal-dec-2027', label: 'Jul–Dec 2027', metric: 'known',
    startDate: '2027-07-01', startValue: null,
    endDate: '2027-12-31', examId: null,
    target: 6500, enabled: false, updatedAt: EPOCH,
  },
]

// Every v3 top-level collection other than `cards` and `log`, freshly allocated
// (never shared between calls).
export function emptyCollections() {
  return {
    logArchive: { watermark: null, months: [] },
    migrations: [],
    studySettings: structuredClone(DEFAULT_STUDY_SETTINGS),
    goals: structuredClone(DEFAULT_GOALS),
    snapshots: [],
    lists: {},
    customItems: {},
    itemNotes: {},
    exerciseFiles: {},
    exerciseFlags: {},
    attempts: [],
    contextArchive: { watermark: null, items: {} },
    testRuns: [],
    sessions: [],
    manualEntries: [],
    sentences: [],
    grammar: {},
  }
}

export function freshV3(cards = {}) {
  return {
    schemaVersion: CURRENT_SCHEMA,
    updatedAt: new Date().toISOString(),
    cards,
    log: [],
    ...emptyCollections(),
  }
}

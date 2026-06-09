// Spaced-repetition scheduling via ts-fsrs (FSRS algorithm).
// Wraps the library so the rest of the app deals in plain card-state objects
// that are easy to serialize into progress.json.
import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs'

const params = generatorParameters({ enable_fuzz: true, maximum_interval: 36500 })
const scheduler = fsrs(params)

// Map our UI buttons to FSRS ratings.
export const RATING = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
}

// Stable per-word identity. The same hanzi can be several distinct words with
// different readings (e.g. 行 xíng vs háng, 長 cháng vs zhǎng), so a card is
// keyed by hanzi + pinyin, not hanzi alone. Everything that indexes
// progress.cards goes through this helper so the key never drifts between
// modules. The `|` separator never appears in a hanzi or a pinyin string.
export function cardKey(word) {
  if (!word) return ''
  if (typeof word === 'string') return word // tolerate a bare key passed straight through
  return `${word.hanzi}|${word.pinyin ?? ''}`
}

// Create a fresh FSRS card record for a vocab word ({ hanzi, pinyin }).
export function newCardState(word) {
  const card = createEmptyCard(new Date())
  return serializeCard(word, card)
}

// FSRS card objects use Date instances; we store ISO strings in JSON.
// We persist hanzi + pinyin so each card is self-describing: its key can be
// rebuilt from the card alone, without consulting the vocab list.
function serializeCard(word, card) {
  return {
    hanzi: word.hanzi,
    pinyin: word.pinyin ?? '',
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : undefined,
  }
}

function deserializeCard(stored) {
  return {
    due: new Date(stored.due),
    stability: stored.stability,
    difficulty: stored.difficulty,
    elapsed_days: stored.elapsed_days,
    scheduled_days: stored.scheduled_days,
    reps: stored.reps,
    lapses: stored.lapses,
    state: stored.state,
    last_review: stored.last_review ? new Date(stored.last_review) : undefined,
  }
}

// Apply a rating and return the updated stored card-state. The stored record
// already carries hanzi + pinyin, so we hand it straight back to serializeCard
// to preserve the word's identity.
export function reviewCard(stored, ratingKey, now = new Date()) {
  const card = deserializeCard(stored)
  const result = scheduler.next(card, now, RATING[ratingKey])
  return serializeCard(stored, result.card)
}

// How long until each rating's next review — used to label the buttons
// ("Good · 4d"). Returns a map of ratingKey -> human string.
export function previewIntervals(stored, now = new Date()) {
  const out = { again: '', hard: '', good: '', easy: '' }
  try {
    const card = deserializeCard(stored)
    const scheduling = scheduler.repeat(card, now)
    for (const key of Object.keys(RATING)) {
      const entry = scheduling[RATING[key]]
      if (entry && entry.card && entry.card.due) {
        out[key] = humanizeInterval(entry.card.due.getTime() - now.getTime())
      }
    }
  } catch {
    // If the library shape differs, fall back to blank labels rather than crash.
  }
  return out
}

function humanizeInterval(ms) {
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${Math.max(1, mins)}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo`
  return `${Math.round(months / 12)}y`
}

export function isDue(stored, now = new Date()) {
  return new Date(stored.due).getTime() <= now.getTime()
}

export { State }

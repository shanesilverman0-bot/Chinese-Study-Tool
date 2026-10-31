import { useCallback, useEffect, useState } from 'react'
import { storageKey } from '../lib/dataMode.js'
import { cardKey } from '../lib/fsrs.js'

const FILTER_KEY = storageKey('studyFilter')

const DEFAULT_FILTER = {
  tocfl: {
    Novice: true,
    A1: true,
    A2: true,
    B1: false,
    B2: false,
    C: false,
  },
  cccc: {},
}

// Phase 5b: the four bands became six levels. A stored band choice converts once:
// A -> A1 + A2, B -> B1 + B2 (the old keys are dropped).
function convertBands(tocfl) {
  const out = { ...tocfl }
  for (const [band, levels] of [['A', ['A1', 'A2']], ['B', ['B1', 'B2']]]) {
    if (!(band in out)) continue
    for (const l of levels) if (!(l in out)) out[l] = out[band] === true
    delete out[band]
  }
  return out
}

function loadFilter() {
  try {
    const raw = localStorage.getItem(FILTER_KEY)
    if (!raw) return structuredClone(DEFAULT_FILTER)
    const stored = JSON.parse(raw)
    // Deep-merge tocfl so per-level defaults apply to levels absent from storage
    // (e.g. a returning user who never saw the new UI gets sane defaults).
    return {
      ...structuredClone(DEFAULT_FILTER),
      ...stored,
      tocfl: { ...DEFAULT_FILTER.tocfl, ...convertBands(stored.tocfl || {}) },
      cccc: { ...(stored.cccc || {}) },
    }
  } catch {
    return structuredClone(DEFAULT_FILTER)
  }
}

export function useStudyFilter(vocab) {
  const [filter, setFilter] = useState(loadFilter)

  // Persist filter to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(FILTER_KEY, JSON.stringify(filter))
  }, [filter])

  const toggleTocflBand = useCallback((band) => {
    setFilter((prev) => ({
      ...prev,
      tocfl: {
        ...prev.tocfl,
        [band]: !prev.tocfl[band],
      },
    }))
  }, [])

  const toggleCcccList = useCallback((book, chapter, list) => {
    const key = `${book}-${chapter}-${list}`
    setFilter((prev) => ({
      ...prev,
      cccc: {
        ...prev.cccc,
        [key]: !prev.cccc[key],
      },
    }))
  }, [])

  const getFilteredVocab = useCallback(() => {
    if (!vocab) return []
    const filtered = vocab.filter((v) => {
      if (v.source === 'tocfl') {
        return filter.tocfl[v.level] === true
      }
      if (v.source === 'cccc') {
        const key = `${v.book}-${v.chapter}-${v.list}`
        return filter.cccc[key] === true
      }
      return false
    })
    // Deduplicate by composite key — the same word may have both a tocfl and a
    // cccc entry when TOCFL and dangdai filters overlap.
    const seen = new Set()
    return filtered.filter((v) => {
      const k = cardKey(v)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }, [vocab, filter])

  const resetFilter = useCallback(() => {
    setFilter(structuredClone(DEFAULT_FILTER))
  }, [])

  return {
    filter,
    toggleTocflBand,
    toggleCcccList,
    getFilteredVocab,
    resetFilter,
  }
}

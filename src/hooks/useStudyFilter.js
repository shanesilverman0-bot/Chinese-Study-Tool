import { useCallback, useEffect, useState } from 'react'

const FILTER_KEY = 'tocfl.studyFilter'

const DEFAULT_FILTER = {
  tocfl: {
    Novice: true,
    A: true,
    B: false,
    C: false,
  },
  cccc: {},
}

function loadFilter() {
  try {
    const raw = localStorage.getItem(FILTER_KEY)
    if (!raw) return structuredClone(DEFAULT_FILTER)
    return { ...structuredClone(DEFAULT_FILTER), ...JSON.parse(raw) }
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
    return vocab.filter((v) => {
      if (v.source === 'tocfl') {
        return filter.tocfl[v.band] === true
      }
      if (v.source === 'cccc') {
        const key = `${v.book}-${v.chapter}-${v.list}`
        return filter.cccc[key] === true
      }
      return false
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

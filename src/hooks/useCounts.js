// Memoized counts + daily snapshot upsert (DESIGN §8.5, Phase 4).

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { baselineSets } from '../lib/items.js'
import {
  computeCounts, buildSnapshot, upsertSnapshot, sameSnapshot, countingSettings, effectiveCards,
} from '../lib/counts.js'
import { localDate } from '../lib/dates.js'
import { makeContextQualified, gapList } from '../lib/context.js'
import { CCC_VOCAB } from '../data/ccc.js'

const MIN_HIDDEN_UPSERT_MS = 10 * 60 * 1000

export function useCounts({ progress, itemIndex, dataReady, isBlocked, updateProgress }) {
  const settings = progress.studySettings
  const bl = settings?.baseline
  const baseline = useMemo(
    () => baselineSets(itemIndex, CCC_VOCAB, countingSettings({ baseline: bl }).baseline),
    [itemIndex, bl]
  )
  const eff = useMemo(() => effectiveCards(progress, itemIndex), [progress.cards, itemIndex]) // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(
    () => computeCounts({
      progress, index: itemIndex, settings, baseline, eff,
      contextQualified: makeContextQualified(progress, settings),
    }),
    [eff, settings, itemIndex, baseline, progress.attempts, progress.contextArchive, progress.sentences] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const gaps = useMemo(
    () => gapList(progress, itemIndex, settings, eff),
    [eff, settings, itemIndex, progress.attempts, progress.contextArchive, progress.sentences] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const tz = countingSettings(settings).timeZone
  const today = useMemo(
    () => buildSnapshot(localDate(new Date(), tz), counts, settings, 'live'),
    [counts, settings, tz]
  )

  const countsRef = useRef({ counts, settings, tz })
  countsRef.current = { counts, settings, tz }
  const lastUpsertRef = useRef(0)

  // Overwrites only today's snapshot. Skips the write when nothing but computedAt changed.
  const snapshotNow = useCallback(() => {
    if (isBlocked?.()) return
    const { counts: c, settings: st, tz: zone } = countsRef.current
    const snap = buildSnapshot(localDate(new Date(), zone), c, st, 'live')
    lastUpsertRef.current = Date.now()
    updateProgress((prev) => {
      const existing = (prev.snapshots ?? []).find((x) => x.date === snap.date)
      if (sameSnapshot(existing, snap)) return prev
      return upsertSnapshot(prev, snap)
    })
  }, [isBlocked, updateProgress])

  // (a) once the data is ready
  const firstRef = useRef(false)
  useEffect(() => {
    if (!dataReady || firstRef.current) return
    firstRef.current = true
    snapshotNow()
  }, [dataReady, snapshotNow])

  // (c) when the page is hidden, at most once per 10 minutes
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden' || !firstRef.current) return
      if (Date.now() - lastUpsertRef.current < MIN_HIDDEN_UPSERT_MS) return
      snapshotNow()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [snapshotNow])

  return { counts, today, baseline, snapshotNow, gaps }
}

// Desktop wide layout (per device, not synced). Wide applies only on screens ≥ 1024px
// with the header toggle on; phones always get the narrow single-column layout.
import { createContext, useContext, useEffect, useState } from 'react'
import { storageKey } from './dataMode.js'

const QUERY = '(min-width: 1024px)'
const KEY = storageKey('layoutWide')

export const WideContext = createContext(false)
export const useWide = () => useContext(WideContext)

export function useWideLayout() {
  const [desktop, setDesktop] = useState(() => typeof matchMedia === 'function' && matchMedia(QUERY).matches)
  const [pref, setPref] = useState(() => {
    try { return localStorage.getItem(KEY) !== 'false' } catch { return true }
  })
  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined
    const mq = matchMedia(QUERY)
    const on = () => setDesktop(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const toggle = () => {
    const next = !pref
    setPref(next)
    try { localStorage.setItem(KEY, String(next)) } catch { /* private mode */ }
  }
  return { desktop, wide: desktop && pref, toggle }
}

// Browser speech: SpeechSynthesis for TTS playback and SpeechRecognition for
// optional pronunciation checking. Both target the zh-TW locale.

import { storageKey } from './dataMode.js'

const DEFAULT_RATE = 0.85
const BETTER = /enhanced|premium|增強/i

export function isBetterVoice(v) {
  return BETTER.test(v.name || '')
}

// zh voices: zh-TW first, then Enhanced/Premium, then other zh-*.
export function listVoices() {
  if (!('speechSynthesis' in window)) return []
  const zh = window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('zh'))
  const rank = (v) => (v.lang === 'zh-TW' ? 0 : isBetterVoice(v) ? 1 : 2)
  return zh
    .map((v, i) => ({ v, i }))
    .sort((a, b) => rank(a.v) - rank(b.v) || a.i - b.i)
    .map((x) => x.v)
}

export function getTtsPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(storageKey('tts')) || 'null')
    return { voiceURI: p?.voiceURI || '', rate: Number(p?.rate) || DEFAULT_RATE }
  } catch {
    return { voiceURI: '', rate: DEFAULT_RATE }
  }
}

export function setTtsPrefs({ voiceURI, rate }) {
  try {
    localStorage.setItem(storageKey('tts'), JSON.stringify({ voiceURI: voiceURI || '', rate }))
  } catch {
    // storage unavailable: ignore
  }
}

function pickVoice() {
  const voices = listVoices()
  const saved = getTtsPrefs().voiceURI
  const chosen = saved && voices.find((v) => v.voiceURI === saved)
  if (chosen) return chosen
  // Fallback rule: Taiwan Mandarin, then zh-Hant, then any zh voice.
  return (
    voices.find((v) => v.lang === 'zh-TW') ||
    voices.find((v) => v.lang?.startsWith('zh-Hant')) ||
    voices[0] ||
    null
  )
}

// Voices load asynchronously in some browsers (iOS fires voiceschanged late).
export function primeVoices() {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.getVoices()
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices()
    window.dispatchEvent(new Event('tts-voices-changed'))
  }
}

function makeUtterance(text, rate) {
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'zh-TW'
  u.rate = rate ?? getTtsPrefs().rate
  const v = pickVoice()
  if (v) {
    u.voice = v
    u.lang = v.lang
  }
  return u
}

export function speak(text, rateOverride) {
  if (!('speechSynthesis' in window)) return false
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(makeUtterance(text, rateOverride))
  return true
}

// Resolves when playback ends (or errors / is unsupported).
export function speakAsync(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve()
    window.speechSynthesis.cancel()
    const u = makeUtterance(text)
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.speak(u)
  })
}

export function ttsSupported() {
  return 'speechSynthesis' in window
}

export function recognitionSupported() {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
}

// One-shot recognition; resolves with the transcript string.
export function recognizeOnce() {
  return new Promise((resolve, reject) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return reject(new Error('Speech recognition not supported'))
    const rec = new SR()
    rec.lang = 'zh-TW'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e) => resolve(e.results[0][0].transcript)
    rec.onerror = (e) => reject(new Error(e.error))
    rec.onend = () => {}
    rec.start()
  })
}

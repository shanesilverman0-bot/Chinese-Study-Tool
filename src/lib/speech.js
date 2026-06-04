// Browser speech: SpeechSynthesis for TTS playback and SpeechRecognition for
// optional pronunciation checking. Both target the zh-TW locale.

let cachedVoice = null

function pickVoice() {
  if (cachedVoice) return cachedVoice
  const voices = window.speechSynthesis?.getVoices() || []
  // Prefer an explicit Taiwan Mandarin voice; fall back to any zh voice.
  cachedVoice =
    voices.find((v) => v.lang === 'zh-TW') ||
    voices.find((v) => v.lang?.startsWith('zh-Hant')) ||
    voices.find((v) => v.lang?.startsWith('zh')) ||
    null
  return cachedVoice
}

// Voices load asynchronously in some browsers.
export function primeVoices() {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.getVoices()
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null
    pickVoice()
  }
}

export function speak(text, rate = 0.85) {
  if (!('speechSynthesis' in window)) return false
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'zh-TW'
  u.rate = rate
  const v = pickVoice()
  if (v) u.voice = v
  window.speechSynthesis.speak(u)
  return true
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

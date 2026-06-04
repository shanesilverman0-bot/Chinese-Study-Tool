// AI tutor layer — calls the Anthropic Messages API directly from the browser.
// The API key is entered once in Settings and kept in localStorage.
//
// NOTE: Anthropic's API requires the `anthropic-dangerous-direct-browser-access`
// header to allow CORS requests from a browser. The key lives only in the
// user's own browser localStorage and is sent directly to Anthropic.

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'

const SYSTEM = `You are a warm, concise Mandarin tutor for a learner studying Taiwanese Mandarin (TOCFL standard).
Always use Traditional Chinese characters, never Simplified.
Give pinyin with tone marks (ā á ǎ à), never tone numbers.
When relevant, note differences between Taiwan usage and Mainland usage.
Keep answers short and scannable — a learner is reading this on a phone.`

const MODES = {
  examples: (w) =>
    `Give 2 short, natural example sentences using 「${w.hanzi}」(${w.pinyin}, "${w.english}") as used in Taiwan. For each: Traditional sentence, pinyin, English. Keep them at an appropriate level.`,
  grammar: (w) =>
    `Briefly explain how to use 「${w.hanzi}」(${w.pinyin}) grammatically — part of speech, typical sentence position, and one common pattern. Be concise.`,
  memory: (w) =>
    `Give one vivid memory aid / mnemonic to remember 「${w.hanzi}」(${w.pinyin}, "${w.english}"), connecting the characters or sound to the meaning.`,
  taiwan: (w) =>
    `Explain how 「${w.hanzi}」(${w.pinyin}) is used in Taiwan vs Mainland China — any difference in word choice, frequency, pronunciation, or nuance. If there's no real difference, say so briefly.`,
}

export const TUTOR_MODES = [
  { key: 'examples', label: 'Example sentences' },
  { key: 'grammar', label: 'Grammar' },
  { key: 'memory', label: 'Memory tip' },
  { key: 'taiwan', label: 'Taiwan vs Mainland' },
]

export async function askTutor({ apiKey }, word, modeKey, extra = '') {
  const prompt = MODES[modeKey](word) + (extra ? `\n\nLearner's question: ${extra}` : '')
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Claude API error (${res.status}): ${text}`)
  }
  const json = await res.json()
  return json.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
}

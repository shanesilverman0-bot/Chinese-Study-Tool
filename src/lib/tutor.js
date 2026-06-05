// AI tutor layer — supports two providers, selectable in Settings:
//   • Claude  (Anthropic Messages API)
//   • DeepSeek (OpenAI-compatible Chat Completions API)
//
// Both keys live ONLY in this browser's localStorage and are sent directly to
// the provider. See the CORS note on DeepSeek below.

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

export const PROVIDERS = [
  { key: 'claude', label: 'Claude (Anthropic)', defaultModel: 'claude-sonnet-4-20250514' },
  // deepseek-chat / deepseek-reasoner still resolve as of 2026 but are being
  // renamed to deepseek-v4-flash / deepseek-v4-pro; either string works.
  { key: 'deepseek', label: 'DeepSeek', defaultModel: 'deepseek-chat' },
]

function buildPrompt(word, modeKey, extra) {
  return MODES[modeKey](word) + (extra ? `\n\nLearner's question: ${extra}` : '')
}

// --- Claude (Anthropic) --------------------------------------------------
async function askClaude({ apiKey, model }, word, modeKey, extra) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(word, modeKey, extra) }],
    }),
  })
  if (!res.ok) throw new Error(`Claude API error (${res.status}): ${await res.text()}`)
  const json = await res.json()
  return json.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
}

// --- DeepSeek (OpenAI-compatible) ---------------------------------------
// NOTE: DeepSeek's docs recommend calling from a server/proxy, not the browser.
// A direct browser call may be blocked by CORS. If it is, the error below will
// say so, and you can route through a proxy (see README).
async function askDeepSeek({ apiKey, model }, word, modeKey, extra) {
  let res
  try {
    res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        max_tokens: 600,
        stream: false,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: buildPrompt(word, modeKey, extra) },
        ],
      }),
    })
  } catch (e) {
    // A network/TypeError here on the browser is almost always CORS.
    throw new Error(
      'DeepSeek request was blocked (likely CORS — browsers cannot call api.deepseek.com directly). ' +
        'See the README for the proxy option. Original: ' + e.message
    )
  }
  if (!res.ok) throw new Error(`DeepSeek API error (${res.status}): ${await res.text()}`)
  const json = await res.json()
  return json.choices?.[0]?.message?.content || '(empty response)'
}

// Unified entry point used by the UI.
export async function askTutor(config, word, modeKey, extra = '') {
  const provider = config.provider || 'claude'
  if (provider === 'deepseek') {
    if (!config.deepseekApiKey) throw new Error('Add your DeepSeek API key in Settings.')
    return askDeepSeek(
      { apiKey: config.deepseekApiKey, model: config.deepseekModel },
      word,
      modeKey,
      extra
    )
  }
  if (!config.claudeApiKey) throw new Error('Add your Claude API key in Settings.')
  return askClaude(
    { apiKey: config.claudeApiKey, model: config.claudeModel },
    word,
    modeKey,
    extra
  )
}

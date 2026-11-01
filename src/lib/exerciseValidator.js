// Exercise output validator (DESIGN §10.4). Pure, never throws.
// validateExerciseFile(text, { itemIndex, listId?, existingFiles, expectedTargets? })
//   → { ok, file, accepted, rejected: [{id, reasons[]}], warnings, fatal }

const BANDS = ['Novice', 'A', 'B', 'C']
const ALLOWED = { word: ['cloze', 'fill', 'usage', 'listening'], grammar: [] } // grammar types arrive with grammar
const GRAMMAR_TYPES = ['pattern-cloze', 'grammar-usage', 'error-spot']

// Common simplified-only characters; none of these is used in Taiwan Traditional.
export const SIMPLIFIED_ONLY =
  '们这说时国会对过还没为发学经问见现进长门开关东车书买卖读认让谁请话语该边样个来点么吗听师医务办区单张带离种药觉热爱乐体总应机实习动电写业并'

const isStr = (s) => typeof s === 'string' && s.trim() !== ''
const markersOf = (text) => [...String(text ?? '').matchAll(/\[\[(\d+)\]\]/g)].map((m) => Number(m[1]))

function parseJson(text) {
  let s = String(text ?? '')
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a < 0) return { error: 'No JSON object found. Paste the whole reply from the AI.' }
  if (b < a) return { error: 'The JSON looks cut off (no closing brace). Ask the AI to continue or run it again.' }
  s = s.slice(a, b + 1) // also drops ``` fences and "Here is your file:"
  try {
    return { value: JSON.parse(s) }
  } catch (e) {
    const msg = String(e?.message ?? e)
    let where = ''
    const m = /position (\d+)/.exec(msg)
    if (m) {
      const before = s.slice(0, Number(m[1]))
      const line = before.split('\n').length
      where = ` (line ${line}, column ${before.length - before.lastIndexOf('\n')})`
    }
    return { error: `The text is not valid JSON${where}. It may have been cut off; ask the AI to continue, or run it again. ${msg}` }
  }
}

function simplifiedIn(ex) {
  const texts = [ex.passage, ex.sentence, ex.audioText]
  for (const q of ex.questions ?? []) texts.push(q?.prompt, q?.answer, ...(Array.isArray(q?.options) ? q.options : []))
  const found = new Set()
  for (const t of texts) if (typeof t === 'string') for (const ch of t) if (SIMPLIFIED_ONLY.includes(ch)) found.add(ch)
  return [...found]
}

function bandRank(b) {
  return BANDS.indexOf(b)
}

export function validateExerciseFile(text, opts = {}) {
  const { itemIndex, existingFiles = [], expectedTargets } = opts
  const out = { ok: false, file: null, accepted: [], rejected: [], warnings: [], fatal: null }
  try {
    const parsed = parseJson(text)
    if (parsed.error) return { ...out, fatal: parsed.error }
    const f = parsed.value
    if (!f || typeof f !== 'object' || Array.isArray(f)) return { ...out, fatal: 'The JSON is not an object.' }
    if (f.format !== 'tocfl-tutor.exercises') return { ...out, fatal: `Wrong "format": expected "tocfl-tutor.exercises", got ${JSON.stringify(f.format)}.` }
    if (f.formatVersion !== 1) return { ...out, fatal: `Unsupported "formatVersion" ${JSON.stringify(f.formatVersion)} (expected 1).` }
    if (!Array.isArray(f.exercises) || f.exercises.length === 0) return { ...out, fatal: '"exercises" must be a non-empty array.' }
    if (!Number.isInteger(f.variant) || f.variant < 1) return { ...out, fatal: '"variant" must be a positive integer.' }
    if (!Number.isInteger(f.batch) || f.batch < 1) return { ...out, fatal: '"batch" must be a positive integer.' }
    if (f.itemType !== 'word' && f.itemType !== 'grammar') return { ...out, fatal: '"itemType" must be "word" or "grammar".' }
    const listId = isStr(f.listId) ? f.listId : opts.listId
    if (!isStr(listId)) return { ...out, fatal: 'The file has no "listId". Import it from a list\'s Exercises tab.' }
    if (isStr(f.listId) && opts.listId && f.listId !== opts.listId) {
      out.warnings.push(`File says list ${f.listId}; importing into ${opts.listId}.`)
    }
    const file = { listId: opts.listId || listId, batch: f.batch, variant: f.variant, itemType: f.itemType, generator: isStr(f.generator) ? f.generator : null }
    out.file = file

    const same = existingFiles.filter((e) => e && Array.isArray(e.exercises) && e.listId === file.listId)
    const takenIds = new Set(same.flatMap((e) => e.exercises.map((x) => x.id)))
    const otherVariantTexts = new Set()
    for (const e of same) {
      if (e.batch !== file.batch || e.variant === file.variant) continue
      for (const x of e.exercises) for (const t of [x.passage, x.sentence, x.audioText]) if (isStr(t)) otherVariantTexts.add(t)
    }

    const idx = (k) => itemIndex?.get?.(k)
    const hanziOf = (k) => idx(k)?.hanzi ?? String(k).split('|')[0]
    const bandOfKey = (k) => idx(k)?.band ?? 'B' // outside-TOCFL counts as B
    const targetBand = BANDS[Math.max(0, ...f.exercises.flatMap((e) => (Array.isArray(e?.targets) ? e.targets : [])).map((k) => bandRank(bandOfKey(k))))] ?? 'B'

    const seenIds = new Set()
    const targetCount = new Map()
    const allowed = ALLOWED[f.itemType]

    f.exercises.forEach((ex, n) => {
      const reasons = []
      const label = isStr(ex?.id) ? ex.id : `#${n + 1}`
      if (!ex || typeof ex !== 'object') return out.rejected.push({ id: label, reasons: ['Not an object.'] })

      if (!isStr(ex.id)) reasons.push('Missing "id".')
      else if (seenIds.has(ex.id)) reasons.push(`Duplicate id "${ex.id}" in this file.`)
      seenIds.add(ex.id)

      if (GRAMMAR_TYPES.includes(ex.type) || f.itemType === 'grammar') reasons.push('Grammar exercises are not supported yet.')
      else if (!allowed.includes(ex.type)) reasons.push(`Unknown type ${JSON.stringify(ex.type)}.`)

      if (!BANDS.includes(ex.band)) reasons.push(`"band" must be one of ${BANDS.join(', ')}.`)

      const targets = Array.isArray(ex.targets) ? ex.targets : []
      if (targets.length === 0) reasons.push('"targets" must be a non-empty array.')
      for (const t of targets) if (!idx(t)) reasons.push(`Unknown target key "${t}".`)

      const qs = Array.isArray(ex.questions) ? ex.questions : []
      if (qs.length === 0) reasons.push('"questions" must be a non-empty array.')

      if (ex.type === 'cloze') {
        const m = markersOf(ex.passage)
        const n2 = m.length
        const ok = n2 >= 3 && n2 <= 5 && m.every((v, i) => v === i + 1)
        if (!isStr(ex.passage)) reasons.push('cloze needs a "passage".')
        else if (!ok) reasons.push(`Passage blanks must be [[1]]…[[n]] once each with 3 ≤ n ≤ 5 (found ${n2 ? m.map((v) => `[[${v}]]`).join('') : 'none'}).`)
        if (ok && qs.length !== n2) reasons.push(`Passage has ${n2} blanks but ${qs.length} questions.`)
        else if (ok) qs.forEach((q, i) => { if (q?.blank !== i + 1) reasons.push(`Question ${i + 1} has blank ${JSON.stringify(q?.blank)}, expected ${i + 1}.`) })
      } else if (ex.type === 'fill') {
        const m = markersOf(ex.sentence)
        if (!isStr(ex.sentence)) reasons.push('fill needs a "sentence".')
        else if (m.length !== 1 || m[0] !== 1) reasons.push('Sentence must contain exactly one [[1]].')
        if (qs.length !== 1) reasons.push('fill needs exactly one question.')
      } else if (ex.type === 'listening') {
        if (!isStr(ex.audioText)) reasons.push('listening needs "audioText".')
      }

      qs.forEach((q, i) => {
        const at = `Q${i + 1}: `
        if (!q || typeof q !== 'object') return reasons.push(`${at}not an object.`)
        if (!isStr(q.target)) reasons.push(`${at}missing "target".`)
        else if (!targets.includes(q.target)) reasons.push(`${at}target "${q.target}" is not in "targets".`)
        const opts4 = q.options
        let optsOk = Array.isArray(opts4) && opts4.length === 4 && opts4.every(isStr)
        if (!optsOk) reasons.push(`${at}needs exactly 4 non-empty options.`)
        else if (new Set(opts4.map((o) => o.trim())).size !== 4) { optsOk = false; reasons.push(`${at}options are not all different.`) }
        if (optsOk) {
          const hits = opts4.filter((o) => o === q.answer).length
          if (hits !== 1) reasons.push(`${at}answer ${JSON.stringify(q.answer)} must equal exactly one option.`)
        }
        if (!isStr(q.explanation)) reasons.push(`${at}missing "explanation".`)
        const hz = isStr(q.target) && idx(q.target) ? hanziOf(q.target) : null
        if (hz) {
          if ((ex.type === 'cloze' || ex.type === 'fill') && q.answer !== hz) reasons.push(`${at}answer ${JSON.stringify(q.answer)} is not the target "${hz}".`)
          if (ex.type === 'usage' && optsOk && !opts4.every((o) => o.includes(hz))) reasons.push(`${at}every option must contain "${hz}".`)
          if (ex.type === 'listening' && isStr(ex.audioText) && !ex.audioText.includes(hz)) reasons.push(`${at}audioText must contain "${hz}".`)
        }
      })

      if (reasons.length) return out.rejected.push({ id: label, reasons })

      // accepted; warnings
      const ex2 = { ...ex }
      if (takenIds.has(ex2.id)) {
        let k = 1
        while (takenIds.has(`${ex.id}-dup${k}`) || seenIds.has(`${ex.id}-dup${k}`)) k++
        ex2.id = `${ex.id}-dup${k}`
        seenIds.add(ex2.id)
        out.warnings.push(`${ex.id}: id already used in an existing file for this list; renamed ${ex2.id}.`)
      }
      const simp = simplifiedIn(ex)
      if (simp.length) out.warnings.push(`${ex.id}: simplified characters found: ${simp.join(' ')}.`)
      if (ex.type === 'cloze' || ex.type === 'fill') {
        for (const q of qs) {
          for (const d of q.options.filter((o) => o !== q.answer)) {
            const cands = [...(itemIndex?.byHanzi?.get?.(d) ?? [])]
            if (cands.length === 0) out.warnings.push(`${ex.id}: distractor "${d}" is not a TOCFL word.`)
            else if (!cands.some((c) => bandRank(bandOfKey(c)) <= bandRank(targetBand))) {
              out.warnings.push(`${ex.id}: distractor "${d}" is above band ${targetBand}.`)
            }
          }
        }
      }
      for (const t of [ex.passage, ex.sentence, ex.audioText]) {
        if (isStr(t) && otherVariantTexts.has(t)) out.warnings.push(`${ex.id}: same text as another variant of this batch.`)
      }
      for (const t of targets) targetCount.set(t, (targetCount.get(t) ?? 0) + 1)
      out.accepted.push(ex2)
    })

    if (Array.isArray(expectedTargets)) {
      for (const t of expectedTargets) {
        const c = targetCount.get(t) ?? 0
        if (c !== 1) out.warnings.push(`Plan not followed: ${t} appears ${c} times (expected once).`)
      }
    }
    out.ok = out.accepted.length > 0
    return out
  } catch (e) {
    return { ...out, fatal: `Could not check the file: ${e?.message ?? e}` }
  }
}

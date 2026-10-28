// Item keys (DESIGN §4.1). Word keys are `${hanzi}|${pinyin}`; grammar keys are
// `g:${slug}` and never contain `|`.

export const GRAMMAR_PREFIX = 'g:'

export function itemTypeOf(key) {
  return typeof key === 'string' && key.startsWith(GRAMMAR_PREFIX) ? 'grammar' : 'word'
}

export function isWordKey(key) {
  return itemTypeOf(key) === 'word' && typeof key === 'string' && key.includes('|')
}

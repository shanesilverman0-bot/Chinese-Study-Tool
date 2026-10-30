// Bundled Course in Contemporary Chinese vocab (DESIGN §4.4). Every row of every
// pack is kept (no dedupe). Each row's item key comes from the TOCFL sense it matches
// (DESIGN §4.3), so CCC 筆 in Book 4 (M) studies as `筆|bǐ#M`.
import { SEED_VOCAB } from './vocab.js'
import { normalizeEntry } from '../lib/vocab.js'
import { buildItemIndex } from '../lib/items.js'

const mods = import.meta.glob('../../vocab/cccc-book*.json', { eager: true, import: 'default' })
const files = Object.entries(mods).sort(([a], [b]) => a.localeCompare(b))

export const CCC_PACK_NAMES = files.map(([path]) => path.split('/').pop())

const rows = files.flatMap(([, pack]) =>
  (pack.vocab ?? []).map(normalizeEntry).filter((v) => v.hanzi).map((v) => ({ ...v, source: 'cccc' }))
)

const index = buildItemIndex({ tocfl: SEED_VOCAB, ccc: rows })

export const CCC_VOCAB = rows.map((v) => ({ ...v, key: index.rowInfo(v).key }))

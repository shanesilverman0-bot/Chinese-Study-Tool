# Vocab Pack Authoring Guide

**Purpose of this document:** paste it into a prompt to Claude or DeepSeek and
ask the model to generate a vocab pack. The model should output a single JSON
file that conforms exactly to the schema below. You then upload that file into
the **`vocab/`** folder of your TOCFL Tutor repo (via the app's **檔案 / Files**
tab, or directly on GitHub). The app auto-discovers every `.json` file in
`vocab/` on load and merges it into your study deck. No rebuild needed.

---

## What to tell the AI

> Generate a TOCFL Tutor vocab pack as a single JSON file following the schema in
> this guide. Traditional Chinese only (never Simplified). Pinyin must use tone
> marks (ā á ǎ à), never tone numbers. Output **only** the JSON — no prose, no
> Markdown fences. [Then add your specifics, e.g. "50 TOCFL Band B food and
> cooking words" or "the words on this list: …"]

---

## File format

A pack is a JSON file whose top level is **either**:

1. A JSON **array** of word objects, or
2. An **object** with a `words` array: `{ "words": [ … ] }`

Each word object:

```json
{
  "hanzi": "經濟",
  "pinyin": "jīngjì",
  "english": "economy",
  "band": "B",
  "tones": [1, 4]
}
```

### Fields

| Field     | Required | Type            | Notes |
|-----------|----------|-----------------|-------|
| `hanzi`   | **yes**  | string          | Traditional characters only. Also accepted: `traditional`, `word`. |
| `pinyin`  | yes\*    | string          | Tone **marks**, not numbers. Syllables may be space-separated (`nǐ hǎo`) or joined (`nǐhǎo`). Also accepted: `reading`. |
| `english` | yes      | string          | Short definition. Also accepted: `definition`, `meaning`. |
| `band`    | no       | string          | One of `"Novice"`, `"A"`, `"B"`, `"C"`. Defaults to `"Novice"`. Also accepted: `level`. |
| `tones`   | no       | array of 1–5    | Per-syllable tone numbers. **Optional** — if omitted, the app derives them from the pinyin tone marks. Provide it only if you want to be explicit. `5` = neutral tone. |
| `id`      | no       | string          | Stable unique id. If omitted, the app generates one from the filename + hanzi. Supply your own only if you want IDs stable across edits. |

\* `pinyin` is required if you omit `tones`, because tones are derived from it.

### Tone numbers (for the optional `tones` array)

- `1` = first tone (flat high) — ā
- `2` = second tone (rising) — á
- `3` = third tone (dip then rise) — ǎ
- `4` = fourth tone (sharp falling) — à
- `5` = neutral tone (no mark) — a

The **first non-neutral** tone in the array drives the Tone Trainer's reference
curve, so getting the leading syllable right matters most.

---

## Complete example pack

Filename suggestion: `vocab/band-b-society.json`

```json
[
  { "hanzi": "經濟", "pinyin": "jīngjì",   "english": "economy",            "band": "B" },
  { "hanzi": "環境", "pinyin": "huánjìng", "english": "environment",        "band": "B" },
  { "hanzi": "影響", "pinyin": "yǐngxiǎng","english": "to influence; impact","band": "B" },
  { "hanzi": "社會", "pinyin": "shèhuì",   "english": "society",            "band": "B" },
  { "hanzi": "發展", "pinyin": "fāzhǎn",   "english": "to develop",         "band": "B" }
]
```

That's a valid pack. `tones` is omitted, so the app derives `[1,4]`, `[2,4]`,
`[3,3]`, `[4,4]`, `[1,3]` from the pinyin automatically.

---

## Rules and gotchas

1. **Traditional only.** Reject Simplified forms (经济 → 經濟, 环境 → 環境, 发展 → 發展).
2. **Tone marks, not numbers.** Write `jīngjì`, not `jing1ji4`.
3. **Valid JSON.** No trailing commas, no comments, double-quoted keys/strings.
   Output the raw JSON only — if the model wraps it in ```` ```json ```` fences,
   delete the fences before saving (the app's parser tolerates whitespace but
   not Markdown).
4. **One pack per file.** Multiple files in `vocab/` are all loaded and merged.
5. **Dedup by hanzi.** If a word's `hanzi` already exists (in the seed list or an
   earlier pack), the duplicate is skipped — your existing review history is
   preserved.
6. **Bands gate study.** A word only appears in review if its `band` is enabled
   in Settings → Study levels. Use the correct band so words surface when expected.
7. **File size.** Keep individual files under a few MB. For very large lists
   (e.g. the full TOCFL 14,425), split into several files (e.g. by band).

---

## Where the data can come from

The TOCFL standard wordlists are published by the SC-TOP. Community CSV mirrors
exist (e.g. `ivankra/tocfl`, `nutchanonj/TOCFL_14425_vocab_list`). You can paste
rows from those into a prompt and ask the AI to convert them to this JSON shape —
just remember to confirm Traditional characters and tone-marked pinyin in the
output.

---

## Validation checklist (have the AI self-check before returning)

- [ ] Top level is an array, or `{ "words": [...] }`
- [ ] Every entry has `hanzi`, `pinyin`, `english`
- [ ] All `hanzi` are Traditional
- [ ] All `pinyin` use tone marks
- [ ] Every `band` is one of Novice / A / B / C (or omitted)
- [ ] Output is pure JSON with no surrounding prose or code fences

# Brief: the gap between CCC (當代中文課程) and the TOCFL word list

> **Re-measured in Phase 3 (2026-10-30)** on the sense data (7,505 TOCFL senses, six levels) with `node scripts/check-counts.mjs`. Section 3 onward still quotes the old four-band figures.

TOCFL list = 7,505 senses (7,215 main + 290 extra). CCC = the vocabulary lists of Books 1–6 (4,960 rows, 229 tagged `name` and never counted), matched to TOCFL with the app's rules (exact, normalized pinyin, `/` variants, unique hanzi), each key placed at the first CCC chapter that lists it.

## 1. Where you stand

| | TOCFL senses |
|---|---|
| Met in CCC B1 Ch 1 → B3 Ch 9 (**solid baseline**, counted Known) | **1,289** |
| Met in CCC B3 Ch 10 → B4 Ch 4 (**studied, under review**, counted Seen) | **327** |

Solid by level: Novice 314, A1 244, A2 239, B1 237, B2 211, C 44. Studied by level: Novice 5, A1 14, A2 32, B1 112, B2 123, C 41.

## 2. How much of TOCFL CCC covers, by level

| Level | TOCFL senses | In CCC through B4 Ch 4 | In CCC later (B4 Ch 5 → B6) | **Never in CCC's vocab lists** |
|---|---|---|---|---|
| Novice | 394 | 319 | 6 | **69** |
| A1 | 347 | 258 | 22 | **67** |
| A2 | 485 | 271 | 44 | **170** |
| B1 | 1,170 | 349 | 314 | **507** |
| B2 | 2,336 | 334 | 489 | **1,513** |
| C | 2,773 | 85 | 357 | 2,331 |
| **Total** | 7,505 | 1,616 | 1,232 | 4,657 |

CCC match tiers, all books: exact 2,838, normalized 36, variant 56, hanzi-unique 68, ambiguous 2, none 1,731, name 229. Books 1–3: exact 1,419, normalized 23, variant 43, hanzi-unique 43, ambiguous 2, none 460, name 84.

## 3. What this means

1. **CCC alone won't get you to B2 vocabulary.** Finishing all six books covers about 1,461 of the 3,320 Band B words (44%). **1,859 Band B words never appear in CCC's vocabulary lists.** That's the biggest single gap for the exam.
2. **5,000 Known ≈ all of CCC plus every Novice/A/B word CCC skips.** Everything CCC teaches that is in TOCFL (2,817) plus the Novice/A/B words it never lists (2,151) comes to **4,968**. So the 5,000 goal is a concrete, finite set, not a guess.
3. **"Never in CCC" doesn't mean you don't know it.** CCC only lists *new-word* vocabulary. Common words that show up in passing (別人, 男生, 號碼, 樓梯, 沙發…) are taught but never listed. Most of the 292 Novice/A gap words are probably already known.
4. **Your recent chapters are the weakest layer.** The 325 words from B3 Ch 10 → B4 Ch 4 count as Seen, not Known, until flashcards confirm them.

## 4. Suggested strategy

| Step | What | Size | How in the app |
|---|---|---|---|
| 1 | **Confirm recent chapters** | 325 words | Picker → CCC B3 Ch 10–12 + B4 Ch 1–4 (studied tier is always included) |
| 2 | **Triage the easy gap**: press **Easy** on what you already know, so it graduates at once (~16-day interval) | 292 Novice/A words | Picker → TOCFL Novice + A; "Include baseline words" off. Most cards take 2–3 seconds |
| 3 | **Keep pace with class** | ~45 TOCFL words per chapter | Add each new CCC chapter (or part) as you reach it |
| 4 | **Band B gap, steadily** | 1,859 words | Picker → TOCFL B, "New cards: 15–25" per session. Phase 11 exercises on these words give them context |
| 5 | **Spot-check the solid baseline** occasionally | 1,268 words | Turn on "Include baseline words" for an old chapter; anything you press Again on leaves the baseline honestly |

**Rough pace.** From ≈1,300 Known to 5,000 means ≈3,700 words to graduate:
- by the **2027-03-06** exam (≈18 weeks): about **205 per week**
- by **2027-05-15** (≈28 weeks): about **130 per week**
- by **2027-06-26** (≈34 weeks): about **110 per week**

Step 2 is fast and front-loads the count. The real work is steps 3–4: about 2,700 new CCC + Band B words.

## 5. Caveats
- The matching is automatic. Phase 3 prints the ambiguous cases (2 in Books 1–3) and the unmatched CCC rows, so you can spot real misses.
- Phase 2.5 splits Band B into B1/B2, so the table above measures them separately.

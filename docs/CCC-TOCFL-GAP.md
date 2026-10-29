# Brief: the gap between CCC (當代中文課程) and the TOCFL word list

> **Note 2026-10-30:** these numbers come from the old word data (one item per hanzi+pinyin, four bands). Phase 2.5 rebuilds the data as senses with six levels (B1/B2 split), and Phase 3 re-measures this brief. Expect small shifts, plus a B1 vs B2 breakdown.

Measured 2026-10-29 from the repo data. TOCFL list = 7,215 unique words (`hanzi|pinyin`), each counted at its lowest band. CCC = the vocabulary lists of Books 1–6 (4,960 rows), matched to TOCFL words with the app's matching rules (exact, normalized pinyin, `/` variants, unique hanzi). Phase 3 re-measures these numbers; expect ±20 per cell.

## 1. Where you stand

| | TOCFL words |
|---|---|
| Met in CCC B1 Ch 1 → B3 Ch 9 (**solid baseline**, counted Known) | **1,268** |
| Met in CCC B3 Ch 10 → B4 Ch 4 (**studied, under review**, counted Seen) | **325** |
| Graduated flashcards outside the solid baseline | 18 |
| **Known today (estimate)** | **≈ 1,286** |

## 2. How much of TOCFL CCC covers, by band

| Band | TOCFL words | In CCC through B4 Ch 4 | In CCC later (B4 Ch 5 → B6) | **Never in CCC's vocab lists** |
|---|---|---|---|---|
| Novice | 394 | 325 | 5 | **64** |
| A | 829 | 535 | 66 | **228** |
| B | 3,320 | 656 | 805 | **1,859** |
| C | 2,672 | 77 | 348 | 2,247 |
| **Total** | 7,215 | 1,593 | 1,224 | 4,398 |

The other way round: 1,982 CCC vocab rows have no TOCFL match (Book 1: 111, Book 2: 177, Book 3: 265, Book 4: 401, Book 5: 399, Book 6: 631). These are mostly proper nouns, set phrases, and words outside the TOCFL list. They're still useful, but they don't move the Known count.

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
- The TOCFL list does not split Band B into B1/B2, so "B2 coverage" can't be measured separately.

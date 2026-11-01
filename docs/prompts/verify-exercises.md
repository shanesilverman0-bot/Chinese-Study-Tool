# Prompt: verify exercises (optional second pass)

**How to use**
1. Take the JSON that `generate-exercises.md` produced (before or after importing it).
2. Open a **different** model from the one that generated it (e.g. generated with DeepSeek → verify with Claude). Paste everything below the line, then paste or attach that exercise JSON.
3. Copy the JSON reply → app → the same list → 練習題 · Exercises → paste → **Check** → **Import**. Import the exercise file first; the review then switches off any question marked `ambiguous` or `wrong-answer`.

---

You are a second, independent examiner for TOCFL-style recognition exercises written for a learner in Taiwan. You will receive an EXERCISE FILE (JSON, format `tocfl-tutor.exercises`). Your job is to **try to break each question**: find any option other than the keyed `answer` that a careful native speaker from Taiwan would also accept.

For every question in every exercise:
1. Read the passage, sentence, `audioText` or prompt. For cloze, read the whole passage with the other blanks filled by their keyed answers.
2. Test each of the 4 options on its own: put it in the blank (or, for usage items, read that sentence) and ask whether a native Taiwanese speaker would accept it as correct and natural in this context.
3. Then compare with the keyed `answer`.

Verdicts:
- `ok`: only the keyed answer works, and the item is natural and at level.
- `ambiguous`: another option is also acceptable. Put it in `alternative`.
- `wrong-answer`: the keyed answer is wrong or worse than another option. Put the better one in `alternative`.
- `unnatural`: the answer is right, but the passage or sentence sounds unnatural or non-native.
- `above-level`: non-target words are clearly above the exercise's `band` (TOCFL: Novice < A < B < C).
- `not-taiwan`: Simplified characters, or Mainland vocabulary or usage where Taiwan uses something else.

Pick the most serious one verdict per question, in this order: wrong-answer > ambiguous > not-taiwan > unnatural > above-level > ok.

## Output

Return **only** one JSON object. No markdown fences, no text outside it:

```
{
  "format": "tocfl-tutor.exercise-review",
  "formatVersion": 1,
  "listId": <copy from the exercise file>,
  "batch": <copy>,
  "variant": <copy>,
  "reviewer": "<your model name>",
  "findings": [
    { "exId": "<exercise id>", "q": <question index, 0-based>, "verdict": "ok",
      "alternative": null, "note": "" }
  ]
}
```

- Include **one finding for every question**, including the `ok` ones, so coverage is visible.
- `alternative` is an option text copied exactly, or `null`.
- `note` is English, at most 2 sentences, and empty for `ok`. For problems, say what's wrong and how to fix it.
- Be strict. When you're unsure whether a second option is acceptable, mark `ambiguous`. A disabled question costs little; a question with two right answers teaches the wrong thing.

EXERCISE FILE follows.

# Math (sommen) difficulty levels

Design decisions for the three difficulty tiers in the multiplication-table
exercise, worked out during development. This supersedes the original
single global "hints" checkbox described in `claude-code-prompt-tafeltikker.md`
— hint availability and timing are now entirely determined by the chosen
difficulty, so there is no separate hint toggle/button anymore.

## Makkelijk (multiple choice)
- 4 answer options (1 correct + 3 distractors), single tap to answer, one shot.
- No hint — picking from options is the built-in help.

## Gemiddeld (numpad, 3 tries, hint before the last try)
- Numeric keypad or physical keyboard + Enter.
- Up to 3 attempts per question.
- A hint is shown automatically going into the 3rd/final attempt: the
  decomposition via the nearest ×5/×10 anchor (e.g. "7 × 10 = 70",
  "7 × 2 = 14", "Nu jij: 70 − 2 = ?") — help arrives *before* the last try,
  but never states the final numeric answer.
- Answering correctly on try 1 or 2 never shows a hint.

## Moeilijk (numpad, 3 tries, no help while solving)
- Same numpad + 3-attempt structure as Gemiddeld.
- No hint is shown during any of the 3 attempts — the child gets no help
  while actually solving the question.
- Only once all 3 tries are wrong does it reveal the correct answer *and*
  the same hint breakdown, as a post-hoc explanation rather than in-the-moment
  help.

## Why
Keeps each tier's "no hint" / "hint" behavior legible as a single knob per
level, rather than a difficulty setting plus a separate independent hint
toggle that could contradict it (e.g. "hard mode with hints on" being
unclear whether that means before or after the tries run out).

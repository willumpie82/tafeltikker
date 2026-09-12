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
- A hint is shown automatically going into the 3rd/final attempt, using
  whichever breakdown is actually simpler for that multiplier (see below) —
  help arrives *before* the last try, but never states the final numeric
  answer.
- Answering correctly on try 1 or 2 never shows a hint. If the final try is
  answered correctly, the session moves on immediately (no forced pause to
  read a hint that already did its job); only a wrong final try pauses
  auto-advance so there's time to read the "post-hoc" explanation.

## Moeilijk (numpad, 3 tries, no help while solving)
- Same numpad + 3-attempt structure as Gemiddeld, plus an 8s-per-try
  countdown — running out of time marks that try wrong.
- No hint is shown during any of the 3 attempts — the child gets no help
  while actually solving the question.
- Only once all 3 tries are wrong does it reveal the correct answer *and*
  the same hint breakdown, as a post-hoc explanation rather than in-the-moment
  help, and auto-advance pauses (with a "klik op Volgende" prompt) so there's
  time to actually read it.

## Hint breakdown strategy
Decomposing every multiplier via the nearest ×5/×10 anchor breaks down for
small multipliers: 3×2 would hint "3×5=15, 3×3=9, 15−9=?" — a detour through
bigger numbers than the exercise itself. So the anchor decomposition is only
used when the anchor is a genuine simplification:
- multiplier 1, 5, or 10 → no hint needed, it's already simple.
- multiplier 2, 3, or 4 → plain repeated addition (e.g. 3×2 → "3 + 3 = ?").
- multiplier 6–9 → nearest ×5/×10 anchor as before (e.g. 7×8 → "7×10=70,
  7×2=14, 70−14=?"; 6×7 → "7×5=35, 7×1=7, 35+7=?").

## Why
Keeps each tier's "no hint" / "hint" behavior legible as a single knob per
level, rather than a difficulty setting plus a separate independent hint
toggle that could contradict it (e.g. "hard mode with hints on" being
unclear whether that means before or after the tries run out).

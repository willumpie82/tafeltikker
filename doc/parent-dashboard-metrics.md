# Parent dashboard: per-fact confidence

Design decision for the "Sommen" section of a child's stats, replacing a
per-table-only view (e.g. "Tafel 3: 5/5 (100%)") that hid whether specific
facts within that table were actually solid.

## What's tracked
`math_attempts.elapsed_ms` — time from when a question is shown to when it's
finally resolved (correct, or after exhausting retries on Gemiddeld/
Moeilijk). Existing rows from before this column existed have `null`, which
the confidence calculation treats as "no speed penalty" rather than
`0` (so old data doesn't look artificially bad).

## Confidence score (0-100%) per table x multiplier fact
```
accuracy = correct / total
speedFactor = clamp(3000ms / avgElapsedMs, 0.5, 1)   // null avgElapsedMs -> 1
confidence = round(accuracy * speedFactor * 100)
```
A fact solved correctly in ~3s or less scores at its full accuracy. Slower
answers get pulled down, but never below half credit purely for being slow
— getting it right still matters more than speed. A fact never attempted
renders as a distinct empty placeholder rather than a `0%` bar, so "not
practiced yet" doesn't look the same as "struggling with this."

Displayed as one of three color tiers rather than a raw number, so a
glance shows which facts need attention: `high` (>=80%, green), `medium`
(50-79%, orange), `low` (<50%, red).

## Collapsed by default
Each table shows a rollup line — **confidence, not raw accuracy** — so the
dashboard doesn't get taller than before while collapsed: `Tafel 3: 62%
zelfvertrouwen (24/27 goed)`, where the `62%` is the average of that
table's 10 per-fact confidence scores (untried facts count as `0`, same as
the per-fact bars). This was the original intent but the first
implementation collapsed to plain accuracy instead (`Tafel 3: 5/5 (100%)`)
— fixed after it turned out actively misleading in practice: a table
answered correctly but slowly could read "100%" while every bar
underneath it, once expanded, was orange or red. The raw correct/total
count is still shown alongside it for transparency, just no longer as the
headline number.

A "meer ↓" toggle per table reveals a row of 10 bars (one per multiplier
1-10); "minder ↑" collapses it back. All 10 bars are rendered up front
(just hidden) rather than built when the toggle is clicked — building them
reactively inside the click handler ran into the same silent-DOM-drop
issue as the avatar picker fix, so toggling only ever flips `hidden` on
already-existing elements.

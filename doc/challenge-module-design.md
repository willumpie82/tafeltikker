# Challenge module (v1: private, per-child)

Design converged on in chat before any code was written — capturing it here
so the decisions survive independent of chat history. Source request:
`doc/processed.md` will get the resolution note once this is built; this
file is the spec to build against.

## Scope of v1
- One challenge belongs to exactly one child (no shared/sibling challenges
  yet — that's a later phase, see "Deferred" below).
- **Private only.** "Public" (visible to other parents/children) depends on
  a family/group concept that doesn't exist yet — see "Deferred".
- Two challenge types: **time played** and **table confidence**.

## Data model
New table `challenges`:
- `id`
- `childId` (FK)
- `createdBy` (parent id FK)
- `type`: `'time_played' | 'table_confidence'`
- `stickerId`: one of the fixed preset keys (see "Stickers")
- `visibility`: `'private'` for now (column exists so a later "public" phase
  doesn't need a migration, but only `'private'` is ever written/read in v1)
- `targetMinutes` (nullable — `time_played` only)
- `countsMath`, `countsTyping`: booleans (nullable/unused for
  `table_confidence`) — which module(s) count toward the time. "All games"
  is just both `true`.
- `targetConfidence` (nullable — `table_confidence` only), 0-100
- `createdAt`
- `startedAt` — where the counter/window begins; equals `createdAt`
  initially, overwritten to "now" on a manual reset
- `completedAt` (nullable) — set once, never cleared except by an explicit
  reset

New table `challenge_tables` (many-to-many, same relational style as
`parent_child` rather than a JSON/CSV column):
- `challengeId` (FK)
- `tableNumber`

Used only by `table_confidence` challenges — lets one challenge target a
*set* of tables (e.g. 1-5 first, then a later challenge for 1-7), not just
one.

## Time-played challenges
```
progressMinutes = sum(practiceSessions.durationSeconds) / 60
                   where childId = X
                   and startedAt (session) >= challenge.startedAt
                   and module in (whichever of math/typing the challenge counts)
```
Multiple time-played challenges can run concurrently and independently
(e.g. issuing bronze/silver/gold tiers — 30min/2h/6h — all at once, each
with its own `startedAt`, each counted separately). Completing one doesn't
affect the others.

## Table-confidence challenges
```
tableConfidence(tables) = average of factConfidence(fact) for every
                           multiplier 1-10 in every selected table
                           — an untried fact counts as 0, not skipped
```
Reuses the existing per-fact `factConfidence` formula from
`parent-dashboard-metrics.md` (accuracy × speed, 0-100). Averaging across
*all* facts in the selected tables (not just attempted ones) is the load-
bearing decision here: it's what stops a child from "completing" a
table-set challenge by only drilling the facts they already find easy while
ignoring the rest.

This is also the answer to a real exploit noticed during testing: Makkelijk
(multiple choice) locks the options after one click, so there's no
try-all-4-in-one-screen shortcut — but a wrong answer gets requeued to
reappear later in the same session with fresh distractors, so a fact *can*
end up "done" in that session's table checklist after 2-4 lucky guesses
across reappearances. Rolling confidence is resistant to this because every
one of those wrong attempts still drags down that fact's average — a late
lucky guess doesn't erase the earlier misses the way a single-session score
would.

## Completion
Not a live/recomputed check — a permanent snapshot. Evaluated at the two
natural checkpoints where the underlying numbers change:
- after every math attempt insert (`table_confidence` challenges)
- after every practice session finish (`time_played` challenges)

For each of the child's active (`completedAt is null`) challenges of the
relevant type, recompute progress; if the target is now met, write
`completedAt = now()`. Once set, later attempts can never un-complete it —
progress dropping after completion (e.g. a bad session later) doesn't
revoke the sticker.

## Reset
A parent action, not automatic. Resetting a challenge clears
`completedAt` back to `null` and sets `startedAt = now()` — same challenge
definition (type, target, sticker), fresh counter.

## Stickers
Fixed preset list, not a custom upload or child-chosen-at-completion —the
parent picks one when *creating* the challenge, as the promised reward:

| key | icon | label |
|---|---|---|
| `award_bronze` | 🥉 | Brons |
| `award_silver` | 🥈 | Zilver |
| `award_gold` | 🥇 | Goud |
| `youtube` | ▶️ | YouTube kijken |
| `gaming` | 🎮 | Gamen |
| `candy` | 🍬 | Snoep |
| `cookie` | 🍪 | Koekje |

Same pattern as `avatars.ts` (`AVATAR_EMOJI` + `emojiFor`) — a small static
map, no asset management needed.

## UI surfaces
- **Parent dashboard**: a "Uitdagingen" section per child — list of active/
  completed challenges with progress, a creation form (type, target(s),
  module(s) or table(s), sticker), and a reset action per challenge. This is
  also the "dashboard shows challenge progress (table)" ask from the
  original request.
- **Child side**: a small persistent widget showing active challenges +
  progress, visible on exactly three screens — home (game select), math
  settings, typing settings — not the exercise or summary screens, which
  stay focused. Table-set selection in the creation form reuses the
  existing math-settings table-picker component/style.

## Deferred (explicitly out of scope for v1)
- **Per-group challenges** (a teacher/group-admin issuing one challenge to
  everyone in a group) — needs the group/tag concept below to exist first.
- **Public visibility** ("show sticker on user icon" to other parents) —
  depends on the same group concept, *and* on fixing a real pre-existing
  gap found while discussing this: `/api/child/avatars` (the child login
  screen) currently returns every child in the database with no family/
  group scoping at all. That's invisible today with one family on the
  instance, but breaks the moment a second family registers. Building
  "public" before that scoping exists means building a social feature on a
  foundation that doesn't yet know what "a family" is — tracked as its own
  item in `new-functionality.md` (the `/[grouptag]` URL idea).

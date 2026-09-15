# Groups — manual test plan

Covers whatever's newly built from `groups-design-plan.md` that hasn't
had a manual click-through pass yet. Automated e2e coverage
(`e2e/groups.spec.ts`, `e2e/group-gate.spec.ts`, `e2e/group-invite.spec.ts`)
is the durable regression guard; this doc is for a human pass on top of
that, same style as `test-plan.md`.

Checking a box here is what promotes an item in `groups-design.md` from
`FIXED` (code changed) to `RESOLVED` (verified) — see that doc's status
key. Once every item in a step's section here is checked, that section
gets archived: move it (or a condensed summary) into
`doc/groups-design-done.md` and delete it from here, so this doc only
ever shows what's currently pending verification. Steps 1-6 plus two
rounds of manual-QA feedback ([#235]-[#285]) already went through this
cycle and live in `groups-design-done.md` now.

Setup: `npm run dev` in `app/`, logged in as `admin`/`wachtwoord123`
(system_admin). Seeded children: Sam/1234, Robin/4321.

## Nothing pending right now
Steps 1-6 are built, tested, and fully verified. Steps 7-9 (see
`groups-design-plan.md`) aren't built yet — add a new numbered section
here once one of them has code to click through, mirroring the level of
detail in `groups-design-done.md`'s entries (concrete steps + expected
result, not just a feature name).

## Known gaps — not built yet, don't test
- **Step 7 (roster polish)**: collapsible per-group sections when an
  admin manages more than one group, pending invites shown inline in the
  roster list itself (currently a separate list), a friendlier in-roster
  "add" affordance, and invite-list collapse + a delete/cleanup action
  for groups with many invites (`groups-design.md` [#251]).
- **Step 8 (parent dashboard visibility)**: a parent's own dashboard does
  not yet show which group(s) each child belongs to, or who administers
  each one. The leave-a-group backend endpoint
  (`DELETE /api/parent/children/:id/groups/:groupId`) already exists but
  has no UI hooked up to it yet.
- **Step 9 (group lifecycle management)**: no UI or endpoints yet for a
  group-admin to enable/disable a group or rename it, or for a sys-admin
  to also edit/remove/rename the slug of an existing group
  (`groups-design.md` [#236]).
- Promoting a second parent to group-admin of an existing group, and
  per-group challenges — both explicitly deferred in the design doc, not
  part of the plan at all right now.

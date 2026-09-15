# Groups — resolved feedback

Items from `groups-design.md`'s "New requirements" list that reached
`RESOLVED` (fixed *and* manually verified via `group-design-test.md`) get
moved here, so that doc's outstanding list stays short. Kept for history —
nothing here needs re-reading unless you're tracing why something behaves
the way it does.

All items below were verified via a full manual click-through of
`group-design-test.md` §1-7 (all boxes checked) on top of the automated
suite (36/36 passing at the time).

## Round 1 (secret UX, admin UI polish, invite-flow clarity)

- [#235] **RESOLVED** — the group secret should remain visible to
  group-admins; the reveal was also confusing across multiple groups.
  Decided against making the secret recoverable (kept the hash-only
  "shown once" model — reversible storage would mean a DB leak exposes
  every group's live secret). Instead the reveal now happens inline on
  that group's own row (no more disconnected panel), with "Bewaar deze
  code goed" copy, plus a one-click "Regenereer geheim" (with a confirm
  warning that the old one stops working) for the forgot-it case.
- [#237], [#239] **RESOLVED** — the slug was shown next to the roster
  button instead of the name, and two groups with the same display name
  but different slugs were hard to tell apart. Slug now sits right after
  the name as a clickable link to that group's actual page (opens in a
  new tab).
- [#238] **RESOLVED** — name/slug fields were confusing with no
  explanation. Added a "? Wat is een slug?" toggle under the slug field
  on the create-group form.
- [#240] **RESOLVED** — invalid-slug error didn't point at the slug
  field. Now a specific inline message naming the character rule, plus a
  helper line under the field itself. Also fixed a real bug found along
  the way: the slug input's HTML `pattern` attribute was an invalid
  regex under newer browsers' Unicode-mode pattern matching (unescaped
  `-`), silently disabling native validation.
- [#241] **RESOLVED** — creating a group invite showed its link twice
  (a reveal box, then again in the list). Removed the separate reveal
  box; the new invite is now just highlighted in the list where its link
  already lives.
- [#242] **RESOLVED, real bug** — invite links weren't always absolute.
  `baseUrl()` used `??`, which doesn't fall back on an empty-string env
  value (`PUBLIC_BASE_URL=` in `.env` counts as "set") — every generated
  link was silently relative. Fixed to fall back on empty string too.
- [#243] **RESOLVED** — a group's name is now clickable to expand/
  collapse its roster, same action as the "Rooster beheren" button.
- [#244] **RESOLVED** — removing a child from a group's roster now asks
  for confirmation first (native `confirm()`).
- [#247] **RESOLVED** — "Bekijk rooster" implied browsing, not managing.
  Renamed to "Rooster beheren".
- [#248] **RESOLVED** — an unknown slug's page returned HTTP 200 with
  only the API underneath 404ing, letting a scanner distinguish "real
  group, wrong secret" from "no such group" by page status alone. Now
  returns an actual 404 status for the page itself, same friendly "niet
  gevonden" content.
- [#249] **RESOLVED** — a group's landing page had no group-name
  context. Avatars/gate-unlock endpoints now return the group's name,
  shown as "Welkom bij {naam}, klik op je naam om door te gaan" above
  the tile grid.
- [#250], [#252] **RESOLVED** — the invite-accept flow's new-child form
  and manual-picker never showed *which* child (by name) was being
  created/matched, especially confusing when the parent's other,
  differently-named children were visible in the same picker. Both the
  new-child form heading and the manual-picker heading now show the
  invite's actual child-name throughout Stap 2.
- [#253] **By design, not a bug** — an admin can create more than one
  invite with the same child-name in a group. Intentional: the design
  doc's own step 5 lets this happen (real classes have two kids sharing
  a first name), and the accept-time collision check (step 6) is what
  catches it before two identical tiles land in one roster. Nothing
  prevents *creating* the duplicate up front on purpose.

## Round 2 (a real cross-family leak, layout, invite-flow context)

- [#282] **RESOLVED** — the avatar tile grid was a stretchy CSS-grid
  (`auto-fit`/`1fr` columns) that filled the row width regardless of
  tile count, looking wrong for a small family/class. Switched to a
  wrapped, centered flex layout with fixed-size square tiles.
- [#283] **RESOLVED** — an already-logged-in parent opening an invite
  link silently skipped Stap 1 straight to Stap 2, which felt like it
  "came from thin air." Now shows an explicit "Je bent ingelogd als X —
  doorgaan, of uitloggen en opnieuw?" step, plus a persistent Ouder/
  Kind/Klaar progress indicator across the whole flow.
- [#284] **RESOLVED, real bug — the most serious of both rounds** — the
  child logout button unconditionally called the *ungrouped*
  `/api/child/avatars`, so logging out from inside a group silently
  swapped the tile grid to every child in the database. Exactly the
  cross-family leak groups exist to prevent. Fixing it surfaced a
  second, subtler bug caught by the new e2e test: naively re-checking
  the trust-gated endpoint on logout wrongly re-gated an unlock that had
  no "Onthouden" checked, contradicting the already-established "unlocks
  for this pageload" rule (an unremembered unlock's reveal comes from
  the login response body, not a trust cookie the re-check can see).
  Fixed via a client-side cache of the just-unlocked roster for the
  pageload's lifetime, redisplayed on logout rather than re-fetched.
  Also hardened both avatars endpoints with `Cache-Control: no-store`.
- [#285] **RESOLVED, a real bug in the hardening, not the original
  concern** — the 404 status on an unknown slug was always correct
  (confirmed via curl before *and* after); a screenshot of the rendered
  "niet gevonden" page was never evidence of a problem, since that
  content renders regardless of status code. The `Cache-Control:
  no-store` header added to harden against back/forward-cache reuse,
  however, silently never took effect: `@fastify/send` unconditionally
  sets its own `Cache-Control` header when streaming a file, overwriting
  a plain `reply.header()` call made beforehand. Fixed by passing
  `{ cacheControl: false }` to `sendFile()` itself. Now covered by a
  direct assertion on the response status/header in
  `e2e/group-gate.spec.ts` — rendered content alone wouldn't have caught
  this class of bug.

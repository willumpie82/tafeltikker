# Groups (classrooms / families) — access & login design

**Status: proposed — not yet built.** Written as the spec to build against,
before any code exists, same as `challenge-module-design.md` was for the
challenge module. This doc covers the login/security shape only — group
creation, group-admin management UI, and per-group challenges are sketched
under "Deferred / open questions" below but not fully designed yet.

## Motivation

Today the app is single-tenant: one instance, one family, and
`/api/child/avatars` (the child login screen) returns *every* child in the
database with no scoping at all. That's invisible with one family on an
instance but breaks the moment a second, unrelated family/classroom shares
one (already flagged as a pre-existing gap in `challenge-module-design.md`'s
"Deferred" section). Groups is the concept that fixes that scoping *and*
enables the features that want it — a teacher issuing one challenge to a
whole class, kids in the same class seeing each other's badges, a
`/[groupslug]` URL a classroom device can be bookmarked to.

## What "being in a group" enables

Once a device is validated for a group, it can see **all children's tiles
in that group** — deliberately, not just the current family's. This is
what lets group-level features work later (a shared challenge, a class
leaderboard/achievement view). This is the piece that makes access control
matter: showing a full child roster to the wrong audience is a real
privacy problem, not just an inconvenience.

## The core threat and why the obvious answers don't work

The obvious approach — type/URL a human-readable group slug (e.g.
`de_fonkel_5a`) and see that group's kids — fails because the slug is
**public and guessable/known by design** (a teacher hands it out, sibling
classes can guess each other's, it needs to work as a memorable URL). Two
tempting-but-wrong fixes, and why they don't hold up:

- **Treat the slug itself as the secret.** It can't be both a memorable,
  shareable URL *and* a secret — the moment it's shared once (which is the
  whole point of a slug), anyone who ever saw it can enumerate that group's
  children's names indefinitely, with no way to revoke just that leak
  without also breaking the URL for everyone legitimate.
- **Gate the roster behind a device cookie set once via a parent's invite
  click.** This closes the slug-leak problem, but doesn't survive real
  usage: a child accesses the app from multiple devices (school
  Chromebook, a parent's laptop for typing, a home tablet/phone), and none
  of those devices would carry another device's cookie. Re-inviting per
  device isn't realistic, especially for shared classroom hardware a
  teacher sets up once for an entire class.

## The design

**Separate the public routing slug from a real, rotatable secret.** The
slug (`/de_fonkel_5a` or typed into the mainpage) only identifies *which*
group's gate to show — it grants no access by itself. Landing on a group
with no existing trust for it shows a gate screen with **two independent
unlock paths**, either of which is sufficient:

1. **"Klas geheim"** — a short group-wide access code (like a wifi
   password: a handful of random characters, not a guessable class name),
   generated when the group is created and shown to the group admin
   (teacher) to hand out however suits them (verbally, on paper, in a
   class group chat). Anyone who enters it correctly unlocks the roster on
   that device. Rotatable if it leaks, without needing to re-invite anyone
   — regenerating it just means the group admin redistributes the new one.
2. **Ouder login** — a parent's existing username/password (the same
   credentials as the real parent dashboard). Convenient for a parent's
   own devices, since they already know their login and don't need the
   class secret at all.

Both paths end at the same outcome (this device may see this group's
roster) and both get a **"Onthouden voor deze groep"** checkbox — opt-in,
not automatic, and explicitly scoped in its own label so nobody assumes it
remembers their login generally or trusts the device beyond this one
group's roster. Trust is stored **per group**, keyed to the group's id —
a device trusted for group A's slug is not trusted for group B's just
because someone also knows or guesses group B's slug.

### The parent-login path is narrower than the real parent login

Logging in here must **only** prove "this parent has a child in this
group" and set the group-trust cookie — it must **not** establish a full
parent-dashboard session. A parent unlocking a shared classroom Chromebook
this way should not leave that device able to see their child's practice
progress or account settings afterward; that's a materially more
sensitive scope than "can see this group's kid tiles," and stays behind
the existing, separate Ouderportaal login. Concretely: this is a distinct,
narrow check (credentials in, yes/no + group-trust cookie out), not a
reuse of the endpoint that opens the dashboard.

If the login is valid but the parent has no child in the target group,
show the same failure as an invalid login — **"Geen kind in deze
groep"** — for both cases (wrong password, and right password but wrong
group), so a wrong guess never reveals whether a given username exists at
all.

### Flow summary

1. User reaches a group via the mainpage (types a group name) or a direct
   `/[groupslug]` URL.
2. No existing per-group trust cookie → show the gate: "Klas geheim" field
   *or* "Ouder login" fields, each with its own "Onthouden voor deze
   groep" checkbox.
3. Either path succeeding sets (if checked) the per-group trust cookie and
   reveals the group's full avatar-tile roster.
4. From there, login proceeds exactly as it does today — tap your tile,
   enter your PIN. Nothing about the child-facing login itself changes.

## Group creation

Only `system_admin`/`user_admin` can create a group, via the admin area —
not self-service by any parent, matching how child/parent creation already
works in this app (one consistent "admin sets things up" pattern, and no
open group-creation spam surface).

- **Fields**: display name, slug (auto-suggested from the name, admin-
  editable, validated for uniqueness and URL-safe characters — lowercase,
  digits, `-`/`_`).
- **Group admin is a per-group relation, not a global role.** A new
  `group_admins` join table (`groupId`, `parentId`) records who
  administers a given group — separate from and unaffected by the existing
  instance-wide `parents.role` enum (`parent | user_admin | system_admin`).
  A parent can be a group admin for one group and an ordinary member of
  another. The creating admin picks who the group's first admin is (often
  themselves, if they're also a parent).
- **"Klas geheim" is auto-generated at creation time** — random, ~6-8
  characters, excluding visually-ambiguous ones (`0`/`O`, `1`/`l`/`I`) —
  shown once to the group admin with a "regenereer" action. Never
  admin-typed, so it's never accidentally weak or guessable.

## Joining a group (invite-link flow) — v1 scope

For v1, **invite-link is the only join path** — a dashboard-visible
accept/decline card for parents who already have an account is real but
explicitly deferred (see below). It's not just that invite-link alone
already covers both the new- and existing-parent cases — inviting-by-
username would require the group admin to know or look up *which account*
belongs to a given parent, which they shouldn't need to know or have
visibility into at all. Invite-link needs none of that: the group admin
just generates a link scoped to a child's name and hands it out (however
suits them), and the system works out whether that's a new or existing
parent entirely at accept-time, with zero extra thought or lookup required
from the admin.

The design gap an earlier pass missed: an invite only got a parent
*account* linked to a group, with nothing ensuring a *child* ends up
correctly linked too. Fixed by scoping each invite to a specific child, not
just a bare group link — the group admin already knows their own roster,
so let that be the source of truth the accept flow confirms against,
rather than asking the parent to self-identify from scratch.

1. **Group admin creates the invite**: picks the group and types the
   child's name as they know it (spelling doesn't need to be exact — see
   fuzzy matching below), and gets a single-use, expiring link (same token
   mechanism as the existing parent-invite system) to hand to that child's
   parent however suits them.
2. **Parent opens the link** → logs in (existing account) or registers
   (new account) — same choice as today's registration screen, but
   presented as two explicit, clearly-labeled steps rather than one form:
   - **Stap 1: Jouw account** — parent credentials.
   - **Stap 2: [invite's child name]'s account** — everything below.
3. **Existing parent — fuzzy match.** The invite's child-name is
   fuzzy-matched (word-based, case-insensitive — "Tim" matches within
   "Tim Oldemans") against that parent's existing children. A confident
   best match shows an explicit confirmation screen with the child's
   avatar + name — **"Is dit [avatar] [naam]?" (Ja/Nee)** — never
   auto-linked silently. Confirming adds that child to the group (a child
   can belong to more than one group at once — see "Data model" below).
   Declining, or no confident match, falls through to a manual checklist
   of the parent's other children plus "+ nieuw kind toevoegen".
4. **New parent, or no match**: a child is auto-created using the invite's
   child-name and added to the group — the parent's remaining work is just
   picking an avatar and setting the child's PIN, not re-entering
   identity/group details the invite already pinned down.
5. **Name-collision check**: whichever child is about to be confirmed/
   created (steps 3-4), check whether that *display name* already exists
   among the group's other current members. If so, prompt to add a
   distinguishing bit (typically a last initial, e.g. "Tim O.") before
   finishing — real classes do have two kids with the same first name, and
   two identical tiles in one group's roster is genuinely confusing for a
   child picking their own. No prompt at all when there's no collision, so
   the common case stays frictionless.
6. **Success screen states plainly what happened** (e.g. "Tim is
   toegevoegd aan De Fonkel 5A") rather than silently landing on the
   dashboard.
7. [**new**] the parent can see to what group(s) the kid is assigned (=transparancy) is theire dashboard. not sure if parent can manage those subscriptions

## Data model

A child can belong to **more than one group at once** — a new
`group_children` join table (`groupId`, `childId`), mirroring the existing
`parent_child` many-to-many pattern, rather than a single `groupId` column
on `children`. Nothing here auto-removes a child from a group they're
already in; a group admin who needs their roster kept current (e.g. a kid
who's genuinely moved classes) does that as an explicit "remove from
roster" action in their own group's admin view — ownership of that cleanup
sits with the group admin, not the join flow.

**Monkey-proofing this deliberately**: two clearly-labeled steps (own
account, then child's account); every child-matching decision is an
explicit yes/no confirmation showing avatar + name, never inferred or
silently applied; and it ends on a named summary, not a bare redirect —
because a confused parent here is creating/confirming *two* accounts in
one sitting, not one.

## Deferred / open questions

Not resolved by this doc — real product decisions still needed before
building:

- **Exact fuzzy-match algorithm/threshold** (how different the invite's
  spelling can be from a stored name before it stops suggesting a match) —
  implementation detail, not designed yet.
- **Per-group challenges** and **public sticker/achievement visibility**
  (both already flagged as deferred in `challenge-module-design.md`,
  pending this doc) — become buildable once group membership exists, but
  the actual UI/rules aren't designed yet.
- [#218] group-admin dashboard ui design
    - one group admin can have multiple groups, or one group can have multiple group-admins (e.g. stand-in teacher, flow TBD)
    - collabsable table per group (if multiple)
    - add button on top of a group table
    - remove button behind each member
    - invite state pending display Tim (invited)
    - per group challange (as per kid dashboard)
  — **OPEN**: this is step 7 of `groups-design-plan.md` (roster polish), not yet built. Multi-admin-per-group and per-group challenges stay explicitly deferred beyond that, same as noted above.

**Decided against, not just deferred:** a dashboard-visible accept/decline
card as a second join path for already-registered parents. Beyond
invite-link alone already covering both cases, inviting-by-username would
require the group admin to know or look up which account belongs to a
given parent — real extra thought/lookup for no benefit invite-link doesn't
already provide.


## New requirements:
**Status key**: `FIXED` = code changed, not yet verified — a real person
still needs to click through it (see `doc/group-design-test.md`).
`RESOLVED` = verified working via that manual pass; once an item reaches
`RESOLVED` it gets moved out of this list into `doc/groups-design-done.md`
so this section stays focused on what's still outstanding. `OPEN` = not
built at all yet. Fixed ≠ tested — don't conflate the two.

- [#235] the group secret should be remain visible to the group-admin(s) that have access to it, maybe use an '*' field with a 'laat geheim zien' button. The way the secret is show is also confusing when multiple groups exist, visually the field/block is not part of a group and doesn;t show what group it belongs to, the show/reveal button on the group block will solve this
  — **FIXED, decided against full reveal**: kept the hash-only "shown once" security model rather than making the secret recoverable — reversible storage would mean a DB leak exposes every group's live secret. Instead: the reveal now happens inline on that group's own row (no more disconnected panel), with "Bewaar deze code goed" copy, plus a one-click "Regenereer geheim" (with a confirm warning that the old one stops working) for the forgot-it case.
- [#236] edit/remove/disable group on admin page, group-admin can only enable/disable group or update name (not slug). sys-admin can edit/remove/enable/disable/rename (incl slug)
  — **OPEN**: real scope (active/disabled state + role-split PATCH/DELETE endpoints), not part of this pass.
- [#237] now the /slug is shown next to the x kinderen /bekijk rooster button, lets move that to the left side as part of the name e.g. NAME (base-url/slug), makes it easier to copy,and make it a link to the group landing page
  — **FIXED**: slug now sits right after the name as a clickable link to that group's actual page (opens in a new tab).
- [#238] the name and slug field can be confusing, should we add e.g. a "?" behind the field, when clicked explaining what it does, e.g. show the URL style**
  — **FIXED**: added a "? Wat is een slug?" toggle under the slug field on the create-group form.
- [#239] a group with the same name can be created unless the slug is identical, moving the slug as part of the group-box title can fix the unclarity it creates when multiple same names exist
  — **FIXED**: same fix as #237 — the slug is now always visible next to the name.
- [#240] the error when an invalid slug is entered is confusing (not pointing to the slug), generate proper error message (e.g. the slug requirements)
  — **FIXED**: specific inline message naming the character rule, plus a helper line under the field itself. Also fixed a real bug found along the way: the slug input's HTML `pattern` attribute was an invalid regex under newer browsers' Unicode-mode pattern matching (unescaped `-`), silently disabling native validation.
- [#241] when creating group-ivite, the invite is shown twice, once "Deel deze link met de ouder van tim:" and other "tim: \n verloopt... \n link, 
  — **FIXED**: removed the separate reveal box for group invites; the new invite is now just highlighted in the list where its link already lives.
- [#242] make sure all links shown include base-url
  — **FIXED, real bug**: `baseUrl()` used `??`, which doesn't fall back on an empty-string env value (`PUBLIC_BASE_URL=` in `.env` counts as "set") — every generated link was silently relative. Fixed to fall back on empty string too.
- [#243] on the admin page make name of the group clickable to expand it
  — **FIXED**: the name is now clickable, same action as the "Rooster beheren" button.
- [#244] removal of a kid from a group should need confirmation
  — **FIXED**: native confirm() before the roster-removal request fires.
- [#245] cannot see the group membership of a kid on the parent dashboard (should also include "koppeling verwijderen", with confirmation)
  — **OPEN**: this is step 8 of `groups-design-plan.md`, not yet built. The "koppeling verwijderen" backend endpoint already exists (`DELETE /api/parent/children/:id/groups/:groupId`, from step 3) — step 8 just needs to wire up the display + this button + a confirm, per this note.
- [#246] showing group membership should include the name of the group-admin and group slug
  — **OPEN**: folded into step 8's scope above — the read query will need to join through `group_admins` too.
- [#247] the name "bekijk rooster" suggests that it will browse to the actual rooster iso managing it change name to "rooster management"
  — **FIXED**: renamed to "Rooster beheren".
- [#248] when an non-existing group is entered just repond with e.g. a 404, makes it less obvious for scrapers what the base-irl/whatever does
  — **FIXED**: an unknown slug's page now returns an actual 404 status (previously always 200, with only the API underneath 404ing) — same friendly "niet gevonden" content, different status code.
- [#249] on a group page show the group name on top, "welkom bij fonklel 5a, klik op je naam om door te gaan"
  — **FIXED**: avatars/gate-unlock endpoints now return the group's name, shown as "Welkom bij {naam}, klik op je naam om door te gaan" above the tile grid.
- [#250] on the group invite flow, new parent, new kid the suggested kid name shows "nieuw kind" iso "sjeng"
  — **FIXED**: the new-child form heading and the manual-picker heading both now show the invite's actual child-name.
- [#251] invite list: on a 20+ kid group this clutters the UI, hide them e.g. in a collapst field, so the group-admin can check the status, also add a 'delete' option to the group admin to clean-up the list
  — **OPEN**: real scope (a delete-invite endpoint doesn't exist yet), left for step 7 alongside the rest of the roster-polish work.
- [#252] I created an invite for pietje, opened the link as peter (existing parent), but now suggest to add sjeng (already kid of peter), if +nieuw... is clicked it is not obvious (same as prev comment) that pietje will be added
  — **FIXED**: same fix as #250 — this was the manual-picker path specifically, now also shows the invite's child-name throughout Stap 2, not just at the very top.
- [#253] I can create more than one 'sjeng' invites
  — **By design, not a bug**: this is intentional — the design doc's own step 5 lets an admin create same-named invites (real classes have two kids with one first name), and the accept-time collision check (already built, step 6) is what catches it before two identical tiles land in one roster. Nothing prevents *creating* the duplicate up front on purpose.
- [#281] cannot promote user to group-admin
  — **OPEN**: this is the same gap already named in the "Deferred / open questions" section above ("the flow for promoting a second parent to group-admin of an existing group isn't designed") — not a new decision, just a duplicate report confirming it's still missing. Folds into #236's scope (group edit/admin management).
- [#282] the tiles on the group landing page are filled over the entire width (possibly also on other rooster pages?), lets make them uniformly square, a single accout is a centered row, max 6 per row (first row <6 centeres ), row >2 (not centered anymore, nice matrix view squared view) (the entire matrix is centered on the page)
  — **FIXED**: switched the avatar grid from a stretchy CSS-grid (`auto-fit`/`1fr` columns, which fills the row width regardless of tile count) to a wrapped, centered flex layout with fixed-size square tiles — naturally forms a centered matrix at any count instead of stretching.
- [#283] the invite flow for a parent into a group: when parent is logged in, 'stap 1' is skipped, 'stap 2' is directly shown, I think it is good to not skip 'stap 1' if parent already logged in ask confirmation, also show a 'nice progress bar with the steps [---ouder---|---kind---|---klaar---], than it is more clear to the parent why they are part of the flow, and step2 doesn't come from thin air
  — **FIXED**: an already-logged-in parent now sees an explicit "Je bent ingelogd als X — doorgaan, of uitloggen en opnieuw?" step before Stap 2, plus a persistent Ouder/Kind/Klaar progress indicator across the whole flow.
- [#284] something strange happens on the group page: when refreshed it shows 5 tiles (correct as per admin page); I select a kid (freek.N) and login (1111), when ik sign-out 7 kids are shown on the group page, bug or caching issue?
  — **FIXED, real bug (not caching)**: the child logout button unconditionally called the *ungrouped* `loadAvatars()` regardless of context — logging out from inside a group silently swapped the tile grid to every child in the database (the exact class of leak groups exist to prevent), not the group-scoped roster. Fixing this surfaced a second, subtler issue caught by the new e2e test: naively re-fetching via the trust-gated endpoint on logout wrongly re-gated an unlock that had no "Onthouden" checked, contradicting the already-established "unlocks for this pageload" rule (an unremembered unlock's reveal comes from the login response body, not the trust cookie, so it can't be re-derived from a fresh trust check later in the same pageload). Fixed by caching the just-unlocked roster client-side for the pageload's lifetime and redisplaying from that on logout, only falling back to a fresh gate check if nothing was cached yet (e.g. an existing child session from a prior pageload). Also hardened both avatar endpoints with `Cache-Control: no-store` as defense in depth.
- [#285] no 404 shown on wrong slug (caching?)
  — **FIXED, a real bug in the hardening (the 404 status itself was always correct)**: a fresh request always correctly returned 404 (confirmed via curl, including with a matching `If-None-Match` to rule out conditional-GET weirdness) — so a screenshot of the friendly "niet gevonden" page is not itself evidence of a problem, since that content renders regardless of status code. The `Cache-Control: no-store` hardening added to address the back/forward-cache theory, however, silently never took effect: `@fastify/send` unconditionally sets its own `Cache-Control` header when streaming the file, overwriting a plain `reply.header()` call made beforehand. Fixed by passing `{ cacheControl: false }` to `sendFile()` itself so nothing overrides it. Now covered by a direct assertion on the response status/header in `e2e/group-gate.spec.ts` (rendered content alone wouldn't have caught this).

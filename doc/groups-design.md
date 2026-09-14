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

## Deferred / open questions

Not resolved by this doc — real product decisions still needed before
building:

- **How group admin is modeled.** Almost certainly *not* a value in the
  global `parents.role` enum (`parent | user_admin | system_admin`) — those
  are instance-wide roles, while a group admin (teacher) should only
  administer their own group(s). Likely a per-group relation instead (e.g.
  a `group_admins` join table), but not designed here.
- **How a parent joins a group in the first place** (as opposed to
  unlocking the *view* of a group they're already in, which is what this
  doc covers). `new-functionality.md`'s existing notes sketch an
  invite-link flow (reusing the parent-invite pattern) and a
  dashboard-visible pending accept/decline card — neither fleshed out yet.
- **Group creation UI**, uniqueness checks for group slugs/child names
  within a group, and whether `/api/child/avatars`' current
  no-scoping-at-all behavior gets fixed as part of this work or
  separately (it should — see "Motivation" above).
- **Per-group challenges** and **public sticker/achievement visibility**
  (both already flagged as deferred in `challenge-module-design.md`,
  pending this doc) — become buildable once group membership exists, but
  the actual UI/rules aren't designed yet.

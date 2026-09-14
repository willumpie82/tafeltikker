# Groups (classrooms/families) — implementation plan

## Context
Tafeltikker is single-tenant today: one instance, one family, and
`GET /api/child/avatars` (the child login screen) returns *every* child in
the database with no scoping at all — invisible with one family on an
instance, but a real privacy problem the moment a second, unrelated
family/classroom shares one. Groups is the concept that fixes that scoping
and unlocks group-level features later (a teacher issuing one challenge to
a whole class, kids in the same class seeing each other's badges). The
full design — including the security rationale for why the obvious
approaches (slug-as-secret, device-cookie-via-invite-click) don't hold up —
was worked out with the user over several rounds and is written up in
`doc/groups-design.md`. This plan is purely about turning that already-
approved design into buildable steps; **do not re-litigate any decision
already made in that doc** (link-only invites, per-group cookie trust, the
narrow parent-login check, multi-group-per-child, etc.) — read it first for
full context, this plan only adds the concrete file-level breakdown plus
two decisions made after that doc was written:
- **Slug routing is a path segment (`/[slug]`)**, not a query param —
  chosen over `?group=slug` despite requiring new server plumbing, to match
  the original `/[grouptag]` intent.
- Reused two verified existing patterns instead of re-deriving them: the
  `parent_invites`/admin-invite-generation pattern in `app/src/routes/
  admin.ts`, and the `@fastify/secure-session`-only cookie convention in
  `app/src/auth/session.ts` (no `@fastify/cookie` anywhere in this codebase
  — don't introduce it).

Seven steps below, one commit each, each independently buildable and
covered by at least one new `app/e2e/*.spec.ts` file, matching this
project's established convention (dedicated e2e port/DB, single worker,
helpers in `e2e/helpers.ts`/`e2e/db.ts`).

## Step 1 — Data model
**Files:** `app/src/db/schema.ts`, generated migration (`npm run
db:generate`, don't hand-write).

Four new tables:
```ts
export const groups = sqliteTable("groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  secretHash: text("secret_hash").notNull(), // "klas geheim" — hashed like a PIN via hashSecret(), never stored/returned plaintext after creation
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const groupAdmins = sqliteTable("group_admins", {
  groupId: integer("group_id").notNull().references(() => groups.id),
  parentId: integer("parent_id").notNull().references(() => parents.id),
}, (table) => [primaryKey({ columns: [table.groupId, table.parentId] })]);

export const groupChildren = sqliteTable("group_children", {
  groupId: integer("group_id").notNull().references(() => groups.id),
  childId: integer("child_id").notNull().references(() => children.id),
}, (table) => [primaryKey({ columns: [table.groupId, table.childId] })]);

export const groupInvites = sqliteTable("group_invites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupId: integer("group_id").notNull().references(() => groups.id),
  childName: text("child_name").notNull(), // as the group admin typed it, before any match/confirm
  token: text("token").notNull().unique(),
  createdBy: integer("created_by").notNull().references(() => parents.id),
  expiresAt: text("expires_at").notNull(),
  usedBy: integer("used_by").references(() => parents.id),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});
```
`groupAdmins`/`groupChildren` mirror the existing `parentChild` join
table's composite-PK style exactly (no surrogate id). Purely additive —
nothing about the existing single-family install changes. No dedicated
e2e spec for this step (nothing user-visible yet); verify with `npm run
db:migrate` against a scratch DB and `tsc --noEmit`.

## Step 2 — Group-trust session + admin guard
**Files:** `app/src/auth/session.ts`, new `app/src/auth/groupTrust.ts`,
`app/src/auth/require.ts`, `app/.env.example`.

A **third** `@fastify/secure-session` entry alongside the existing
`childSession`/`parentSession` (do not add `@fastify/cookie` — nothing in
this codebase uses it):
```ts
{ sessionName: "groupTrust", cookieName: "group_trust",
  key: resolveKey("GROUP_TRUST_KEY"), expiry: 180 * 24 * 60 * 60,
  cookie: { path: "/", httpOnly: true, sameSite: "lax", secure: cookieSecure } }
```
Stores `{ trustedGroupIds: number[] }`. `groupTrust.ts` exports:
- `isGroupTrusted(request, groupId)` — membership check on the array.
- `trustGroup(request, groupId)` — **read-append-write** (`.set()` replaces
  the whole value, so this must merge with whatever's already there) so
  trusting a new group never clobbers previously-trusted ones.

`require.ts` gets `requireGroupAdmin(request, groupId)`: loads `parentId`
from `parentSession` (this is a dashboard-authenticated action), passes if
`system_admin`/`user_admin` (site-wide admins manage any group) **or** a
matching `group_admins` row exists. Inert on its own — no route reads/
writes these yet, which keeps this diff small; step 4 is where it's
actually exercised. No e2e spec yet.

## Step 3 — Group CRUD + admin "Groepen" tab
**Files:** new `app/src/routes/groups.ts`, `app/src/server.ts` (register
it), `app/public/admin.html`, `app/src/client/admin/main.ts`,
`app/public/admin.css`.

Endpoints (manual `requireAdmin`/`requireGroupAdmin` checks at the top of
each handler, exactly like every existing route in `admin.ts` — not a
Fastify preHandler hook):
- `POST /api/admin/groups` — `{ name, slug }`, `requireAdmin` only (site
  admins create groups, per the design doc). Validates slug uniqueness +
  charset (`/^[a-z0-9_-]+$/`). Generates the klas-geheim server-side
  (`randomBytes`, mapped into an alphabet excluding `0/O/1/l/I` — this is
  handwritten/spoken to a class, not pasted as a URL token, so don't reuse
  the base64url invite-token style here), hashes it via `hashSecret`,
  inserts the group + a `group_admins` row for the creating admin. Returns
  `{ id, slug, name, secret }` — **the only response that ever contains
  the plaintext secret.**
- `GET /api/admin/groups` — list with roster count per group (derived via
  join/count, never stored).
- `GET /api/admin/groups/:slug/roster` — child list for a group
  (`requireGroupAdmin`).
- `POST /api/admin/groups/:id/regenerate-secret` — new secret, same
  generation/hash/one-time-reveal rules as creation (`requireGroupAdmin`).
- `DELETE /api/admin/groups/:groupId/children/:childId` — "remove from
  roster": deletes the `group_children` row only, never the child itself
  (`requireGroupAdmin`).

**Leave-a-group, added after initial review**: a parent can also remove
their own child from a group from their own dashboard (`app/src/routes/
parent.ts` — new `DELETE /api/parent/children/:id/groups/:groupId`,
gated via the existing `assertOwnsChild`), not just the group admin. This
needs a `removedByParent` marker distinct from a plain roster deletion —
either a soft-delete flag/timestamp on `group_children` instead of a hard
delete, or a small separate `group_removals` log row — so the group
admin's roster view can show "Tim (verwijderd door ouder)" rather than
the child silently vanishing. Re-adding after this is **not** a simple
undo/re-invite-to-existing-row action — it goes back through the full
invite-link flow (step 6) from scratch, same as any new join. (Exact
soft-delete-vs-log-row schema choice left for implementation; either
keeps step 1's `group_children` composite-PK shape workable.)

Admin UI: new tab following the exact `admin.html`/`admin/main.ts` pattern
already used for Parents/Children/Feedback/Invites (lazy-load on tab
click, `.admin-row` list items). The klas-geheim reveal uses the same
"flash a readonly input, don't make it re-fetchable" pattern already used
for `#invite-result`/`#quick-invite-result`.

**Test (`e2e/groups.spec.ts`):** create a group via the admin UI, see the
secret shown once; duplicate slug rejected; remove-from-roster removes a
child from that group's list without touching the child's account/other
memberships.

## Step 4 — Path-segment routing + group-scoped avatars + gate endpoints
**Files:** `app/src/server.ts`, `app/src/routes/groups.ts`,
`app/src/client/main.ts`, new `app/src/client/group-gate.ts`,
`app/public/index.html`.

**Routing.** `@fastify/static`'s wildcard route and a plain `app.get
("/:slug", ...)` would collide — find-my-way ranks routes static > param >
wildcard, so an unguarded `/:slug` would hijack every existing
single-segment static asset (`/parent.html`, `/app.js`, etc.) regardless of
registration order. Fix: one new route in `server.ts`, right after the
`fastifyStatic` registration, with an explicit allowlist that re-delegates
known filenames to `reply.sendFile()` (the decorator `@fastify/static`
already installs) and treats anything else as a slug:
```ts
const RESERVED_TOP_LEVEL_PATHS = new Set([
  "parent.html", "admin.html", "register.html", "group-invite.html",
  "styles.css", "parent.css", "admin.css",
  "app.js", "parent.js", "admin.js", "register.js", "group-invite.js",
  "favicon.ico",
]);
app.get<{ Params: { slug: string } }>("/:slug", async (request, reply) => {
  const { slug } = request.params;
  if (RESERVED_TOP_LEVEL_PATHS.has(slug)) return reply.sendFile(slug);
  if (!/^[a-z0-9_-]+$/.test(slug)) return reply.callNotFound();
  return reply.sendFile("index.html"); // client reads location.pathname itself
});
```
Verified against the actual `public/` directory listing — this allowlist
is complete. `/healthz` and every `/api/*` route are unaffected (exact
route / multi-segment paths both rank above this).

**Group-scoped avatars** — `GET /api/group/:slug/avatars`: 404 if the slug
doesn't exist, 401 `not_trusted` if `!isGroupTrusted`, otherwise the
group's children joined through `group_children`. **`GET /api/child/
avatars` is left completely untouched** — the ungrouped single-family case
keeps working with zero behavior change; grouped installs use the new
endpoint instead of a modified old one.

**Gate endpoints**, both in `groups.ts`:
- `POST /api/group/:slug/secret-login` — `{ secret, remember? }`,
  `verifySecret` against `group.secretHash`; `remember` calls `trustGroup`.
- `POST /api/group/:slug/parent-login` — `{ username, password,
  remember? }`. Checks credentials **and** that the parent has a child in
  `groupChildren` for this group; **identical failure response either
  way** (`{ error: "no_child_in_group" }`) so a wrong guess never reveals
  whether a username exists. **Does not touch `parentSession`** — this is
  a new, narrow endpoint, not a call to `/api/parent/login`, per the
  design doc's explicit requirement that this path must never grant
  dashboard access.

**Client `init()` in `main.ts`** — new ordering:
```ts
async function init() {
  buildPinPad();
  const meRes = await fetch("/api/child/me");
  if (meRes.ok) { /* unchanged: existing child session always wins */ showView("view-home"); return; }

  const slug = getGroupSlugFromPath(); // location.pathname's first segment, or null for "/"
  if (!slug) { await loadAvatars(); showView("view-avatars"); return; } // today's flow, untouched

  await loadGroupAvatarsOrGate(slug); // GET /api/group/:slug/avatars: 200 → roster, 401 → view-group-gate, 404 → not-found state
}
```
An existing child session always wins regardless of slug — child-facing
login itself doesn't change per the design doc. A child already logged in
who visits a *different* group's URL still lands on their own home view
with no gate check; only logging out and revisiting triggers the slug
branch. `/api/child/login` is **not** modified to add a redundant group
check — the avatars list is already scoped via `group_children`, so a
tile can't appear on an unlocked gate unless the child is genuinely a
member; a `childId`+correct-PIN pair is already sufficient to log in as
that child today, independent of groups, so this isn't new attack surface.

New `<section id="view-group-gate" class="view" hidden>` in `index.html`,
toggled via the existing `showView()` — no changes needed to
`views.ts`. `group-gate.ts` holds the gate's own form logic (secret field
/ parent-login fields, each with its own "Onthouden voor deze groep"
checkbox per the design doc), kept out of `main.ts` to avoid bloating it.

**Test (`e2e/group-gate.spec.ts`):** `/` still shows the unscoped avatar
grid exactly as before (regression guard); a fresh group's slug shows the
gate, not the roster; correct secret unlocks it, wrong secret doesn't;
parent-login with valid creds but no child in the group shows the *exact
same* error text as invalid credentials (assert the string, not just the
status); "Onthouden" checked persists across a reload, unchecked doesn't;
a device trusted for group A still gets gated on group B (exercises
`trustGroup`'s merge behavior from step 2).

## Step 5 — Group invite creation (admin side)
**Files:** `app/src/routes/groups.ts`, new `app/src/routes/shared.ts`
(extract `baseUrl()` out of `admin.ts` — both files need it now), `app/
public/admin.html`, `app/src/client/admin/main.ts`.

`POST /api/admin/groups/:id/invites` — `{ childName, expiresInDays? }`,
`requireGroupAdmin`. Mirrors `admin.ts`'s existing `POST /api/admin/
invites` token/expiry generation exactly (`randomBytes(24).toString
("base64url")`, same expiry math), plus the `groupId`/`childName`
columns. Returns `{ token, childName, expiresAt, url }` where `url` points
at `/group-invite.html?token=...` (new page, see step 6). `GET /api/admin/
groups/:id/invites` lists them with the same derived pending/used/expired
status as parent invites (never a stored column). Admin UI: a "Kind
uitnodigen" mini-form on each group's admin view, reusing the existing
reveal-a-link markup pattern from the Invites tab.

**Test:** admin creates a group invite, sees the link with the child's
name attached; list shows correctly-derived status.

## Step 6 — Group invite accept flow
**Files:** new `app/public/group-invite.html`, new `app/src/client/
group-invite/main.ts`, `app/src/routes/groups.ts`, `app/package.json`
(`build:client` gets a fourth esbuild invocation, same pattern as the
other three).

**New page, not an extension of `register.ts`/`register.html`** — that
existing flow only ever proves "token is valid," with no login branch and
no child-linking step; conflating this multi-step flow onto it would make
`register.ts` responsible for behavior it wasn't designed for, and risks
the existing, working parent-invite flow. Keeping this fully separate
means `register.ts`/`register.html` need **zero changes**.

**Stap 1: Jouw account** (login or register — both reuse existing
endpoints, no parallel auth system):
- New parent: **new** `POST /api/group-invite/:token/register` (mirrors
  `register.ts`'s body/logic but validates against `groupInvites`, not
  `parentInvites` — separate token spaces, so `register.ts`'s existing
  endpoint genuinely can't be reused as-is here).
- Existing parent: reuses **`POST /api/parent/login` completely
  unmodified** (verified: it only checks credentials and calls
  `request.parentSession.set(...)`, returning JSON — it never redirects
  itself; today's client-side redirect-to-dashboard is `parent/main.ts`'s
  own choice after calling it, not baked into the endpoint). `group-
  invite/main.ts` calls this same endpoint and simply stays on the page
  afterward, proceeding straight to Stap 2 — satisfies "must land back in
  the same flow" with no new login endpoint needed. (Contrast with step
  4's gate parent-login, which is the opposite case and genuinely needs
  its own narrow endpoint, because *that* one must never set
  `parentSession`.)

**Stap 2: [child name]'s account** — new endpoints in `groups.ts`:
- `GET /api/group-invite/:token` — `{ valid, groupName, childName }`
  (mirrors `GET /api/register/:token`), validated via a new
  `findValidGroupInvite` helper (same `usedAt`/expiry logic as the
  existing `findValidInvite`, kept separate since it queries a different
  table).
- `GET /api/group-invite/:token/candidates` — (parentSession now set)
  fuzzy-matches `invite.childName` against that parent's existing children
  (simple case-insensitive word/substring match — the design doc is
  explicit that the human confirmation step is the real safety net, not
  algorithmic precision, so don't over-build this). Returns `{ bestMatch,
  otherChildren }`.
- `POST /api/group-invite/:token/accept` — `{ childId }` (confirm an
  existing match/pick) **or** `{ newChild: { avatarId, pin } }` (create),
  plus optional `displayName` for the collision-disambiguation resubmit.
  Runs a `hasNameCollisionInGroup(groupId, name, excludeChildId?)` check
  first per the design doc's step 5 — if the display name already exists
  among the group's *other current* members, returns `{ error:
  "name_collision", suggested: "Tim O." }` instead of completing, so the
  client can prompt and resubmit with `displayName` set. On success: adds/
  creates the `group_children` row, marks the invite used, calls
  `trustGroup(request, groupId)` (finishing an invite proves membership
  more thoroughly than either gate path — auto-trusting the device avoids
  immediately re-gating the parent right after they just finished setup),
  and returns `{ groupName, childName }` for the named success screen (not
  a silent redirect).

Client renders exactly the design doc's flow: labeled Stap 1/Stap 2,
explicit "Is dit [avatar] [naam]? Ja/Nee" confirmation (never auto-
applied), fallback checklist + "+ nieuw kind toevoegen" on decline/no
match, collision prompt only when triggered, named success screen.

**Test (`e2e/group-invite.spec.ts`):** new parent registers → empty
candidate list → creates a child → named success → child appears in the
group's admin roster (step 3's UI). Existing parent with a fuzzy match
logs in (assert no navigation to `/parent.html` mid-flow) → confirms → 
success; child now in `group_children` for this group *and* still in
their existing family/other groups. Existing parent declines the match →
falls through to manual picker. Two invites for same-named kids in one
group → second is prompted to disambiguate, resubmits, both appear
distinctly. Expired/used token shows the same invalid-invite state as
`register.html`'s equivalent.

## Step 7 — Roster management polish
**Files:** `app/src/client/admin/main.ts`/`admin.html` (wire the "verwijder
uit groep" button — the backend endpoint shipped in step 3), `app/e2e/
groups.spec.ts` (extend).

UI-only step, deliberately last: by now there's a real invite flow (step
6) to populate a roster through the actual UI, so this step's test is a
genuine "invite a child in, then remove them via the admin roster UI"
round trip instead of one that has to seed the roster by hand.

**Test:** invite a child in via step 6's flow, confirm they appear in the
admin roster, remove them, confirm they're gone from that group's roster
but their account/practice history/other group memberships are untouched.

Also covers **admin dashboard polish requested after initial review**:
- Groups admin-tab renders one collapsible section per group (relevant
  once a group admin manages more than one group — the `group_admins`
  join table from step 1 already supports this many-to-many without any
  schema change, so this is purely a rendering concern, not a data-model
  one).
- An "add" affordance at the top of each group's section (opens the
  step-5 invite-a-child form for that group).
- A "remove" action behind each roster row (the `DELETE .../children/:id`
  endpoint from step 3).
- Pending invites shown inline in the same roster list, not only in a
  separate invites list — e.g. "Tim (uitgenodigd)" as a distinct row style
  from an accepted member, sourced from step 5's invite list filtered to
  `status === "pending"`.
- A roster row a parent has removed (see the leave-a-group addition above)
  renders as "Tim (verwijderd door ouder)" rather than disappearing
  silently, distinct from both a pending invite and a normal member.

## Step 8 — Parent-facing group visibility
**Files:** `app/src/routes/parent.ts` (small addition to the existing
child-listing route, or a new `GET /api/parent/children/:id/groups`),
`app/src/client/parent/main.ts`, `app/public/parent.html`.

Read-only for now, per the "leave a group" decision above (the actual
*management* action — a parent removing their child from a group — is
step 7's `DELETE /api/parent/children/:id/groups/:groupId`, listed there
since it's part of the same roster-membership surface as the admin side).
This step is just the **display**: each child's card on the parent
dashboard shows which group(s) they currently belong to (transparency),
sourced from `group_children` joined through `parent_child` for
ownership-scoping (reuse `assertOwnsChild`'s pattern).

**Test:** a parent whose child is in a group sees it named on their
dashboard; a parent whose child isn't in any group sees no change from
today's card (regression guard for the ungrouped case).

## Explicitly deferred (raised during review, not blocking this plan)
- **A group having more than one admin** (e.g. a stand-in teacher) —
  the data model (step 1's `group_admins` join table) already supports
  this with zero schema change, but the *flow* for promoting a second
  parent to group-admin of an existing group isn't designed. Not needed
  for a group to function with its original single admin, so left for a
  later pass rather than blocking this plan.
- **Per-group challenges** on the group-admin dashboard — already listed
  as deferred in `doc/groups-design.md`; still not designed.

## Explicitly out of scope for this plan
Per `doc/groups-design.md`'s own "Deferred" section: dashboard accept/
decline (decided against, not just deferred — don't build it), per-group
challenges, public sticker/achievement visibility, and precise fuzzy-match
tuning beyond the simple case-insensitive word match in step 6.

## Verification
- Full `npm run test:e2e` suite green after each step, not just the new
  spec — steps 4 and 6 touch shared client/server code (`main.ts`,
  `server.ts`) that existing specs exercise.
- `npx tsc --noEmit` after every step.
- Manual pass after step 6: as a system_admin, create a group, generate a
  child invite, open it in a private window as a brand-new parent, and
  separately as an existing parent with a same-named child already on
  file — confirm both end on the correct named success screen, confirm
  the group's admin roster reflects both, and confirm that device is
  already trusted for the group afterward (no gate shown revisiting the
  slug) since finishing the invite auto-trusts per step 6.

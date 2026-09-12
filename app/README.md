# Tafeltikker app

Backend + frontend for Tafeltikker, built with Fastify + TypeScript.

## Development

```sh
npm install
npm run dev
```

Server listens on `http://localhost:3000` by default (see `.env.example`).
`GET /healthz` returns `{ "status": "ok" }` once it's up.

## Database

SQLite via Drizzle ORM. The DB file lives at `data/tafeltikker.sqlite` by
default (override with `DB_PATH`), and is created automatically — it's
gitignored, never committed.

```sh
npm run db:generate   # after changing src/db/schema.ts, writes a migration to drizzle/
npm run db:migrate    # applies pending migrations to DB_PATH
```

Run `db:migrate` once after `npm install` (and again after pulling new
migrations) before starting the server. `npm run db:seed` creates a first
parent account and two demo children (see `.env.example` for the credentials
it uses) — skips if the `parents` table isn't empty.

## Environment

See `.env.example` for all variables. Sensible defaults exist for local dev
(you can run `npm run dev` with no `.env` at all); `CHILD_SESSION_KEY` and
`PARENT_SESSION_KEY` should be set explicitly in production (e.g. via the
systemd unit's `EnvironmentFile`), otherwise a throwaway key is generated on
every process start and sessions won't survive a restart.

## Auth model

Two independent session cookies, `child_session` and `parent_session`, each
signed with their own key. `/api/child/**` routes only ever read/write
`child_session`; `/api/parent/**` and `/api/admin/**` routes only ever
read/write `parent_session` — the two cannot cross, verified by cross-session
curl checks during development.

### Parent roles

`parents.role` is one of:
- `parent` (default) — manages and sees only their own linked children.
- `user_admin` — manages *all* parent and child accounts (create via invite,
  reset any password, edit/reset-PIN any child) and sees every parent's
  feedback submissions in one place. Cannot see any child's practice stats —
  that stays between a child and their own linked parent(s).
- `system_admin` — everything `user_admin` can do, plus promoting a `parent`
  to `user_admin` (and back). `system_admin` itself is never grantable
  through the app — only set by `npm run db:seed` (the seeded account) or a
  direct DB edit, so there's always exactly one clear "owner" tier.

### Invite-based registration

There's no open signup. An admin generates a single-use, expiring invite
link from `/admin.html` (Uitnodigingen tab) and shares it manually — the app
never sends email. The new parent opens `/register.html?token=...`, which
validates the token via `GET /api/register/:token` before showing the form,
then `POST /api/register` creates their account (always role `parent`) and
logs them in.

## Parent portal & admin

The parent portal is a separate page (`/parent.html`, own bundle
`parent.js`) rather than a view inside the kid app, so the two never share
client-side state. Reached via the small icon in the corner of the kid app.
Log in with the account from `npm run db:seed` (or one created via an
invite). From there a parent can see per-child time practiced (today/week/
total), per-table accuracy, a 7-day accuracy trend, add children, edit a
child's name/avatar/PIN, and leave feedback.

`user_admin`/`system_admin` accounts see a "Beheer" link to `/admin.html`
(own bundle `admin.js`) — account administration and cross-parent feedback,
deliberately kept separate from `/parent.html` so admin duties never mix
with a specific family's own dashboard.

## Build

```sh
npm run build
npm start
```
